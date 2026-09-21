import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { D1Database } from './d1';
import { applyMigrations } from './migrate';
import { handleNasaApod } from './nasa';
import {
  handleAnalyticsGet,
  handleAnalyticsOptions,
  handleBooksDownloadGet,
  handleBooksVerifyOptions,
  handleBooksVerifyPost,
  handleGuestbookAvatarGet,
  handleGuestbookListGet,
  handleGuestbookOptions,
  handleGuestbookSubmitPost,
  handlePageViewsOptions,
  handlePageViewsPost,
  handleSponsorsGet,
  handleSponsorsOptions,
  type ServerEnv,
} from './routes';

// PREVIEW_* wins over PORT/HOST because the preview launcher (tools/api-preview.sh)
// loads the live service's env file, which pins PORT=18080 / HOST=127.0.0.1.
const PORT = Number.parseInt(process.env.PREVIEW_PORT ?? process.env.PORT ?? '18080', 10);
const HOST = process.env.PREVIEW_HOST ?? process.env.HOST ?? '127.0.0.1';
const DB_PATH = process.env.DB_PATH ?? join(process.cwd(), 'data', 'rikka.db');
// The bundle lives in api/dist/, so the repo-relative migration folder is one level up.
const MIGRATIONS_DIR = process.env.MIGRATIONS_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

type RouteHandler = (request: Request, env: ServerEnv, params?: string) => Response | Promise<Response>;

interface Route {
  method: 'GET' | 'POST' | 'OPTIONS';
  pattern: RegExp;
  handler: RouteHandler;
}

const healthzResponse = (): Response =>
  new Response('ok\n', {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'no-store',
    },
  });

const ROUTES: Route[] = [
  { method: 'GET', pattern: /^\/healthz\/?$/, handler: () => healthzResponse() },
  { method: 'GET', pattern: /^\/api\/analytics\/?$/, handler: (request, env) => handleAnalyticsGet(request, env) },
  { method: 'OPTIONS', pattern: /^\/api\/analytics\/?$/, handler: () => handleAnalyticsOptions() },
  { method: 'POST', pattern: /^\/api\/page-views\/?$/, handler: (request, env) => handlePageViewsPost(request, env.DB) },
  { method: 'OPTIONS', pattern: /^\/api\/page-views\/?$/, handler: () => handlePageViewsOptions() },
  { method: 'GET', pattern: /^\/api\/guestbook\/list\/?$/, handler: (request, env) => handleGuestbookListGet(request, env.DB) },
  { method: 'POST', pattern: /^\/api\/guestbook\/submit\/?$/, handler: (request, env) => handleGuestbookSubmitPost(request, env) },
  { method: 'OPTIONS', pattern: /^\/api\/guestbook\/(list|submit)\/?$/, handler: () => handleGuestbookOptions() },
  { method: 'GET', pattern: /^\/api\/guestbook\/avatar\/?$/, handler: (request) => handleGuestbookAvatarGet(request) },
  { method: 'GET', pattern: /^\/api\/sponsors\/?$/, handler: (request, env) => handleSponsorsGet(request, env) },
  { method: 'OPTIONS', pattern: /^\/api\/sponsors\/?$/, handler: () => handleSponsorsOptions() },
  { method: 'POST', pattern: /^\/api\/books\/verify\/?$/, handler: (request, env) => handleBooksVerifyPost(request, env) },
  { method: 'OPTIONS', pattern: /^\/api\/books\/verify\/?$/, handler: () => handleBooksVerifyOptions() },
  { method: 'GET', pattern: /^\/api\/books\/download\/([^/]+)\/?$/, handler: (request, env, index) => handleBooksDownloadGet(request, env, index ?? '0') },
  { method: 'GET', pattern: /^\/api\/nasa-apod\/?$/, handler: (request, env) => handleNasaApod(env.DB, env.NASA_API_KEY) },
];

// CORS: the preview site is served from a different origin than this API, so
// every response reflects the caller's Origin (with credentials) instead of
// relying on the per-route static allow-origin headers.
const CORS_ALLOW_HEADERS = 'content-type, x-visitor-id';
const CORS_ALLOW_METHODS = 'GET, POST, OPTIONS';

const corsHeaders = (origin: string | undefined): Record<string, string> => ({
  'access-control-allow-origin': origin ?? '*',
  'access-control-allow-credentials': 'true',
  'access-control-allow-headers': CORS_ALLOW_HEADERS,
  'access-control-allow-methods': CORS_ALLOW_METHODS,
  vary: 'Origin',
});

const applyCors = (response: Response, origin: string | undefined): Response => {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders(origin))) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const readRequestBody = async (request: IncomingMessage): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
};

