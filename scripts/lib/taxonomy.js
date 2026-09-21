'use strict';

/**
 * Localised taxonomy labels and URLs.
 *
 * Posts keep the category/topic names of the edition they were written in
 * (`长文`, `隨想`, `Thoughts`, `つぶやき`, ...). Categories normalise to a
 * stable key, and both categories and topics get a per-edition display name
 * and URL slug, so `/en/categories/essays/` and `/zh-cn/categories/长文/`
 * list the same kind of content in the language of their edition.
 *
 * Values mirror rikka.moe/src/lib/i18n.ts and rikka.moe/src/lib/topics.ts.
 */

const { DEFAULT_LOCALE } = require('./locales');

const CATEGORY_ALIASES = {
  articles: ['长文', '長文', 'Essays', 'Essay', 'Articles', '記事'],
  thoughts: ['随想', '隨想', 'Thoughts', 'Thought', 'つぶやき', '断章'],
  gallery: ['相册', '相冊', 'Gallery', 'ギャラリー'],
  moments: ['说说备份', '說說備份', '说说备注', '說說備註', 'Moments', 'モーメンツ'],
};

const CATEGORY_LABELS = {
  articles: { 'zh-cn': '长文', 'zh-tw': '長文', en: 'Essays', ja: '記事' },
  thoughts: { 'zh-cn': '随想', 'zh-tw': '隨想', en: 'Thoughts', ja: '断章' },
  gallery: { 'zh-cn': '相册', 'zh-tw': '相冊', en: 'Gallery', ja: 'ギャラリー' },
  moments: { 'zh-cn': '说说备份', 'zh-tw': '說說備份', en: 'Moments', ja: 'モーメンツ' },
};

const CATEGORY_SLUGS = {
  articles: { 'zh-cn': '长文', 'zh-tw': '長文', en: 'essays', ja: 'articles' },
  thoughts: { 'zh-cn': '随想', 'zh-tw': '隨想', en: 'thoughts', ja: 'thoughts' },
  gallery: { 'zh-cn': '相册', 'zh-tw': '相冊', en: 'gallery', ja: 'gallery' },
  moments: { 'zh-cn': '说说备份', 'zh-tw': '說說備份', en: 'moments', ja: 'moments' },
};

// Canonical topic keys are the Chinese names used in post front matter.
const TOPIC_NAMES = {
  生活: { 'zh-cn': '生活', 'zh-tw': '生活', en: 'Life', ja: '暮らし' },
  校园: { 'zh-cn': '校园', 'zh-tw': '校園', en: 'Campus', ja: 'キャンパス' },
  经济: { 'zh-cn': '经济', 'zh-tw': '經濟', en: 'Economy', ja: '経済' },
  社会: { 'zh-cn': '社会', 'zh-tw': '社會', en: 'Society', ja: '社会' },
  技术: { 'zh-cn': '技术', 'zh-tw': '技術', en: 'Tech', ja: '技術' },
  AI: { 'zh-cn': 'AI', 'zh-tw': 'AI', en: 'AI', ja: 'AI' },
  二次元: { 'zh-cn': '二次元', 'zh-tw': '二次元', en: 'Anime', ja: '二次元' },
  随笔: { 'zh-cn': '随笔', 'zh-tw': '隨筆', en: 'Reflections', ja: 'エッセイ' },
};

function pick(record, lang) {
  return record[lang] || record[DEFAULT_LOCALE] || null;
}

function categoryKeyFromName(name) {
  const normalized = String(name || '').trim().toLowerCase();
  if (!normalized) return null;

  for (const [key, aliases] of Object.entries(CATEGORY_ALIASES)) {
    if (aliases.some((alias) => alias.toLowerCase() === normalized)) return key;
  }
  return null;
}

function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function categoryLabelForKey(key, lang) {
  return pick(CATEGORY_LABELS[key], lang) || pick(CATEGORY_LABELS[key], DEFAULT_LOCALE) || key;
}

function categorySlugForKey(key, lang) {
  return pick(CATEGORY_SLUGS[key], lang) || pick(CATEGORY_SLUGS[key], DEFAULT_LOCALE) || slugify(key);
}

/** Localised category name; unknown categories keep their original name. */
function categoryLabel(name, lang) {
  const key = categoryKeyFromName(name);
  return key ? categoryLabelForKey(key, lang) : name;
}

function categorySlug(name, lang) {
  const key = categoryKeyFromName(name);
  return key ? categorySlugForKey(key, lang) : name;
}

function topicKeyFromName(name) {
  const normalized = String(name || '').trim().toLowerCase();
  if (!normalized) return null;

  for (const [key, names] of Object.entries(TOPIC_NAMES)) {
    if (Object.values(names).some((value) => value.toLowerCase() === normalized)) return key;
  }
  return null;
}

function topicLabelForKey(key, lang) {
  return pick(TOPIC_NAMES[key], lang) || pick(TOPIC_NAMES[key], DEFAULT_LOCALE) || key;
}

function topicSlugForKey(key, lang) {
  const label = topicLabelForKey(key, lang);
  // Non-Latin editions keep the label itself; English gets ascii slugs.
  return lang === 'en' ? slugify(label) : label;
}

/** Localised topic name; unknown topics keep their original name. */
function topicLabel(name, lang) {
  const key = topicKeyFromName(name);
  return key ? topicLabelForKey(key, lang) : name;
}

function topicSlug(name, lang) {
  const key = topicKeyFromName(name);
  return key ? topicSlugForKey(key, lang) : name;
}

function categoryIndexPath(lang) {
  return `/${lang}/categories/`;
}

function categoryPathForKey(key, lang) {
  return `${categoryIndexPath(lang)}${categorySlugForKey(key, lang)}/`;
}

function categoryPath(name, lang) {
  return `${categoryIndexPath(lang)}${categorySlug(name, lang)}/`;
}

function topicIndexPath(lang) {
  return `/${lang}/topics/`;
}

function topicPathForKey(key, lang) {
  return `${topicIndexPath(lang)}${topicSlugForKey(key, lang)}/`;
}

function topicPath(name, lang) {
  return `${topicIndexPath(lang)}${topicSlug(name, lang)}/`;
}

module.exports = {
  CATEGORY_ALIASES,
  CATEGORY_LABELS,
  TOPIC_NAMES,
  categoryKeyFromName,
  categoryLabelForKey,
  categoryLabel,
  categorySlugForKey,
  categorySlug,
  categoryIndexPath,
  categoryPathForKey,
  categoryPath,
  topicKeyFromName,
  topicLabelForKey,
  topicLabel,
  topicSlugForKey,
  topicSlug,
  topicIndexPath,
  topicPathForKey,
  topicPath,
};
