'use strict';

/**
 * Theme helpers that make the cupertino theme edition-aware.
 *
 * Every page belongs to an edition (`page.lang` = locale key); these helpers
 * resolve that edition's UI strings, URLs and hero copy so one template set
 * can render four languages.
 */

const { LOCALES, DEFAULT_LOCALE, localeOfPage, localeKeyOf, routingConfig } = require('./lib/locales');
const taxonomy = require('./lib/taxonomy');

const crypto = require('node:crypto');
const fs = require('node:fs');
const nodePath = require('node:path');

/**
 * URL of a site asset with a content hash, e.g. `/js/comments.js?v=ab12cd34`.
 *
 * Static assets are served with a long cache lifetime (and Cloudflare caches
 * them too), so the hash is what makes a deploy take effect immediately.
 */
hexo.extend.helper.register('asset', function (assetPath) {
  let hash = '';

  try {
    hash = crypto.createHash('sha1').update(fs.readFileSync(nodePath.join(hexo.source_dir, assetPath))).digest('hex').slice(0, 8);
  } catch (error) {
    hexo.log.warn('asset(): cannot hash %s', assetPath);
  }

  return `${this.url_for(assetPath)}${hash ? `?v=${hash}` : ''}`;
});

const NAV_ITEMS = [
  { key: 'home', path: (lang) => `/${lang}/` },
  { key: 'archives', path: (lang) => `/${lang}/archives/` },
  { key: 'categories', path: (lang) => `/${lang}/categories/` },
  { key: 'topics', path: (lang) => `/${lang}/topics/` },
  { key: 'about', path: (lang) => `/${lang}/about/` },
];

const FOOTER_ITEMS = [
  { key: 'home', path: (lang) => `/${lang}/` },
  { key: 'archives', path: (lang) => `/${lang}/archives/` },
  { key: 'categories', path: (lang) => `/${lang}/categories/` },
  { key: 'topics', path: (lang) => `/${lang}/topics/` },
  { key: 'about', path: (lang) => `/${lang}/about/` },
  { key: 'guestbook', path: (lang) => `/${lang}/guestbook/` },
  { key: 'links', path: (lang) => `/${lang}/links/` },
  { name: 'RSS', path: (lang) => `/${lang}/atom.xml` },
];

// Standalone pages that exist only in some editions (`/en/projects/` but no
// `/ja/projects/`); linked only where they actually exist.
const FOOTER_PAGES = ['projects', 'books'];

function pageUrlFor(ctx, lang, name) {
  const { site } = ctx;
  if (!site || !site.pages) return null;

  // site.pages is a warehouse Query: `.find()` there is a condition lookup,
  // not Array#find, so filter and take the first match.
  const [match] = site.pages.filter((page) => {
    if (page.lang !== lang || !page.path) return false;
    const route = page.path.replace(/index\.html$/, '').replace(/\/+$/, '');
    return route === name || route === `${lang}/${name}`;
  }).toArray();

  return match ? `/${match.path.replace(/index\.html$/, '')}` : null;
}

function translator(ctx) {
  return hexo.theme.i18n.__([pageLocale(ctx).key, DEFAULT_LOCALE]);
}

function pageLocale(ctx) {
  return localeOfPage(ctx.page || {});
}

function pageLang(ctx) {
  return pageLocale(ctx).key;
}

hexo.extend.helper.register('locale_of_page', function () {
  return pageLocale(this);
});

/** All editions, for the language chooser. */
hexo.extend.helper.register('locale_list', function () {
  return LOCALES.map((locale) => ({ ...locale, homePath: `/${locale.key}/` }));
});

