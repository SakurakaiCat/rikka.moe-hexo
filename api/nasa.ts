import type { D1DatabaseLike } from './lib/analytics';

// api.nasa.gov's APOD endpoint answers every key and every query shape
// (single date, start/end window, count) with a "NASA Science" logo
// placeholder since the science.nasa.gov migration — explanations still
// resolve, titles and image URLs do not — and DEMO_KEY is capped at 10
// req/h besides. The background pool therefore comes from the key-free NASA
// Image Library API, whose asset CDN also backs the new
// science.nasa.gov/apod/ hub. If that endpoint ever heals, the old pool
// logic (starry preference, day-deterministic pick, stale fallback) still
// applies unchanged.
const IMAGE_API_ENDPOINT = 'https://images-api.nasa.gov/search';
const IMAGE_QUERIES = ['nebula', 'galaxy', 'milky way', 'star cluster'];
const PAGE_SIZE = 30;
const MAX_CANDIDATES = 40;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
// Titles matching these terms read as a night sky; other imagery (planetary
// close-ups, eclipses, hardware) is deprioritised for the background.
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

interface ImageApiItem {
  data?: Array<{ nasa_id?: string; title?: string; date_created?: string }>;
  links?: Array<{ href?: string }>;
}

interface ImageApiSearchResponse {
  collection?: { items?: ImageApiItem[] };
}

interface ImageApiAssetResponse {
  collection?: { items?: Array<{ href?: string }> };
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

const fetchJson = async (url: string): Promise<unknown> => {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`${new URL(url).pathname} responded ${response.status}`);
  return response.json();
};

/** Manifest hrefs are http:// and asset sizes vary per item (~large is often
 * absent), so upgrade the scheme and take the best background-sized
 * rendition the item actually has. */
const resolveRenditions = async (
  nasaId: string,
): Promise<{ url: string; thumbnailUrl: string | null } | null> => {
  const payload = (await fetchJson(
    `https://images-api.nasa.gov/asset/${encodeURIComponent(nasaId)}`,
  )) as ImageApiAssetResponse;
  const hrefs = (payload.collection?.items ?? [])
    .map((item) => (item.href ?? '').replace(/^http:\/\//, 'https://'))
    .filter((href) => href.startsWith('https://images-assets.nasa.gov/'));
  const pick = (size: string) => hrefs.find((href) => href.includes(`~${size}.jpg`));
  const url = pick('large') ?? pick('medium') ?? pick('small') ?? pick('thumb');
  if (!url) return null;
  return { url, thumbnailUrl: pick('thumb') ?? pick('small') };
};

const fetchApodWindow = async (): Promise<NasaApodCandidate[]> => {
  const searches = await Promise.all(
    IMAGE_QUERIES.map(async (query) => {
      try {
        const endpoint =
          `${IMAGE_API_ENDPOINT}?q=${encodeURIComponent(query)}` +
          `&media_type=image&page_size=${PAGE_SIZE}`;
        const payload = (await fetchJson(endpoint)) as ImageApiSearchResponse;
        return payload.collection?.items ?? [];
      } catch {
        return []; // one failed query should not kill the whole refresh
      }
    }),
  );

  const seen = new Set<string>();
  const items: ImageApiItem[] = [];
  for (const entry of searches.flat()) {
    const id = entry.data?.[0]?.nasa_id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    items.push(entry);
    if (items.length >= MAX_CANDIDATES) break;
  }

  const candidates: NasaApodCandidate[] = [];
  const batch = 10;
  for (let i = 0; i < items.length; i += batch) {
    await Promise.all(
      items.slice(i, i + batch).map(async (entry) => {
        const data = entry.data?.[0];
        const id = data?.nasa_id;
        if (!id) return;
        const renditions = await resolveRenditions(id).catch(() => null);
        if (!renditions) return;
        if (renditions.url.includes('nasa-logo')) return;
        const fallbackThumb = entry.links?.[0]?.href?.replace(/^http:\/\//, 'https://') ?? null;
        candidates.push({
          url: renditions.url,
          thumbnailUrl: renditions.thumbnailUrl ?? fallbackThumb,
          title: data?.title ?? null,
          copyright: null,
          date: (data?.date_created ?? '').slice(0, 10),
        });
      }),
    );
  }
  if (candidates.length === 0) throw new Error('NASA image library returned no usable images');
  return candidates;
};

/**
 * Rotates the background across the starry-sky candidates deterministically by
 * UTC day, so every visitor sees the same picture on a given day and the pool
 * refreshes as the underlying search results evolve.
 */
const pickCandidate = (candidates: NasaApodCandidate[]): NasaApodCandidate => {
  const starry = candidates.filter((candidate) => isStarry(candidate));
  const pool = starry.length > 0 ? starry : candidates;
  const dayNumber = Math.floor(Date.now() / 86_400_000);
  return pool[dayNumber % pool.length];
};

export const handleNasaApod = async (db: D1DatabaseLike): Promise<Response> => {
  try {
    const cache = await db.prepare('SELECT * FROM nasa_apod WHERE id = 1').first<NasaApodCache>();
    if (cache && cache.expires_at > Date.now()) {
      return jsonResponse(
        { ok: true, candidate: pickCandidate(JSON.parse(cache.items_json)) },
        'public, max-age=1800',
      );
    }

    const candidates = await fetchApodWindow();
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
  } catch (error) {
    // Upstream failed: keep serving the last known pool.
    console.warn(
      '[rikka-api] nasa-apod refresh failed:',
      error instanceof Error ? error.message : error,
    );
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
