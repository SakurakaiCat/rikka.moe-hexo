'use strict';

/**
 * Render the markdown inside the AI summary callout.
 *
 * A summary is stored as a raw `<div class="ai-summary">` block at the top of a
 * post, and markdown leaves raw HTML blocks untouched — so the `**strong**`
 * the summaries are written with reached the page as literal asterisks. Each
 * block is rendered through the post renderer (the same marked instance the
 * body uses, so paragraphs, lists and links match the rest of the post) and
 * swapped in.
 *
 * Emphasis is promoted to <strong>/<em> before that pass. The summaries are
 * written by hand and every `**…**` in them is meant as emphasis, but
 * CommonMark's flanking rules — built around Latin text — reject the pairs
 * they contain: `**「大学生活 Galgame」**` after a CJK character, or a `**`
 * closed right before `。`. Rendering them as written leaves visible asterisks
 * in the card.
 */

const SUMMARY_BLOCK = /(<div class="ai-summary">)([\s\S]*?)(<\/div>)/g;

const STRONG = /\*\*(?=\S)([^*\n]+?)(?<=\S)\*\*/g;
const EMPHASIS = /(?<!\*)\*(?=\S)([^*\n]+?)(?<=\S)\*(?!\*)/g;

function emphasize(text) {
  return text.replace(STRONG, '<strong>$1</strong>').replace(EMPHASIS, '<em>$1</em>');
}

hexo.extend.filter.register('after_post_render', function (data) {
  if (!data.content || !data.content.includes('ai-summary')) return data;

  data.content = data.content.replace(SUMMARY_BLOCK, (block, open, body, close) => {
    let html;
    try {
      html = String(hexo.render.renderSync({ text: emphasize(body), engine: 'md' }));
    } catch (e) {
      hexo.log.w(`ai-summary: could not render a summary as markdown: ${e.message}`);
      return block;
    }
    return open + html.trim() + close;
  });

  return data;
});
