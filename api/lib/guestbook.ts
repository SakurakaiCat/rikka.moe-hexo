import {
  GUESTBOOK_CONTENT_MAX_LENGTH,
  GUESTBOOK_EMAIL_MAX_LENGTH,
  GUESTBOOK_MAX_BODY_BYTES,
  GUESTBOOK_NICKNAME_MAX_LENGTH,
  GUESTBOOK_PAGE_SIZE,
  type GuestbookListResponse,
  type GuestbookPublicEntry,
  type GuestbookSubmitErrorResponse,
  type GuestbookSubmitSuccessResponse,
} from './guestbook-shared';
import { md5Hex } from './md5';

export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  run(): Promise<{ success: boolean }>;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results?: T[] }>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
}

export interface GuestbookEnv {
  DB: D1DatabaseLike;
  GUESTBOOK_HASH_SALT?: string;
}

export type GuestbookContext = {
  request: Request;
  env: GuestbookEnv;
};

type RawGuestbookPayload = {
  nickname?: unknown;
  email?: unknown;
  content?: unknown;
  website?: unknown;
};

type GuestbookRow = {
  id: number;
  nickname: string;
  content: string;
  created_at: string;
  email_hash: string | null;
  fingerprint_hash: string;
};

type SanitizedSubmission = {
  nickname: string;
  email: string | null;
  emailHash: string | null;
  content: string;
  contentHash: string;
  fingerprintHash: string;
  ipHash: string;
  uaHash: string | null;
  userAgent: string;
};

type ModerationDecision =
  | { action: 'rate_limited' }
  | { action: 'duplicate' }
  | {
      action: 'store';
      status: 'approved' | 'spam';
      riskScore: number;
      riskFlags: string[];
    };

const encoder = new TextEncoder();
const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};
const OPTIONS_HEADERS = {
  allow: 'GET, POST, OPTIONS',
  'cache-control': 'no-store',
};
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LINK_PATTERN = /\bhttps?:\/\/[^\s]+/gi;
const DOMAIN_PATTERN =
  /\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|co|cc|top|xyz|site|online|dev|app|link|me|info|cn|ru|uk|jp)\b/gi;
const CONTACT_PATTERN =
  /\b(telegram|whatsapp|wechat|discord|qq|vx|line|skype|email|mailto|contact me|dm me|私聊|加我|联系我)\b/gi;
const PROMO_PATTERN =
  /\b(seo|backlink|traffic|ranking|rankings|guest post|do-follow|casino|betting|bet|forex|crypto|loan|viagra|promotion|sponsored)\b/gi;
const XSS_PATTERN =
  /<\s*script|<\s*iframe|<\s*style|<\s*svg|javascript:|data:text\/html|on[a-z]+\s*=|document\.cookie|window\.location|alert\s*\(/i;
const HARASSMENT_PATTERN =
  /\b(kill yourself|go die|fuck you|bitch|cunt|nigger|faggot|傻逼|煞笔|去死|废物|滚开|脑残)\b/gi;
const CONTROL_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const mergeHeaders = (init?: ResponseInit) => {
  const headers = new Headers(init?.headers);

  for (const [key, value] of Object.entries(JSON_HEADERS)) {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  }

  return headers;
};

const normalizePlainText = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL_PATTERN, '')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const normalizeNickname = (value: string) => normalizePlainText(value).replace(/\s+/g, ' ');

const normalizeEmail = (value: string) => value.trim().toLowerCase();

const normalizeForHash = (value: string) =>
  normalizePlainText(value).toLowerCase().replace(/\s+/g, ' ');

const readCount = (value: unknown) => {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
};

const addRisk = (riskFlags: string[], riskScore: number, flag: string, amount: number) => {
  if (!riskFlags.includes(flag)) {
    riskFlags.push(flag);
  }

  return riskScore + amount;
};

const countPatternMatches = (value: string, pattern: RegExp) => {
  const matches = value.match(pattern);
  return matches ? matches.length : 0;
};

const countUrls = (value: string) => {
  const results = new Set<string>();

  for (const match of value.matchAll(LINK_PATTERN)) {
    results.add(match[0].toLowerCase());
  }

  for (const match of value.matchAll(DOMAIN_PATTERN)) {
    results.add(match[0].toLowerCase());
  }

  return results.size;
};

const getSuspiciousCharacterRatio = (value: string) => {
  if (!value.length) {
    return 0;
  }

  const suspiciousCharacters = value.match(/[^\p{L}\p{N}\s.,!?'"()\-:;@]/gu)?.length ?? 0;
  return suspiciousCharacters / value.length;
};

const getClientIp = (request: Request) => {
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) {
    return cfIp.trim();
  }

  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim() ?? '0.0.0.0';
  }

  return '0.0.0.0';
};

