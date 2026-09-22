'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * css_versioned('css/post') — like css(), but appends ?v=<hash>, where the
 * hash is the SHA-1 of the final (rendered) stylesheet content. The URL
 * changes whenever the CSS changes, so a visitor can never apply a cached
 * older stylesheet to newer markup (the plain /css/*.css URLs had no
 * versioning, which let a stale post.css break newly added markup).
 *
 * The asset generator (which owns the CSS routes) runs after
 * before_generate, so the hashes are precomputed here by rendering every
 * CSS source file the same way that generator will. The helper itself
 * stays synchronous.
 */
let hashes = {};

const CSS_EXTS = new Set(['.css', '.scss', '.sass']);

function collectCssSources(cssDir, out) {
  if (!fs.existsSync(cssDir)) return;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (CSS_EXTS.has(path.extname(entry.name))) {
        out.push(full);
      }
    }
  };
  walk(cssDir);
}

async function hashOf(sourceFile) {
  // Renderable sources (SCSS) go through the renderer; everything else is
  // copied as-is by the asset generator.
  if (hexo.render.isRenderable(sourceFile)) {
    const rendered = await hexo.render.render({ path: sourceFile, toString: true });
    return crypto.createHash('sha1').update(Buffer.from(String(rendered), 'utf8')).digest('hex').slice(0, 8);
  }
  return crypto.createHash('sha1').update(fs.readFileSync(sourceFile)).digest('hex').slice(0, 8);
}

hexo.extend.filter.register('before_generate', async function () {
  const next = {};
  // Each entry: [boxRoot, cssSubDir] where boxRoot is the directory the
  // router paths are relative to. Theme first, site second: on a
  // route-path collision the site wins (same precedence as the route box).
  const roots = [
    [path.join(hexo.theme_dir, 'source'), path.join(hexo.theme_dir, 'source', 'css')],
    [hexo.source_dir, path.join(hexo.source_dir, 'css')],
  ];
  for (const [sourceRoot, cssDir] of roots) {
    const files = [];
    collectCssSources(cssDir, files);
    for (const sourceFile of files) {
      // Relative to the source root so the router prefix (css/) is kept.
      const rel = path.relative(sourceRoot, sourceFile).split(path.sep).join('/');
      const base = rel.slice(0, rel.length - path.extname(rel).length);
      const renderable = hexo.render.isRenderable(sourceFile);
      const routePath = renderable
        ? `${base}.${hexo.render.getOutput(sourceFile)}`
        : rel;
      try {
        next[routePath] = await hashOf(sourceFile);
      } catch (e) {
        hexo.log.w(`css_versioned: could not hash ${rel}: ${e.message}`);
      }
    }
  }
  hashes = next;
});

hexo.extend.helper.register('css_versioned', function (pathArg) {
  const file = String(pathArg).endsWith('.css') ? String(pathArg) : `${pathArg}.css`;
  const hash = hashes[file] || '';
  const href = this.url_for(hash ? `${file}?v=${hash}` : file);
  return `<link rel="stylesheet" href="${href}">\n`;
});
