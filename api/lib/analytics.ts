type NullableString = string | null;

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  run(): Promise<{ success: boolean }>;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[]; success: boolean }>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
}

export interface AnalyticsEnv {
  DB: D1DatabaseLike;
  ANALYTICS_HASH_SALT?: string;
  GUESTBOOK_HASH_SALT?: string;
}

export type AnalyticsContext = {
  request: Request;
  env: AnalyticsEnv;
};

type CloudflareRequestCfLike = {
  country?: string | null;
  region?: string | null;
  regionCode?: string | null;
  city?: string | null;
  colo?: string | null;
};

type VisitorRow = {
  visitor_key: string;
  visitor_id: string | null;
  visit_count: number | string;
  pageview_count: number | string;
};

type StatsRow = {
  unique_visitors: number | string | null;
  page_views: number | string | null;
};

type RecordVisitResult = {
  ok: true;
  uniqueVisitors: number;
  pageViews: number;
  counted: boolean;
  deduped: boolean;
  ignored: boolean;
  setCookie?: string;
};

type VisitorIdentity = {
  visitorId: string;
  fallbackVisitorKey: string;
  cookieVisitorKey: string;
  currentVisitorKey: string;
  hasCookie: boolean;
  setCookie: boolean;
};

type RequestLocation = {
  country: NullableString;
  region: NullableString;
  city: NullableString;
  colo: NullableString;
};

const encoder = new TextEncoder();
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};
const OPTIONS_HEADERS = {
  allow: 'GET, OPTIONS',
  'cache-control': 'no-store',
};
const VISITOR_COOKIE_NAME = 'visitor_id';
const VISITOR_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;
const PAGEVIEW_DEDUPE_WINDOW_SECONDS = 8;
const STATIC_ASSET_PATTERN =
  /\.(?:avif|bmp|css|csv|gif|ico|jpe?g|js|json|map|mjs|mp3|mp4|ogg|otf|pdf|png|svg|txt|wav|webmanifest|webm|webp|woff2?|xml)$/i;
const BOT_USER_AGENT_PATTERN =
  /\b(bot|spider|crawler|slurp|fetcher|preview|monitor|pingdom|lighthouse|curl|wget|python-requests|go-http-client|java\/|okhttp|facebookexternalhit|discordbot|telegrambot|slackbot|whatsapp|skypeuripreview|linkedinbot|embedly|quora link preview)\b/i;
const PREFETCH_VALUES = new Set(['prefetch', 'prerender']);

const mergeHeaders = (init?: ResponseInit) => {
  const headers = new Headers(init?.headers);

  for (const [key, value] of Object.entries(JSON_HEADERS)) {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }

  return headers;
};

const readCount = (value: number | string | null | undefined) => {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

const normalizeHeaderValue = (value: string | null, maxLength = 512): NullableString => {
  if (!value) {
    return null;
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return null;
  }

  return normalized.slice(0, maxLength);
};

const normalizeFingerprintPart = (value: string | null) =>
  normalizeHeaderValue(value, 512)?.toLowerCase() ?? '';

const getHashSalt = (env: AnalyticsEnv) =>
  env.ANALYTICS_HASH_SALT?.trim() || env.GUESTBOOK_HASH_SALT?.trim() || 'analytics-local-salt';

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const hashSensitiveValue = async (value: string, env: AnalyticsEnv) =>
  sha256Hex(`${getHashSalt(env)}:${value}`);

const getClientIp = (request: Request) => {
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) {
    return cfIp.trim();
  }

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() || '0.0.0.0';
  }

  return '0.0.0.0';
};

const parseCookies = (header: string | null) => {
  if (!header) {
    return new Map<string, string>();
  }

  return new Map(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf('=');

        if (separator < 0) {
          return [part, ''] as const;
        }

        const key = part.slice(0, separator).trim();
        const value = part.slice(separator + 1).trim();
        return [key, decodeURIComponent(value)] as const;
      }),
  );
};

const serializeVisitorCookie = (request: Request, visitorId: string) => {
  const url = new URL(request.url);
  const secure = url.protocol === 'https:';
  const expiresAt = new Date(Date.now() + VISITOR_COOKIE_MAX_AGE * 1000).toUTCString();
  const parts = [
    `${VISITOR_COOKIE_NAME}=${encodeURIComponent(visitorId)}`,
    'Path=/',
    `Max-Age=${VISITOR_COOKIE_MAX_AGE}`,
    `Expires=${expiresAt}`,
    'HttpOnly',
    'SameSite=Lax',
  ];

  if (secure) {
    parts.push('Secure');
  }

  return parts.join('; ');
};