const getHashSalt = (env: GuestbookEnv) => env.GUESTBOOK_HASH_SALT?.trim() || 'guestbook-local-salt';

const sha256Hex = async (value: string) => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const hashSensitiveValue = async (value: string, env: GuestbookEnv) =>
  sha256Hex(`${getHashSalt(env)}:${value}`);

const buildAvatarUrls = (emailHash: string | null, seed: string) => {
  const fallbackAvatarUrl = `/api/guestbook/avatar?seed=${encodeURIComponent(seed)}&size=96`;

  return {
    avatarUrl: emailHash
      ? `https://www.gravatar.com/avatar/${emailHash}?s=96&d=404&r=g`
      : fallbackAvatarUrl,
    fallbackAvatarUrl,
  };
};

const mapRowToEntry = (row: GuestbookRow): GuestbookPublicEntry => {
  const { avatarUrl, fallbackAvatarUrl } = buildAvatarUrls(row.email_hash, row.fingerprint_hash);

  return {
    id: row.id,
    nickname: row.nickname,
    content: row.content,
    createdAt: row.created_at,
    avatarUrl,
    fallbackAvatarUrl,
  };
};

const createGuestbookError = (code: GuestbookSubmitErrorResponse['code'], status: number) =>
  json<GuestbookSubmitErrorResponse>({ ok: false, code }, { status });

const createGuestbookSuccess = (entry: GuestbookPublicEntry, status = 201) =>
  json<GuestbookSubmitSuccessResponse>({ ok: true, entry }, { status });

const sanitizePayload = async (
  payload: RawGuestbookPayload,
  request: Request,
  env: GuestbookEnv,
): Promise<SanitizedSubmission | null> => {
  if (payload.website && String(payload.website).trim()) {
    return null;
  }

  const nickname = normalizeNickname(typeof payload.nickname === 'string' ? payload.nickname : '');
  const emailInput = typeof payload.email === 'string' ? payload.email : '';
  const email = emailInput ? normalizeEmail(emailInput) : '';
  const content = normalizePlainText(typeof payload.content === 'string' ? payload.content : '');

  if (!nickname || nickname.length > GUESTBOOK_NICKNAME_MAX_LENGTH) {
    return null;
  }

  if (email && (email.length > GUESTBOOK_EMAIL_MAX_LENGTH || !EMAIL_PATTERN.test(email))) {
    return null;
  }

  if (!content || content.length > GUESTBOOK_CONTENT_MAX_LENGTH) {
    return null;
  }

  const normalizedContentForHash = normalizeForHash(content);
  const normalizedNicknameForHash = normalizeForHash(nickname);
  const emailHash = email ? md5Hex(email) : null;
  const ipHash = await hashSensitiveValue(getClientIp(request), env);
  const userAgent = request.headers.get('user-agent')?.trim() ?? '';
  const uaHash = userAgent ? await hashSensitiveValue(userAgent, env) : null;

  return {
    nickname,
    email: email || null,
    emailHash,
    content,
    contentHash: await sha256Hex(normalizedContentForHash),
    fingerprintHash: await sha256Hex(`${normalizedNicknameForHash}\n${normalizedContentForHash}`),
    ipHash,
    uaHash,
    userAgent,
  };
};

