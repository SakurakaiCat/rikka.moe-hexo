'use strict';

/**
 * Met Museum artwork fallback for post hero covers.
 *
 * Port of src/lib/art.ts from the previous Astro site: a post without an
 * explicit cover gets a public-domain painting, picked deterministically
 * from the post's URL slug, so a post always shows the same artwork.
 *
 * The pool is fetched from the MET collection API. Egress to that CDN is
 * flaky from this host, so the pool is cached on disk (art-pool.json at the
 * repo root, gitignored): a fresh cache is used without any network access,
 * a stale one is used when a live fetch fails.
 */

const { createHash } = require('crypto');
const fs = require('fs');
const path = require('path');

const MET_API_BASE = 'https://collectionapi.metmuseum.org/public/collection/v1';

/** Last resort when neither the API nor the cache yields a pool. */
const FALLBACK_IMAGE = '/images/profile/background.jpg';

const CACHE_FILE = path.join(__dirname, '..', '..', 'art-pool.json');
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const FETCH_CONCURRENCY = 8;

// In-process cache: `hexo server` regenerates often; the pool is resolved
// once per process. An empty pool is NOT cached, so a transient failure is
// retried on the next generate.
let _pool = null;

function readCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    if (raw && Array.isArray(raw.pool) && raw.pool.length) return raw;
  } catch {
    // no cache yet
  }
  return null;
}

function writeCache(pool) {
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ fetchedAt: Date.now(), pool }));
  } catch {
    // best effort — the in-process pool still works for this build
  }
}

async function fetchJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) return null;
  return res.json();
}

async function fetchObjectImage(objectID) {
  const data = await fetchJson(`${MET_API_BASE}/objects/${objectID}`);
  if (!data) return null;
  const imageUrl = data.primaryImageSmall || data.primaryImage || '';
  if (!imageUrl) return null;
  return { title: data.title || '', imageUrl };
}

async function fetchPoolFromApi() {
  let searchData = null;
  for (let attempt = 0; attempt < 2 && !searchData; attempt++) {
    try {
      searchData = await fetchJson(
        `${MET_API_BASE}/search?hasImages=true&q=painting&isPublicDomain=true`
      );
    } catch {
      // retry
    }
  }
  if (!searchData) return [];
  const objectIDs = searchData.objectIDs || [];
  if (!objectIDs.length) return [];

  // Bounded concurrency: hammering the flaky CDN with 100 parallel
  // connections makes failures much more likely.
  const results = new Array(objectIDs.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(FETCH_CONCURRENCY, objectIDs.length) },
    async () => {
      while (next < objectIDs.length) {
        const idx = next++;
        try {
          results[idx] = await fetchObjectImage(objectIDs[idx]);
        } catch {
          // skip this object
        }
      }
    }
  );
  await Promise.all(workers);
  return results.filter(Boolean);
}

async function ensurePool() {
  if (_pool) return _pool;

  const cache = readCache();
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    _pool = cache.pool;
    return _pool;
  }

  let pool = [];
  try {
    pool = await fetchPoolFromApi();
  } catch {
    pool = [];
  }

  if (pool.length) {
    _pool = pool;
    writeCache(pool);
  } else if (cache) {
    // API unreachable — a stale pool beats no pool.
    _pool = cache.pool;
  } else {
    _pool = null; // retry on the next generate
  }
  return _pool;
}

function hashSlug(slug) {
  const h = createHash('sha256').update(slug).digest();
  return h.readUInt32BE(0);
}

async function artFallbackForSlug(slug) {
  const pool = await ensurePool();
  if (!pool || !pool.length) return FALLBACK_IMAGE;
  const idx = hashSlug(slug) % pool.length;
  return pool[idx].imageUrl;
}

module.exports = { artFallbackForSlug, fetchPoolFromApi, writeCache, FALLBACK_IMAGE };