const buildWebRequest = (request: IncomingMessage, body: Buffer): Request => {
  // Preserve the public scheme/host so cookie Secure flags and URL-derived
  // logic match what nginx presents to the browser.
  const proto = (request.headers['x-forwarded-proto'] as string | undefined) ?? 'http';
  const host = request.headers.host ?? `${HOST}:${PORT}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }

  const init: RequestInit = {
    method: request.method ?? 'GET',
    headers,
  };
  if (body.length > 0) {
    init.body = new Uint8Array(body);
  }
  return new Request(`${proto}://${host}${request.url ?? '/'}`, init);
};

const sendWebResponse = async (nodeResponse: ServerResponse, response: Response): Promise<void> => {
  const headers = new Headers(response.headers);
  const setCookies = headers.getSetCookie();
  headers.delete('set-cookie');

  nodeResponse.statusCode = response.status;
  headers.forEach((value, key) => {
    nodeResponse.setHeader(key, value);
  });
  for (const cookie of setCookies) {
    nodeResponse.setHeader('set-cookie', cookie);
  }

  const payload = await response.arrayBuffer();
  nodeResponse.end(Buffer.from(payload));
};

const handleRequest = async (
  request: IncomingMessage,
  nodeResponse: ServerResponse,
  env: ServerEnv,
): Promise<void> => {
  const started = Date.now();
  const method = (request.method ?? 'GET').toUpperCase();

  try {
    const body = method === 'POST' || method === 'PUT' ? await readRequestBody(request) : Buffer.alloc(0);
    const webRequest = buildWebRequest(request, body);
    const origin = webRequest.headers.get('origin') ?? undefined;
    const pathname = new URL(webRequest.url).pathname;

    let response: Response | undefined;
    for (const route of ROUTES) {
      if (route.method !== method) continue;
      const match = pathname.match(route.pattern);
      if (!match) continue;
      response = await route.handler(webRequest, env, match[1]);
      break;
    }
    if (!response) {
      if (method === 'OPTIONS') {
        response = new Response(null, { status: 204 });
      } else {
        response = new Response(JSON.stringify({ error: 'not_found' }), {
          status: 404,
          headers: { 'content-type': 'application/json; charset=utf-8' },
        });
      }
    }

    response = applyCors(response, origin);

    await sendWebResponse(nodeResponse, response);
    console.log(`[rikka-api] ${method} ${request.url} ${response.status} ${Date.now() - started}ms`);
  } catch (error) {
    console.error(`[rikka-api] ${method} ${request.url} failed:`, error);
    if (!nodeResponse.headersSent) {
      nodeResponse.statusCode = 500;
      nodeResponse.setHeader('content-type', 'application/json; charset=utf-8');
      for (const [key, value] of Object.entries(corsHeaders(request.headers.origin))) {
        nodeResponse.setHeader(key, value);
      }
    }
    nodeResponse.end(JSON.stringify({ error: 'internal_error' }));
  }
};

const startServer = async (): Promise<Server> => {
  mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = D1Database.open(DB_PATH);
  const applied = await applyMigrations(db, MIGRATIONS_DIR);
  console.log(`[rikka-api] database ready at ${DB_PATH} (migrations applied: ${applied.join(', ') || 'none'})`);

  const env: ServerEnv = {
    DB: db,
    ANALYTICS_HASH_SALT: process.env.ANALYTICS_HASH_SALT,
    GUESTBOOK_HASH_SALT: process.env.GUESTBOOK_HASH_SALT,
    api_token: process.env.api_token,
    API_TOKEN: process.env.API_TOKEN,
    user_id: process.env.user_id,
    USER_ID: process.env.USER_ID,
    AifadianAPIToken: process.env.AifadianAPIToken,
    AifadianUserID: process.env.AifadianUserID,
    AIFADIAN_API_TOKEN: process.env.AIFADIAN_API_TOKEN,
    AIFADIAN_USER_ID: process.env.AIFADIAN_USER_ID,
    AFDIAN_API_TOKEN: process.env.AFDIAN_API_TOKEN,
    AFDIAN_USER_ID: process.env.AFDIAN_USER_ID,
    AFDIAN_TOKEN: process.env.AFDIAN_TOKEN,
    AFDIAN_USERID: process.env.AFDIAN_USERID,
    BOOK_KEYS: process.env.BOOK_KEYS,
    PREMIUM_DOWNLOAD_URL: process.env.PREMIUM_DOWNLOAD_URL,
    SIGNING_SECRET: process.env.SIGNING_SECRET,
    NASA_API_KEY: process.env.NASA_API_KEY,
  };

  const server = createServer((request, nodeResponse) => {
    void handleRequest(request, nodeResponse, env);
  });

  const shutdown = (): void => {
    console.log('[rikka-api] shutting down');
    server.close(() => {
      db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 5000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  server.listen(PORT, HOST, () => {
    console.log(`[rikka-api] listening on ${HOST}:${PORT}`);
  });
  return server;
};

void startServer();
