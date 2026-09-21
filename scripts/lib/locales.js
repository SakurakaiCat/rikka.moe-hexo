'use strict';

/**
 * Locale registry for the four blog editions.
 *
 * A post belongs to exactly one edition: its front matter `lang` field holds
 * the locale key below (`zh-cn` / `zh-tw` / `en` / `ja`). The same key names
 * the theme's `languages/<key>.yml` UI strings, so a page renders in the
 * language of the edition it belongs to.
 *
 * Wordings and browser-language patterns mirror the previous Astro site
 * (rikka.moe/src/data/locales.json) so returning visitors keep the same
 * edition they used before.
 */

const LOCALES = [
  {
    key: 'zh-cn',
    html_lang: 'zh-CN',
    display_name: '简体中文',
    hero_description: '写一点字，留一点光。',
    home_description: 'Akari 的简体中文首页，收录文章、片段与静下来的想法。',
    browserLangPatterns: ['zh', 'zh-cn', 'zh-cn-*', 'zh-sg', 'zh-sg-*', 'zh-hans', 'zh-hans-*'],
  },
  {
    key: 'zh-tw',
    html_lang: 'zh-TW',
    display_name: '繁體中文',
    hero_description: '寫一點字，留一點光。',
    home_description: 'Akari 的繁體中文首頁，收錄文章、片段與安靜下來的念頭。',
    browserLangPatterns: ['zh-tw', 'zh-tw-*', 'zh-hk', 'zh-hk-*', 'zh-mo', 'zh-mo-*', 'zh-hant', 'zh-hant-*'],
  },
  {
    key: 'en',
    html_lang: 'en',
    display_name: 'English',
    hero_description: 'Notes, fragments, and a little light left behind.',
    home_description: 'Akari in English: essays, fragments, and quiet thoughts collected in one place.',
    browserLangPatterns: ['en', 'en-*'],
  },
  {
    key: 'ja',
    html_lang: 'ja',
    display_name: '日本語',
    hero_description: '言葉の断片と、少しだけ残しておきたい光。',
    home_description: 'Akari の日本語版。文章の断片と思いつきを、静かに書き留めています。',
    browserLangPatterns: ['ja', 'ja-*'],
  },
];

// Edition served when the visitor's system language matches nothing.
const DEFAULT_LOCALE = 'en';

const LOCALE_KEYS = LOCALES.map((locale) => locale.key);

const LOCALE_BY_KEY = Object.fromEntries(LOCALES.map((locale) => [locale.key, locale]));

const PREFERENCE_KEY = 'akari_locale_preference';

function isLocaleKey(key) {
  return Object.prototype.hasOwnProperty.call(LOCALE_BY_KEY, key);
}

/** Locale key of a post/page, or null when it belongs to no edition. */
function localeKeyOf(doc) {
  const lang = doc && doc.lang;
  return isLocaleKey(lang) ? lang : null;
}

/** The edition a page renders in; falls back to the default edition. */
function localeOfPage(page) {
  return LOCALE_BY_KEY[localeKeyOf(page)] || LOCALE_BY_KEY[DEFAULT_LOCALE];
}

function homePath(key) {
  return `/${key}/`;
}

/** Path of `name` inside edition `key`, e.g. editionPath('en', 'archives/'). */
function editionPath(key, name) {
  return `/${key}/${name}`;
}

/** Config handed to the browser-side locale router. */
function routingConfig(rootAutoRedirect) {
  return {
    preferenceKey: PREFERENCE_KEY,
    defaultLocaleKey: DEFAULT_LOCALE,
    defaultLocaleHomePath: homePath(DEFAULT_LOCALE),
    rootAutoRedirect: Boolean(rootAutoRedirect),
    locales: LOCALES.map((locale) => ({
      key: locale.key,
      homePath: homePath(locale.key),
      browserLangPatterns: locale.browserLangPatterns,
    })),
  };
}

module.exports = {
  LOCALES,
  LOCALE_KEYS,
  LOCALE_BY_KEY,
  DEFAULT_LOCALE,
  PREFERENCE_KEY,
  isLocaleKey,
  localeKeyOf,
  localeOfPage,
  homePath,
  editionPath,
  routingConfig,
};
