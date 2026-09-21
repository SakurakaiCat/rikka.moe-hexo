import type { D1DatabaseLike } from './lib/analytics';
import {
  jsonResponse,
  optionsResponse,
  recordVisitAndGetStats,
} from './lib/analytics';
import {
  generateIdenticonSvg,
  listGuestbookEntries,
  parseCursor,
  submitGuestbookEntry,
} from './lib/guestbook';
import { fetchAllSponsors } from './lib/afdian';
import { md5Hex } from './lib/md5';

export interface ServerEnv {
  DB: D1DatabaseLike;
  ANALYTICS_HASH_SALT?: string;
  GUESTBOOK_HASH_SALT?: string;
  api_token?: string;
  API_TOKEN?: string;
  user_id?: string;
  USER_ID?: string;
  AifadianAPIToken?: string;
  AifadianUserID?: string;
  AIFADIAN_API_TOKEN?: string;
  AIFADIAN_USER_ID?: string;
  AFDIAN_API_TOKEN?: string;
  AFDIAN_USER_ID?: string;
  AFDIAN_TOKEN?: string;
  AFDIAN_USERID?: string;
  BOOK_KEYS?: string;
  PREMIUM_DOWNLOAD_URL?: string;
  SIGNING_SECRET?: string;
  NASA_API_KEY?: string;
}

// --- /api/analytics ---------------------------------------------------------

export const handleAnalyticsGet = async (request: Request, env: ServerEnv): Promise<Response> => {
  const { setCookie, ...body } = await recordVisitAndGetStats(request, env);
  const headers = setCookie ? { 'set-cookie': setCookie } : undefined;
  return jsonResponse(body, { headers });
};

export const handleAnalyticsOptions = () => optionsResponse();

// --- /api/page-views ---------------------------------------------------------

const PAGE_VIEW_POST_OPTIONS_HEADERS = {
  allow: 'POST, OPTIONS',
  'cache-control': 'no-store',
};

export const handlePageViewsOptions = () =>
  new Response(null, { status: 204, headers: PAGE_VIEW_POST_OPTIONS_HEADERS });

export const handlePageViewsPost = async (
  request: Request,
  db: D1DatabaseLike,
): Promise<Response> => {
  let paths: string[] = [];

  try {
    const body = (await request.json()) as { paths?: unknown[] } | null;
    if (Array.isArray(body?.paths)) {
      paths = body.paths.filter((p: unknown): p is string => typeof p === 'string' && p.length > 0);
    }
  } catch {
    return jsonResponse({ views: {} });
  }

  if (!paths.length) {
    return jsonResponse({ views: {} });
  }

  // SQLite binds up to 32k parameters; cap well under that and under the old
  // D1 999-parameter limit.
  paths = paths.slice(0, 100);

  const placeholders = paths.map(() => '?').join(', ');
  const result = await db.prepare(
    `SELECT path, COUNT(*) as views
     FROM visit_logs
     WHERE counted_as_pageview = 1 AND path IN (${placeholders})
     GROUP BY path`,
  )
    .bind(...paths)
    .all<{ path: string; views: number | string }>();

  const views: Record<string, number> = {};
  for (const row of result.results) {
    views[row.path] = typeof row.views === 'number'
      ? row.views
      : Number.parseInt(String(row.views), 10) || 0;
  }

  return jsonResponse({ views });
};

// --- /api/guestbook ----------------------------------------------------------

export const handleGuestbookListGet = (request: Request, db: D1DatabaseLike) =>
  listGuestbookEntries(db, parseCursor(request));

export const handleGuestbookSubmitPost = (request: Request, env: ServerEnv) =>
  submitGuestbookEntry(request, env);

export const handleGuestbookOptions = () => optionsResponse();

const parseAvatarSize = (value: string | null) => {
  if (!value) {
    return 96;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 96;
  }

  return Math.min(160, Math.max(48, parsed));
};

export const handleGuestbookAvatarGet = async (request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const rawSeed = url.searchParams.get('seed') ?? 'guestbook';
  const seed = rawSeed.slice(0, 128);
  const size = parseAvatarSize(url.searchParams.get('size'));
  const svg = generateIdenticonSvg(seed, size);

  return new Response(svg, {
    headers: {
      'content-type': 'image/svg+xml; charset=utf-8',
      'cache-control': 'public, max-age=31536000, immutable',
      'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
};

// --- /api/sponsors -----------------------------------------------------------

const SPONSORS_CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export const handleSponsorsOptions = () =>
  new Response(null, { status: 204, headers: SPONSORS_CORS_HEADERS });

const resolveAfdianSecret = (env: ServerEnv, name: 'AifadianAPIToken' | 'AifadianUserID'): string => {
  const candidates = name === 'AifadianAPIToken'
    ? [env.api_token, env.API_TOKEN, env.AifadianAPIToken, env.AIFADIAN_API_TOKEN, env.AFDIAN_API_TOKEN, env.AFDIAN_TOKEN]
    : [env.user_id, env.USER_ID, env.AifadianUserID, env.AIFADIAN_USER_ID, env.AFDIAN_USER_ID, env.AFDIAN_USERID];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  }
  return '';
};

const sponsorsJsonResponse = (
  body: unknown,
  init: { status?: number; cache?: string } = {},
) =>
  new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': init.cache ?? 'public, s-maxage=3600, stale-while-revalidate=86400',
      ...SPONSORS_CORS_HEADERS,
    },
  });