const normalizeTrackedPath = (request: Request) => {
  const requestUrl = new URL(request.url);
  const rawPath =
    requestUrl.searchParams.get('path') ??
    request.headers.get('x-rikka-path') ??
    request.headers.get('referer') ??
    '/';

  let pathname = rawPath;

  try {
    const parsed = rawPath.startsWith('http://') || rawPath.startsWith('https://')
      ? new URL(rawPath)
      : new URL(rawPath, requestUrl.origin);

    pathname = parsed.pathname;
  } catch {
    pathname = rawPath;
  }

  const normalized = pathname.split('?')[0]?.split('#')[0]?.trim() || '/';
  const withLeadingSlash = normalized.startsWith('/') ? normalized : `/${normalized.replace(/^\/+/, '')}`;
  const squashed = withLeadingSlash.replace(/\/{2,}/g, '/');

  if (squashed === '/') {
    return squashed;
  }

  if (STATIC_ASSET_PATTERN.test(squashed)) {
    return squashed;
  }

  return squashed.endsWith('/') ? squashed : `${squashed}/`;
};

const isPrefetchRequest = (request: Request) => {
  const purpose = request.headers.get('purpose')?.toLowerCase();
  const secPurpose = request.headers.get('sec-purpose')?.toLowerCase();
  const mozPurpose = request.headers.get('x-moz')?.toLowerCase();

  return (
    (purpose ? PREFETCH_VALUES.has(purpose) : false) ||
    (secPurpose ? PREFETCH_VALUES.has(secPurpose) : false) ||
    mozPurpose === 'prefetch'
  );
};

const shouldIgnoreRequest = (request: Request, pathname: string) => {
  if (request.method === 'HEAD') {
    return true;
  }

  if (request.method !== 'GET') {
    return true;
  }

  if (pathname.startsWith('/api/')) {
    return true;
  }

  if (STATIC_ASSET_PATTERN.test(pathname)) {
    return true;
  }

  if (isPrefetchRequest(request)) {
    return true;
  }

  const userAgent = request.headers.get('user-agent');
  if (userAgent && BOT_USER_AGENT_PATTERN.test(userAgent)) {
    return true;
  }

  return false;
};

const getRequestLocation = (request: Request): RequestLocation => {
  const cf = (request as Request & { cf?: CloudflareRequestCfLike }).cf;

  return {
    country:
      normalizeHeaderValue(cf?.country ?? null, 32) ??
      normalizeHeaderValue(request.headers.get('cf-ipcountry'), 32),
    region: normalizeHeaderValue(cf?.region ?? cf?.regionCode ?? null, 128),
    city: normalizeHeaderValue(cf?.city ?? null, 128),
    colo: normalizeHeaderValue(cf?.colo ?? null, 32),
  };
};

const getVisitorIdentity = async (request: Request, env: AnalyticsEnv) => {
  const cookies = parseCookies(request.headers.get('cookie'));
  const cookieVisitorId = normalizeHeaderValue(cookies.get(VISITOR_COOKIE_NAME) ?? null, 128);
  const visitorId = cookieVisitorId ?? crypto.randomUUID();
  const fallbackFingerprint = [
    normalizeFingerprintPart(getClientIp(request)),
    normalizeFingerprintPart(request.headers.get('user-agent')),
    normalizeFingerprintPart(request.headers.get('accept-language')),
  ].join('|');

  const [fallbackVisitorKey, cookieVisitorKey] = await Promise.all([
    hashSensitiveValue(`fallback:${fallbackFingerprint}`, env),
    hashSensitiveValue(`visitor:${visitorId}`, env),
  ]);

  return {
    visitorId,
    fallbackVisitorKey,
    cookieVisitorKey,
    currentVisitorKey: cookieVisitorId ? cookieVisitorKey : fallbackVisitorKey,
    hasCookie: Boolean(cookieVisitorId),
    setCookie: !cookieVisitorId,
  } satisfies VisitorIdentity;
};

const getVisitorByKey = (db: D1DatabaseLike, visitorKey: string) =>
  db
    .prepare(
      `
        SELECT visitor_key, visitor_id, visit_count, pageview_count
        FROM visitors
        WHERE visitor_key = ?
        LIMIT 1
      `,
    )
    .bind(visitorKey)
    .first<VisitorRow>();