const moderateSubmission = async (
  db: D1DatabaseLike,
  submission: SanitizedSubmission,
): Promise<ModerationDecision> => {
  const riskFlags: string[] = [];
  let riskScore = 0;
  const combined = `${submission.nickname}\n${submission.content}`;
  const normalized = combined.toLowerCase();
  const urlCount = countUrls(combined);
  const now = new Date();
  const shortWindow = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
  const longWindow = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  const duplicate = await db
    .prepare(
      `
        SELECT id
        FROM guestbook_entries
        WHERE content_hash = ?
           OR fingerprint_hash = ?
        LIMIT 1
      `,
    )
    .bind(submission.contentHash, submission.fingerprintHash)
    .first<{ id: number }>();

  if (duplicate) {
    return { action: 'duplicate' };
  }

  const recentShortWindow = await db
    .prepare(
      `
        SELECT COUNT(*) AS total
        FROM guestbook_entries
        WHERE ip_hash = ?
          AND created_at >= ?
      `,
    )
    .bind(submission.ipHash, shortWindow)
    .first<{ total: number | string }>();

  const recentLongWindow = await db
    .prepare(
      `
        SELECT COUNT(*) AS total
        FROM guestbook_entries
        WHERE ip_hash = ?
          AND created_at >= ?
      `,
    )
    .bind(submission.ipHash, longWindow)
    .first<{ total: number | string }>();

  const shortCount = readCount(recentShortWindow?.total);
  const longCount = readCount(recentLongWindow?.total);

  if (shortCount >= 3 || longCount >= 8) {
    return { action: 'rate_limited' };
  }

  if (shortCount >= 2) {
    riskScore = addRisk(riskFlags, riskScore, 'recent_burst', 35);
  }

  if (longCount >= 5) {
    riskScore = addRisk(riskFlags, riskScore, 'hourly_burst', 25);
  }

  if (XSS_PATTERN.test(combined)) {
    riskScore = addRisk(riskFlags, riskScore, 'xss_payload', 100);
  }

  if (urlCount >= 3) {
    riskScore = addRisk(riskFlags, riskScore, 'multi_link_spam', 80);
  } else if (urlCount === 2) {
    riskScore = addRisk(riskFlags, riskScore, 'multi_link_spam', 55);
  } else if (urlCount === 1) {
    riskScore = addRisk(riskFlags, riskScore, 'single_link', 20);
  }

  const contactMatches = countPatternMatches(normalized, CONTACT_PATTERN);
  if (contactMatches >= 2) {
    riskScore = addRisk(riskFlags, riskScore, 'contact_lure', 40);
  } else if (contactMatches === 1) {
    riskScore = addRisk(riskFlags, riskScore, 'contact_lure', 20);
  }

  const promoMatches = countPatternMatches(normalized, PROMO_PATTERN);
  if (promoMatches >= 2) {
    riskScore = addRisk(riskFlags, riskScore, 'promo_terms', 50);
  } else if (promoMatches === 1) {
    riskScore = addRisk(riskFlags, riskScore, 'promo_terms', 25);
  }

  const harassmentMatches = countPatternMatches(normalized, HARASSMENT_PATTERN);
  if (harassmentMatches >= 2) {
    riskScore = addRisk(riskFlags, riskScore, 'harassment', 80);
  } else if (harassmentMatches === 1) {
    riskScore = addRisk(riskFlags, riskScore, 'harassment', 45);
  }

  if (/(.)\1{6,}/u.test(combined)) {
    riskScore = addRisk(riskFlags, riskScore, 'character_flood', 25);
  }

  if (/(\b\w+\b)(?:\s+\1){3,}/iu.test(normalized)) {
    riskScore = addRisk(riskFlags, riskScore, 'word_flood', 30);
  }

  const suspiciousRatio = getSuspiciousCharacterRatio(combined);
  if (suspiciousRatio >= 0.3) {
    riskScore = addRisk(riskFlags, riskScore, 'symbol_noise', 25);
  }

  if (submission.content.length < 8) {
    riskScore = addRisk(riskFlags, riskScore, 'too_short', 15);
  }

  if (!submission.userAgent) {
    riskScore = addRisk(riskFlags, riskScore, 'missing_user_agent', 10);
  }

  if (/curl|python|java|go-http-client|libwww-perl|httpclient/i.test(submission.userAgent)) {
    riskScore = addRisk(riskFlags, riskScore, 'automation_user_agent', 15);
  }

  return {
    action: 'store',
    status: riskScore >= 50 ? 'spam' : 'approved',
    riskScore,
    riskFlags,
  };
};

export const json = <T>(body: T, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: mergeHeaders(init),
  });

export const optionsResponse = () =>
  new Response(null, {
    status: 204,
    headers: OPTIONS_HEADERS,
  });

export const parseCursor = (request: Request) => {
  const cursor = new URL(request.url).searchParams.get('cursor');
  if (!cursor) {
    return null;
  }

  const parsed = Number.parseInt(cursor, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const listGuestbookEntries = async (db: D1DatabaseLike, cursor: number | null) => {
  const statement = cursor
    ? db
        .prepare(
          `
            SELECT id, nickname, content, created_at, email_hash, fingerprint_hash
            FROM guestbook_entries
            WHERE status = 'approved'
              AND id < ?
            ORDER BY id DESC
            LIMIT ?
          `,
        )
        .bind(cursor, GUESTBOOK_PAGE_SIZE + 1)
    : db
        .prepare(
          `
            SELECT id, nickname, content, created_at, email_hash, fingerprint_hash
            FROM guestbook_entries
            WHERE status = 'approved'
            ORDER BY id DESC
            LIMIT ?
          `,
        )
        .bind(GUESTBOOK_PAGE_SIZE + 1);

  const { results = [] } = await statement.all<GuestbookRow>();
  const hasMore = results.length > GUESTBOOK_PAGE_SIZE;
  const sliced = hasMore ? results.slice(0, GUESTBOOK_PAGE_SIZE) : results;

  const response: GuestbookListResponse = {
    entries: sliced.map(mapRowToEntry),
    nextCursor: hasMore ? sliced[sliced.length - 1]?.id ?? null : null,
  };

  return json(response);
};

const readJsonPayload = async (request: Request): Promise<RawGuestbookPayload | null> => {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return null;
  }

  const contentLength = request.headers.get('content-length');
  if (contentLength && Number.parseInt(contentLength, 10) > GUESTBOOK_MAX_BODY_BYTES) {
    return null;
  }

  const bodyText = await request.text();
  if (encoder.encode(bodyText).byteLength > GUESTBOOK_MAX_BODY_BYTES) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return null;
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }

  return parsed as RawGuestbookPayload;
};

