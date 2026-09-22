'use strict';

/**
 * Every route of every edition.
 *
 * Each edition owns its own slice of the site: home, archive, category index
 * and topic index, plus one page per category and per topic. A route only ever
 * lists posts whose `lang` is that edition's locale key, and the theme renders
 * the matching UI strings because Hexo's i18n picks `languages/<page.lang>.yml`.
 */

const pagination = require('hexo-pagination');
const { LOCALES, DEFAULT_LOCALE } = require('./lib/locales');
const taxonomy = require('./lib/taxonomy');

function postsOfEdition(locals, lang) {
  return locals.posts.filter((post) => post.lang === lang).sort('-date');
}

function namesOf(post, field) {
  const value = post[field];
  if (!value) return [];

  const items = typeof value.toArray === 'function' ? value.toArray() : [].concat(value);
  return items.map((item) => item.name);
}

/**
 * Group `posts` by taxonomy value, keeping the order the posts arrived in
 * (newest first) for the per-taxonomy listings.
 */
function groupBy(postList, field, keyOf) {
  const groups = new Map();
  const list = typeof postList.toArray === 'function' ? postList.toArray() : postList;

  for (const post of list) {
    for (const name of namesOf(post, field)) {
      const key = keyOf(name) || name;
      let group = groups.get(key);

      if (!group) {
        group = { key, name, posts: [] };
        groups.set(key, group);
      }

      group.posts.push(post);
    }
  }

  return groups;
}

/**
 * Homepage sections, one per category the edition actually publishes, in the
 * order the previous site used (Essays, Thoughts, Gallery, Moments).
 */
const HOME_SECTIONS = [
  { key: 'articles', limit: 5 },
  { key: 'thoughts', limit: 8 },
  { key: 'gallery', limit: 4 },
  { key: 'moments', limit: 6 },
];

const FIRST_IMAGE = /<img[^>]+src="([^"]+)"/i;

/**
 * Give a card an image: the post's first content image (the card's usual
 * face), otherwise the hero cover resolved by the before_generate filter
 * (see scripts/covers.js) — the same artwork the post page shows.
 */
function withCover(post) {
  if (post.content) {
    const match = FIRST_IMAGE.exec(post.content);
    if (match) post.cover_image = match[1];
  }
  return post;
}

function homeSections(groups, lang, Query) {
  return HOME_SECTIONS.filter(({ key }) => groups.has(key)).map(({ key, limit }) => {
    const group = groups.get(key);
    const posts = group.posts.slice(0, limit).map(withCover);

    return {
      key,
      name: taxonomy.categoryLabelForKey(key, lang),
      url: taxonomy.categoryPathForKey(key, lang),
      count: group.posts.length,
      posts: new Query(posts),
    };
  });
}

hexo.extend.generator.register('editions', function (locals) {
  const perPage = this.config.edition.per_page;
  // Theme partials iterate listings with warehouse Query methods (.each).
  const { Query } = this.model('Post');
  const routes = [];

  for (const locale of LOCALES) {
    const lang = locale.key;
    const posts = postsOfEdition(locals, lang);
    const categories = groupBy(posts, 'categories', taxonomy.categoryKeyFromName);

    // The homepage lists each category the edition publishes instead of one
    // chronological feed; the archive keeps the full time-ordered listing.
    routes.push({
      path: `${lang}/`,
      layout: 'index',
      data: { lang, show_hero: true, sections: homeSections(categories, lang, Query) },
    });

    routes.push(
      ...pagination(`${lang}/archives/`, posts, {
        perPage,
        layout: 'archive',
        data: { lang, archive: true },
      })
    );

    routes.push({
      path: `${lang}/categories/`,
      layout: 'post',
      data: {
        lang,
        type: 'categories',
        title: null,
        entries: [...categories.values()].map((group) => ({
          name: taxonomy.categoryLabelForKey(group.key, lang),
          url: taxonomy.categoryPathForKey(group.key, lang),
          count: group.posts.length,
        })),
      },
    });

    for (const group of categories.values()) {
      routes.push(
        ...pagination(`${lang}/categories/${taxonomy.categorySlugForKey(group.key, lang)}/`, new Query(group.posts), {
          perPage,
          layout: 'archive',
          data: { lang, category: taxonomy.categoryLabelForKey(group.key, lang) },
        })
      );
    }

    const topics = groupBy(posts, 'tags', taxonomy.topicKeyFromName);
    routes.push({
      path: `${lang}/topics/`,
      layout: 'post',
      data: {
        lang,
        type: 'tags',
        title: null,
        entries: [...topics.values()].map((group) => ({
          name: taxonomy.topicLabelForKey(group.key, lang),
          url: taxonomy.topicPathForKey(group.key, lang),
          count: group.posts.length,
        })),
      },
    });

    for (const group of topics.values()) {
      routes.push(
        ...pagination(`${lang}/topics/${taxonomy.topicSlugForKey(group.key, lang)}/`, new Query(group.posts), {
          perPage,
          layout: 'archive',
          data: { lang, tag: taxonomy.topicLabelForKey(group.key, lang) },
        })
      );
    }
  }

  return routes;
});

/**
 * The root page is the entry point: it shows the edition chooser and hands
 * over to the visitor's preferred edition (browser language, or their last
 * explicit choice), falling back to the default edition.
 */
hexo.extend.generator.register('edition-entry', function () {
  const chooser = {
    layout: 'index',
    data: { show_locale_chooser: true, show_hero: true, lang: DEFAULT_LOCALE },
  };

  return [
    { path: 'index.html', ...chooser, data: { ...chooser.data, root_auto_redirect: true } },
    { path: 'languages/', ...chooser },
  ];
});