const promoteFallbackVisitor = async (
  db: D1DatabaseLike,
  fallbackVisitorKey: string,
  cookieVisitorKey: string,
  visitorId: string,
) => {
  const fallbackVisitor = await getVisitorByKey(db, fallbackVisitorKey);
  if (!fallbackVisitor) {
    return null;
  }

  await db
    .prepare(
      `
        UPDATE visitors
        SET visitor_key = ?,
            visitor_id = ?
        WHERE visitor_key = ?
      `,
    )
    .bind(cookieVisitorKey, visitorId, fallbackVisitorKey)
    .run();

  await db
    .prepare(
      `
        UPDATE visit_logs
        SET visitor_key = ?,
            visitor_id = COALESCE(visitor_id, ?)
        WHERE visitor_key = ?
      `,
    )
    .bind(cookieVisitorKey, visitorId, fallbackVisitorKey)
    .run();

  return getVisitorByKey(db, cookieVisitorKey);
};

const getStats = async (db: D1DatabaseLike) => {
  const row = await db
    .prepare(
      `
        SELECT
          COUNT(*) AS unique_visitors,
          COALESCE(SUM(pageview_count), 0) AS page_views
        FROM visitors
      `,
    )
    .first<StatsRow>();

  return {
    uniqueVisitors: readCount(row?.unique_visitors),
    pageViews: readCount(row?.page_views),
  };
};

const buildDedupeKey = (visitorKey: string, pathname: string) => `${visitorKey}:${pathname.toLowerCase()}`;

const hasRecentCountedPageview = async (db: D1DatabaseLike, dedupeKeys: string[]) => {
  if (!dedupeKeys.length) {
    return false;
  }

  const cutoff = new Date(Date.now() - PAGEVIEW_DEDUPE_WINDOW_SECONDS * 1000).toISOString();
  const placeholders = dedupeKeys.map(() => '?').join(', ');
  const row = await db
    .prepare(
      `
        SELECT id
        FROM visit_logs
        WHERE dedupe_key IN (${placeholders})
          AND counted_as_pageview = 1
          AND visited_at >= ?
        ORDER BY id DESC
        LIMIT 1
      `,
    )
    .bind(...dedupeKeys, cutoff)
    .first<{ id: number | string }>();

  return Boolean(row);
};

const createVisitorRow = async (
  db: D1DatabaseLike,
  visitorKey: string,
  visitorId: string,
  ipAddress: string,
  country: NullableString,
  visitedAt: string,
) => {
  await db
    .prepare(
      `
        INSERT INTO visitors (
          visitor_key,
          visitor_id,
          first_seen_at,
          last_seen_at,
          first_ip,
          last_ip,
          first_country,
          last_country,
          visit_count,
          pageview_count
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
      `,
    )
    .bind(visitorKey, visitorId, visitedAt, visitedAt, ipAddress, ipAddress, country, country)
    .run();
};

const updateVisitorRow = async (
  db: D1DatabaseLike,
  visitorKey: string,
  visitorId: string,
  ipAddress: string,
  country: NullableString,
  visitedAt: string,
) => {
  await db
    .prepare(
      `
        UPDATE visitors
        SET visitor_id = COALESCE(visitor_id, ?),
            last_seen_at = ?,
            last_ip = ?,
            last_country = ?,
            visit_count = visit_count + 1
        WHERE visitor_key = ?
      `,
    )
    .bind(visitorId, visitedAt, ipAddress, country, visitorKey)
    .run();
};

const incrementVisitorPageviews = async (db: D1DatabaseLike, visitorKey: string) => {
  await db
    .prepare(
      `
        UPDATE visitors
        SET pageview_count = pageview_count + 1
        WHERE visitor_key = ?
      `,
    )
    .bind(visitorKey)
    .run();
};

