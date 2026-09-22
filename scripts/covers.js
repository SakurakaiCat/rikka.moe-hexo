'use strict';

const { artFallbackForSlug } = require('./lib/art');

/**
 * Resolve the hero cover of every post before generation, so both the post
 * template (rendered between the title and the body) and the Open Graph tags
 * see the same image.
 *
 * Resolution order mirrors the previous Astro site: an explicit front-matter
 * field (cover_image / cover / thumbnail / banner / image), otherwise a Met
 * Museum public-domain painting picked from the post's URL slug (the last
 * permalink segment, which is the url_slug the Astro site hashed).
 *
 * Values are written back through Post.updateById: warehouse queries
 * materialize fresh document clones from the plain store on every run, so
 * plain property mutations on a query's documents would be lost.
 */
hexo.extend.filter.register('before_generate', async function () {
  const Post = this.model('Post');
  const posts = this.locals.get('posts').toArray();
  await Promise.all(posts.map(async (post) => {
    const slug = post.path.split('/').filter(Boolean).pop() || post.source;
    const cover =
      post.cover_image ||
      post.cover ||
      post.thumbnail ||
      post.banner ||
      post.image ||
      (await artFallbackForSlug(slug));
    const updates = { cover_image: cover };
    if (!post.cover_image_alt) {
      updates.cover_image_alt = post.title;
    }
    if (post.cover_image !== cover || !post.cover_image_alt) {
      await Post.updateById(post._id, updates);
    }
  }));
});
