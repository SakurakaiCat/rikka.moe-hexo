import type { D1DatabaseLike } from './lib/analytics';

const NASA_APOD_ENDPOINT = 'https://api.nasa.gov/planetary/apod';
const WINDOW_DAYS = 30;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
// Titles/explanations matching these terms read as a night sky; other imagery
// (planetary close-ups, eclipses, hardware) is deprioritised for the background.
const STARRY_KEYWORDS = [
  'galax',
  'nebul',
  'milky',
  'star',
  'cluster',
  'comet',
  'meteor',
  'supernova',
  'zodiacal',
  'constellation',
  'aurora',
];

export interface NasaApodCandidate {
  url: string;
  thumbnailUrl: string | null;
  title: string | null;
  copyright: string | null;
  date: string;
}

interface NasaApodCache {
  id: number;
  items_json: string;
  fetched_at: number;
  expires_at: number;
}

interface NasaApodApiResponse {
  media_type?: string;
  url?: string;
  thumbnail_url?: string;
  title?: string;
  copyright?: string;
  date?: string;
  explanation?: string;
}

const isStarry = (candidate: NasaApodCandidate) => {
  const haystack = `${candidate.title ?? ''} ${candidate.copyright ?? ''}`.toLowerCase();
  return STARRY_KEYWORDS.some((keyword) => haystack.includes(keyword));
};

const jsonResponse = (body: unknown, cacheControl: string) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheControl,
    },
  });

const fetchApodWindow = async (apiKey: string): Promise<NasaApodCandidate[]> => {
  const toDay = (offsetDays: number) =>
    new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);
  const endpoint =
    `${NASA_APOD_ENDPOINT}?api_key=${encodeURIComponent(apiKey)}` +
    `&start_date=${toDay(WINDOW_DAYS)}&end_date=${toDay(0)}&thumbs=true`;

  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`NASA APOD responded ${response.status}`);

  const payload = (await response.json()) as NasaApodApiResponse[];
  if (!Array.isArray(payload)) throw new Error('NASA APOD payload was not a list');

  const candidates: NasaApodCandidate[] = [];
  for (const entry of payload) {
    if (entry.media_type !== 'image' || !entry.url || !entry.date) continue;
    candidates.push({
      url: entry.url,
      thumbnailUrl: entry.thumbnail_url ?? null,
      title: entry.title ?? null,
      copyright: entry.copyright ?? null,
      date: entry.date,
    });
  }
  if (candidates.length === 0) throw new Error('NASA APOD window contained no images');
  return candidates;
};

/**
 * Rotates the background across the starry-sky candidates deterministically by
 * UTC day, so every visitor sees the same picture on a given day and the pool
 * refreshes as the APOD window slides.
 */
const pickCandidate = (candidates: NasaApodCandidate[]): NasaApodCandidate => {
  const starry = candidates.filter((candidate) => isStarry(candidate));
  const pool = starry.length > 0 ? starry : candidates;
  const dayNumber = Math.floor(Date.now() / 86_400_000);
  return pool[dayNumber % pool.length];
};

export const handleNasaApod = async (
  db: D1DatabaseLike,
  apiKey: string | undefined,
): Promise<Response> => {
  if (!apiKey) {
    return jsonResponse({ ok: false, error: 'not_configured' }, 'no-store');
  }

  try {
    const cache = await db.prepare('SELECT * FROM nasa_apod WHERE id = 1').first<NasaApodCache>();
    if (cache && cache.expires_at > Date.now()) {
      return jsonResponse(
        { ok: true, candidate: pickCandidate(JSON.parse(cache.items_json)) },
        'public, max-age=1800',
      );
    }

    const candidates = await fetchApodWindow(apiKey);
    const now = Date.now();
    if (cache) {
      await db
        .prepare('UPDATE nasa_apod SET items_json = ?, fetched_at = ?, expires_at = ? WHERE id = 1')
        .bind(JSON.stringify(candidates), now, now + CACHE_TTL_MS)
        .run();
    } else {
      await db
        .prepare('INSERT INTO nasa_apod (id, items_json, fetched_at, expires_at) VALUES (1, ?, ?, ?)')
        .bind(JSON.stringify(candidates), now, now + CACHE_TTL_MS)
        .run();
    }
    return jsonResponse(
      { ok: true, candidate: pickCandidate(candidates) },
      'public, max-age=1800',
    );
  } catch {
    // Upstream failed or rate-limited: keep serving the last known pool.
    try {
      const cache = await db.prepare('SELECT * FROM nasa_apod WHERE id = 1').first<NasaApodCache>();
      if (cache) {
        return jsonResponse(
          { ok: true, stale: true, candidate: pickCandidate(JSON.parse(cache.items_json)) },
          'public, max-age=1800',
        );
      }
    } catch {
      // fall through
    }
    return jsonResponse({ ok: false }, 'no-store');
  }
};