export const submitGuestbookEntry = async (request: Request, env: GuestbookEnv) => {
  const payload = await readJsonPayload(request);
  if (!payload) {
    return createGuestbookError('invalid_input', 400);
  }

  const submission = await sanitizePayload(payload, request, env);
  if (!submission) {
    return createGuestbookError('invalid_input', 400);
  }

  const moderation = await moderateSubmission(env.DB, submission);

  if (moderation.action === 'duplicate') {
    return createGuestbookError('duplicate', 409);
  }

  if (moderation.action === 'rate_limited') {
    return createGuestbookError('rate_limited', 429);
  }

  await env.DB
    .prepare(
      `
        INSERT INTO guestbook_entries (
          nickname,
          email_hash,
          content,
          content_hash,
          fingerprint_hash,
          status,
          risk_score,
          risk_flags,
          ip_hash,
          ua_hash
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    )
    .bind(
      submission.nickname,
      submission.emailHash,
      submission.content,
      submission.contentHash,
      submission.fingerprintHash,
      moderation.status,
      moderation.riskScore,
      JSON.stringify(moderation.riskFlags),
      submission.ipHash,
      submission.uaHash,
    )
    .run();

  if (moderation.status === 'spam') {
    return createGuestbookError('blocked', 400);
  }

  const inserted = await env.DB
    .prepare(
      `
        SELECT id, nickname, content, created_at, email_hash, fingerprint_hash
        FROM guestbook_entries
        WHERE fingerprint_hash = ?
          AND ip_hash = ?
          AND status = 'approved'
        ORDER BY id DESC
        LIMIT 1
      `,
    )
    .bind(submission.fingerprintHash, submission.ipHash)
    .first<GuestbookRow>();

  if (!inserted) {
    return createGuestbookError('server_error', 500);
  }

  return createGuestbookSuccess(mapRowToEntry(inserted));
};

const hsl = (hue: number, saturation: number, lightness: number) =>
  `hsl(${hue} ${saturation}% ${lightness}%)`;

const escapeSvg = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

export const generateIdenticonSvg = (seed: string, size = 96) => {
  const normalized = seed.toLowerCase().replace(/[^a-f0-9]/g, '') || '0'.repeat(32);
  const hue = Number.parseInt(normalized.slice(0, 2), 16) % 360;
  const accentHue = (hue + 38) % 360;
  const accent = hsl(accentHue, 62, 40);
  const background = hsl(hue, 58, 93);
  const foreground = hsl((hue + 12) % 360, 72, 58);
  const cellSize = size / 5;
  const rectangles: string[] = [];

  for (let row = 0; row < 5; row += 1) {
    for (let column = 0; column < 3; column += 1) {
      const index = row * 3 + column;
      const value = Number.parseInt(normalized.slice(index * 2, index * 2 + 2) || '00', 16);

      if (value % 2 !== 0) {
        continue;
      }

      const y = row * cellSize;
      const x = column * cellSize;
      rectangles.push(
        `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="${cellSize * 0.22}" fill="${foreground}" />`,
      );

      const mirrorColumn = 4 - column;
      if (mirrorColumn !== column) {
        rectangles.push(
          `<rect x="${mirrorColumn * cellSize}" y="${y}" width="${cellSize}" height="${cellSize}" rx="${cellSize * 0.22}" fill="${accent}" />`,
        );
      }
    }
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" role="img" aria-label="${escapeSvg(seed)}">
  <rect width="${size}" height="${size}" rx="${size * 0.18}" fill="${background}" />
  <g shape-rendering="crispEdges">
    ${rectangles.join('\n    ')}
  </g>
</svg>`;
};