export const handleSponsorsGet = async (request: Request, env: ServerEnv): Promise<Response> => {
  const url = new URL(request.url);

  // Debug mode: list env keys and their presence (never their values).
  if (url.searchParams.get('debug') === '1') {
    const keys: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      keys[key] = value === undefined ? 'undefined' : typeof value === 'string' ? `string(${value.length})` : typeof value;
    }
    return sponsorsJsonResponse({ debug: true, keys }, { cache: 'no-store' });
  }

  const token = resolveAfdianSecret(env, 'AifadianAPIToken');
  const userId = resolveAfdianSecret(env, 'AifadianUserID');

  if (!token || !userId) {
    return sponsorsJsonResponse(
      { error: 'not_configured', message: 'Aifadian API credentials not configured' },
      { status: 500, cache: 'no-store' },
    );
  }

  try {
    const payload = await fetchAllSponsors(userId, token);
    return sponsorsJsonResponse(payload);
  } catch {
    return sponsorsJsonResponse(
      { error: 'upstream_failed' },
      { status: 502, cache: 'no-store' },
    );
  }
};

// --- /api/books ----------------------------------------------------------------

const BOOKS_CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
};

const BOOKS_COOKIE_NAME = 'book_auth';
const BOOKS_COOKIE_MAX_AGE_SEC = 1800;

const buildBooksToken = (timestamp: number, secret: string): string =>
  `${timestamp}:${md5Hex(`${timestamp}:${secret}`)}`;

const verifyBooksToken = (token: string, secret: string, maxAgeSec: number): boolean => {
  const [tsRaw, sig] = token.split(':');
  if (!tsRaw || !sig) return false;
  const ts = Number.parseInt(tsRaw, 10);
  if (Number.isNaN(ts)) return false;
  if (Date.now() / 1000 - ts > maxAgeSec) return false;
  return md5Hex(`${ts}:${secret}`) === sig;
};

const booksJson = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...BOOKS_CORS_HEADERS,
      ...extra,
    },
  });

export const handleBooksVerifyOptions = () =>
  new Response(null, { status: 204, headers: BOOKS_CORS_HEADERS });

export const handleBooksVerifyPost = async (request: Request, env: ServerEnv): Promise<Response> => {
  const signingSecret = env.SIGNING_SECRET || env.BOOK_KEYS || '';

  let body: { key?: unknown };
  try {
    body = (await request.json()) as { key?: unknown };
  } catch {
    return booksJson({ success: false, message: '请求格式错误' }, 400);
  }

  const key = typeof body.key === 'string' ? body.key.trim() : '';
  if (!key) {
    return booksJson({ success: false, message: '请填写密钥' }, 400);
  }

  const allowedKeys = (env.BOOK_KEYS ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

  if (allowedKeys.length === 0) {
    return booksJson({ success: false, message: '验证服务暂未配置' }, 503);
  }

  if (!allowedKeys.includes(key)) {
    // Sleep a uniform 500 ms to prevent timing attacks that reveal key length.
    const { promise, resolve } = Promise.withResolvers<void>();
    setTimeout(resolve, 500);
    await promise;
    return booksJson({ success: false, message: '密钥无效，请检查后重试' }, 403);
  }

  const raw = (env.PREMIUM_DOWNLOAD_URL ?? '').trim();
  if (!raw) {
    return booksJson({ success: false, message: '下载链接暂未配置' }, 503);
  }

  // Parse download entries — return only labels, never URLs.
  const labels: string[] = [];

  raw.split(',').map((u) => u.trim()).filter(Boolean).forEach((url) => {
    if (url.includes('lanzn.com') || url.includes('lanzou')) {
      labels.push('蓝奏云下载（国内推荐）');
    } else if (url.includes('cloud.rikka.moe')) {
      labels.push('网盘下载');
    } else {
      labels.push('下载');
    }
  });

  const timestamp = Math.floor(Date.now() / 1000);
  const token = buildBooksToken(timestamp, signingSecret);

  const setCookie =
    `${BOOKS_COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api/books; Max-Age=${BOOKS_COOKIE_MAX_AGE_SEC}`;

  return booksJson(
    { success: true, labels },
    200,
    { 'set-cookie': setCookie },
  );
};

export const handleBooksDownloadGet = async (
  request: Request,
  env: ServerEnv,
  indexParam: string,
): Promise<Response> => {
  const signingSecret = env.SIGNING_SECRET || env.BOOK_KEYS || '';

  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.split(';').map((c) => c.trim()).find((c) => c.startsWith(`${BOOKS_COOKIE_NAME}=`));
  if (!match) {
    return new Response('Unauthorized', { status: 401 });
  }
  const token = match.slice(BOOKS_COOKIE_NAME.length + 1);
  if (!verifyBooksToken(token, signingSecret, BOOKS_COOKIE_MAX_AGE_SEC)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const indexStr = indexParam ?? '0';
  const index = Number.parseInt(indexStr, 10);
  if (Number.isNaN(index) || index < 0) {
    return new Response('Bad Request', { status: 400 });
  }

  const raw = (env.PREMIUM_DOWNLOAD_URL ?? '').trim();
  const urls = raw.split(',').map((u) => u.trim()).filter(Boolean);

  if (index >= urls.length) {
    return new Response('Not Found', { status: 404 });
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: urls[index],
      'Cache-Control': 'no-store',
    },
  });
};
