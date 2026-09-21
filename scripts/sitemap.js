'use strict';

/**
 * Sitemap built from the routes that actually exist.
 *
 * The generic sitemap plugin enumerates Hexo's global taxonomy models, which
 * would advertise `/tags/<name>/` and `/categories/<name>/` pages that no
 * longer exist — every taxonomy page is per edition now. Walking the route
 * table can only ever list URLs the site really serves.
 *
 * Posts carry `xhtml:link` alternates for their other editions (matched by
 * `translation_key`), plus an `x-default` pointing at the English version.
 */

const { DEFAULT_LOCALE, localeKeyOf, localeOfPage } = require('./lib/locales');

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Post documents expose an URL-shaped `path` (`/en/2026/05/20/slug/`) while
 * route entries are file-shaped (`en/2026/05/20/slug/index.html`); normalise
 * both to the same key so a route can be traced back to its post.
 */
function routeKey(value) {
  return String(value || '')
    .replace(/^\/+/, '')
    .replace(/index\.html$/, '')
    .replace(/\/+$/, '');
}

hexo.extend.filter.register('after_generate', function () {
  const origin = String(this.config.url || '').replace(/\/+$/, '');
  const posts = this.locals.get('posts').toArray();

  const byPath = new Map();
  const byTranslation = new Map();

  for (const post of posts) {
    byPath.set(routeKey(post.path), post);

    if (post.translation_key) {
      const group = byTranslation.get(post.translation_key) || [];
      group.push(post);
      byTranslation.set(post.translation_key, group);
    }
  }

  const entries = this.route
    .list()
    .filter((path) => /(^|\/)index\.html$/.test(path))
    .map((path) => {
      const post = byPath.get(routeKey(path));
      const group = post && post.translation_key ? byTranslation.get(post.translation_key) || [] : [];
      const alternates = group
        .map((translation) => ({
          hreflang: localeOfPage(translation).html_lang,
          href: translation.permalink,
        }))
        .sort((a, b) => a.hreflang.localeCompare(b.hreflang));
      const english = group.find((translation) => localeKeyOf(translation) === DEFAULT_LOCALE);

      return {
        loc: post ? post.permalink : new URL(path.replace(/index\.html$/, ''), `${origin}/`).toString(),
        lastmod: post ? (post.updated || post.date).toISOString() : null,
        alternates: post && post.translation_key
          ? alternates.concat([{ hreflang: 'x-default', href: (english || post).permalink }])
          : [],
      };
    })
    .sort((a, b) => a.loc.localeCompare(b.loc));

  const body = entries
    .map(({ loc, lastmod, alternates }) => {
      const links = alternates
        .map(({ hreflang, href }) => `    <xhtml:link rel="alternate" hreflang="${escapeXml(hreflang)}" href="${escapeXml(href)}"/>`)
        .join('\n');

      return [
        '  <url>',
        `    <loc>${escapeXml(loc)}</loc>`,
        lastmod ? `    <lastmod>${lastmod}</lastmod>` : null,
        links || null,
        '  </url>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  const xml = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    body,
    '</urlset>',
    '',
  ].join('\n');

  this.route.set('sitemap.xml', xml);
});