const insertVisitLog = async (
  db: D1DatabaseLike,
  options: {
    pathname: string;
    visitorKey: string;
    visitorId: string;
    ipAddress: string;
    ipHash: string;
    userAgent: NullableString;
    acceptLanguage: NullableString;
    referer: NullableString;
    dedupeKey: string;
    visitedAt: string;
    location: RequestLocation;
    isUniqueVisitor: boolean;
    countedAsPageview: boolean;
    skipReason: NullableString;
  },
) => {
  await db
    .prepare(
      `
        INSERT INTO visit_logs (
          visited_at,
          path,
          ip_address,
          ip_hash,
          user_agent,
          accept_language,
          referer,
          country,
          region,
          city,
          colo,
          visitor_key,
          visitor_id,
          is_unique_visitor,
          counted_as_pageview,
          skip_reason,
          dedupe_key
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      options.visitedAt,
      options.pathname,
      options.ipAddress,
      options.ipHash,
      options.userAgent,
      options.acceptLanguage,
      options.referer,
      options.location.country,
      options.location.region,
      options.location.city,
      options.location.colo,
      options.visitorKey,
      options.visitorId,
      options.isUniqueVisitor ? 1 : 0,
      options.countedAsPageview ? 1 : 0,
      options.skipReason,
      options.dedupeKey,
    )
    .run();
};

export const jsonResponse = <T>(body: T, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: mergeHeaders(init),
  });

export const optionsResponse = () =>
  new Response(null, {
    status: 204,
    headers: OPTIONS_HEADERS,
  });

export const recordVisitAndGetStats = async (
  request: Request,
  env: AnalyticsEnv,
): Promise<RecordVisitResult> => {
  const pathname = normalizeTrackedPath(request);

  if (shouldIgnoreRequest(request, pathname)) {
    const stats = await getStats(env.DB);

    return {
      ok: true,
      uniqueVisitors: stats.uniqueVisitors,
      pageViews: stats.pageViews,
      counted: false,
      deduped: false,
      ignored: true,
    };
  }

  const visitedAt = new Date().toISOString();
  const ipAddress = getClientIp(request);
  const userAgent = normalizeHeaderValue(request.headers.get('user-agent'));
  const acceptLanguage = normalizeHeaderValue(request.headers.get('accept-language'));
  const referer = normalizeHeaderValue(request.headers.get('referer'));
  const location = getRequestLocation(request);
  const identity = await getVisitorIdentity(request, env);
  let visitorKey = identity.currentVisitorKey;
  let visitorRow = await getVisitorByKey(env.DB, visitorKey);

  if (!visitorRow && identity.hasCookie) {
    visitorRow = await promoteFallbackVisitor(
      env.DB,
      identity.fallbackVisitorKey,
      identity.cookieVisitorKey,
      identity.visitorId,
    );

    if (visitorRow) {
      visitorKey = identity.cookieVisitorKey;
    }
  }

  if (!visitorRow && identity.hasCookie) {
    visitorKey = identity.cookieVisitorKey;
  }

  const isUniqueVisitor = !visitorRow;

  if (isUniqueVisitor) {
    await createVisitorRow(env.DB, visitorKey, identity.visitorId, ipAddress, location.country, visitedAt);
  } else {
    await updateVisitorRow(env.DB, visitorKey, identity.visitorId, ipAddress, location.country, visitedAt);
  }

  const ipHash = await hashSensitiveValue(`ip:${ipAddress}`, env);
  // Check both the active visitor key and the fallback fingerprint key so that
  // a just-issued cookie does not immediately bypass the short dedupe window.
  const dedupeKeys = await Promise.all(
    [...new Set([visitorKey, identity.fallbackVisitorKey])].map((key) =>
      hashSensitiveValue(`dedupe:${buildDedupeKey(key, pathname)}`, env),
    ),
  );
  const dedupeKey = dedupeKeys[0];
  const deduped = await hasRecentCountedPageview(env.DB, dedupeKeys);
  const counted = !deduped;

  await insertVisitLog(env.DB, {
    pathname,
    visitorKey,
    visitorId: identity.visitorId,
    ipAddress,
    ipHash,
    userAgent,
    acceptLanguage,
    referer,
    dedupeKey,
    visitedAt,
    location,
    isUniqueVisitor,
    countedAsPageview: counted,
    skipReason: deduped ? 'deduped' : null,
  });

  if (counted) {
    await incrementVisitorPageviews(env.DB, visitorKey);
  }

  const stats = await getStats(env.DB);

  return {
    ok: true,
    uniqueVisitors: stats.uniqueVisitors,
    pageViews: stats.pageViews,
    counted,
    deduped,
    ignored: false,
    setCookie: identity.setCookie ? serializeVisitorCookie(request, identity.visitorId) : undefined,
  };
};
