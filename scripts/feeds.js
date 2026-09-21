'use strict';

/**
 * One Atom feed per edition: /zh-cn/atom.xml, /en/atom.xml, ...
 *
 * A feed must not mix languages — subscribers of the English edition should
 * only receive English posts.
 */

const { generateAtomFeed } = require('feedsmith');
const { LOCALES } = require('./lib/locales');

const FEED_LIMIT = 20;

function siteOrigin(config) {
  return String(config.url || '').replace(/\/+$/, '');
}

hexo.extend.generator.register('edition-feeds', function (locals) {
  const { config } = this;
  const origin = siteOrigin(config);

  return LOCALES.map((locale) => {
    const homeUrl = `${origin}/${locale.key}/`;
    const feedUrl = `${homeUrl}atom.xml`;
    const posts = locals.posts
      .filter((post) => post.lang === locale.key)
      .sort('-date')
      .limit(FEED_LIMIT)
      .toArray();

    const entries = posts.map((post) => ({
      title: { value: post.title },
      id: post.permalink,
      links: [{ href: post.permalink, rel: 'alternate' }],
      summary: { value: post.description || post.excerpt || '', type: 'html' },
      content: { value: post.content ? post.content.replace(/[\x00-\x1F\x7F]/g, '') : '', type: 'html' },
      published: post.date.toDate(),
      updated: (post.updated || post.date).toDate(),
    }));

    const data = generateAtomFeed(
      {
        title: { value: `${config.title} — ${locale.display_name}` },
        id: homeUrl,
        subtitle: { value: locale.home_description },
        updated: entries.length ? entries[0].updated : new Date(),
        links: [
          { href: homeUrl, rel: 'alternate' },
          { href: feedUrl, rel: 'self', type: 'application/atom+xml' },
        ],
        generator: { text: 'Hexo', uri: 'https://hexo.io/' },
        icon: `${origin}/akari-logo.svg`,
        xml: { lang: locale.html_lang },
        entries,
      },
      { lenient: true }
    );

    return { path: `${locale.key}/atom.xml`, data };
  });
});