function routePathOf(path) {
  const trimmed = String(path || '').replace(/index\.html$/, '');
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

/** Same content in edition `key`, when a translation exists. */
function translationPath(ctx, key) {
  const { page, site } = ctx;
  if (!page.translation_key || !site) return null;

  const post = site.posts.filter((post) => post.lang === key && post.translation_key === page.translation_key).toArray()[0];
  if (post) return routePathOf(post.path);

  const doc = site.pages.filter((doc) => doc.lang === key && doc.translation_key === page.translation_key).toArray()[0];
  if (doc && doc.path) return routePathOf(doc.path);

  return null;
}

/** Editions for the appbar switcher: the same page when it exists, else that edition's home. */
hexo.extend.helper.register('language_options', function () {
  const current = localeKeyOf(this.page);

  return LOCALES.map((locale) => ({
    key: locale.key,
    display_name: locale.display_name,
    hreflang: locale.html_lang,
    url: translationPath(this, locale.key) || `/${locale.key}/`,
    current: locale.key === current,
  }));
});

/** The "自我介绍" section of the current edition (source/_data/intro.yml). */
hexo.extend.helper.register('personal_intro', function () {
  const data = this.site && this.site.data ? this.site.data.intro : null;
  if (!data) return null;

  return data[pageLang(this)] || data[DEFAULT_LOCALE] || null;
});

hexo.extend.helper.register('locale_html_lang', function () {
  return pageLocale(this).html_lang;
});

hexo.extend.helper.register('locale_hero_description', function () {
  const locale = pageLocale(this);
  return locale.hero_description || this.theme.hero.description;
});

/** True on pages that render the hero (edition homes, root, /languages/). */
hexo.extend.helper.register('is_homepage', function () {
  return Boolean(this.page && this.page.show_hero);
});

hexo.extend.helper.register('locale_nav', function () {
  const lang = pageLang(this);
  const __ = translator(this);

  return NAV_ITEMS.map((item) => ({
    name: item.name || __(item.key),
    url: item.path(lang),
  }));
});

hexo.extend.helper.register('locale_footer', function () {
  const lang = pageLang(this);
  const __ = translator(this);
  const extraPages = FOOTER_PAGES.map((name) => ({ name: __(name), url: pageUrlFor(this, lang, name) })).filter(
    (item) => item.url
  );

  return [
    {
      title: __('footer_site'),
      items: FOOTER_ITEMS.map((item) => ({
        name: item.name || __(item.key),
        url: item.path(lang),
      })).concat(extraPages),
    },
    {
      title: __('footer_editions'),
      items: LOCALES.map((locale) => ({
        name: locale.display_name,
        url: `/${locale.key}/`,
        preference: locale.key,
        current: locale.key === lang,
      })),
    },
  ];
});

/** Display name of a post's category in the current edition. */
hexo.extend.helper.register('localized_category', function (name) {
  return taxonomy.categoryLabel(name, pageLang(this));
});

hexo.extend.helper.register('localized_topic', function (name) {
  return taxonomy.topicLabel(name, pageLang(this));
});

hexo.extend.helper.register('category_url', function (name) {
  return taxonomy.categoryPath(name, pageLang(this));
});

hexo.extend.helper.register('topic_url', function (name) {
  return taxonomy.topicPath(name, pageLang(this));
});

/** Same content in the other editions, matched by `translation_key`. */
hexo.extend.helper.register('post_alternates', function () {
  const { page, site } = this;
  const lang = localeKeyOf(page);

  if (!lang || !page.translation_key || !site || !site.posts) return [];

  return site.posts
    .filter((post) => post.lang !== lang && post.translation_key === page.translation_key)
    .map((post) => {
      const locale = localeOfPage(post);
      return {
        lang: locale.key,
        hreflang: locale.html_lang,
        display_name: locale.display_name,
        url: post.path,
      };
    });
});

/**
 * Previous/next post within the same edition. Hexo's own `page.prev`/`page.next`
 * span every language, which would leak other editions into the navigation.
 */
hexo.extend.helper.register('edition_siblings', function () {
  const { page, site } = this;
  const lang = localeKeyOf(page);
  const empty = { prev: null, next: null };

  if (!lang || !site || !site.posts) return empty;

  const siblings = site.posts.filter((post) => post.lang === lang).sort('-date').toArray();
  const index = siblings.findIndex((post) => (post._id && page._id ? post._id === page._id : post.path === page.path));

  if (index < 0) return empty;

  return {
    prev: siblings[index - 1] || null,
    next: siblings[index + 1] || null,
  };
});

/**
 * Base URL of the blog API.
 *
 * Behind the same origin (nginx proxying /api) the relative path is correct.
 * While the site is served by `hexo server` on a port, the API lives on
 * `api.preview_port` of the same host, so browsers can reach it directly.
 */
hexo.extend.helper.register('api_base', function () {
  const { base = '/api', preview_port: previewPort } = this.config.api || {};

  if (!previewPort) return base;

  return `(location.port ? location.protocol + '//' + location.hostname + ':${previewPort}' : '') + ${JSON.stringify(base)}`;
});

/**
 * Inline routing config + the client script. Emitted in <head> so the root
 * page hands over to the preferred edition before the page paints.
 */
hexo.extend.helper.register('locale_routing', function () {
  const config = JSON.stringify(routingConfig(this.page && this.page.root_auto_redirect));

  return [
    `<script>window.__AKARI_LOCALE_ROUTING__ = ${config};</script>`,
    `<script src="${this.asset('js/akari-locale-routing.js')}"></script>`,
  ].join('\n');
});

/**
 * One-line description of a friend link (source/_data/links.yml), localized.
 * `descr` may be a plain string (all editions) or a per-language map; the
 * zh-cn/zh-tw editions share the `zh` entry and fall back to it, then to a
 * plain string entry named zh.
 */
hexo.extend.helper.register('friend_descr', function (link) {
  if (!link || !link.descr) return '';

  if (typeof link.descr === 'string') return link.descr;

  const lang = pageLang(this);
  const group = lang.startsWith('zh') ? 'zh' : lang;
  return String(link.descr[group] || link.descr.zh || '');
});
