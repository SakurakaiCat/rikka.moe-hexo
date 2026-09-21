#!/usr/bin/env python3
"""Migrate rikka.moe (Astro) content into this Hexo site.

- posts (articles/thoughts/gallery) -> source/_posts/<collection>/
  * original `permalink` kept, so URL structure /<lang>/<year>/<month>/<day>/<slug>/ is preserved
  * `topics` mapped to Hexo `tags`
  * file mtime preserved so `updated_option: mtime` keeps showing real dates
- pages -> source/<lang>/<page>/index.md
- static assets -> source/

Re-running it preserves the source mtime (so posts keep their real `updated`
dates), which means Hexo's cache can miss the rewrite: always follow a re-run
with `hexo clean` (or delete db.json) before generating.
"""
import html
import json
import os
import re
import shutil
import sys
from datetime import datetime
from pathlib import Path

SRC = Path('/root/rikka.moe')
DST = Path('/root/rikka.moe-hexo')

FM_RE = re.compile(r'^---\n(.*?)\n---\n', re.DOTALL)


def parse_fm(text):
    m = FM_RE.match(text)
    if not m:
        return {}, text
    fm_lines = m.group(1).split('\n')
    fm = {}
    # simple YAML subset: key: value, key: [a, b], lists via "- item", quoted values
    key = None
    for line in fm_lines:
        if re.match(r'^\s*-\s', line) and key:
            fm[key].append(line.strip()[1:].strip().strip('"\''))
            continue
        mk = re.match(r'^([A-Za-z_][\w-]*):\s*(.*)$', line)
        if mk:
            key = mk.group(1)
            val = mk.group(2).strip()
            if val.startswith('[') and val.endswith(']'):
                inner = val[1:-1].strip()
                fm[key] = [v.strip().strip('"\'') for v in inner.split(',')] if inner else []
            elif val == '':
                fm[key] = []  # may become a list via "- " continuation
            else:
                fm[key] = val.strip('"\'')
    return fm, text[m.end():]


def yaml_str(v):
    v = str(v)
    if re.match(r'^[\w\x80-\uffff@./ -]+$', v) and ':' not in v:
        return v
    return '"' + v.replace('\\', '\\\\').replace('"', '\\"') + '"'


def yaml_list(vs):
    return '[' + ', '.join(yaml_str(v) for v in vs) + ']'


def render_fm(fm):
    order = ['title', 'date', 'updated', 'description', 'keywords', 'permalink',
             'categories', 'tags', 'lang', 'lang_path', 'translation_key', 'layout',
             'comment', 'indexing', 'disable_search']
    out = []
    used = set()
    for k in order:
        if k not in fm:
            continue
        v = fm[k]
        used.add(k)
        if isinstance(v, list):
            if v:
                out.append(f'{k}: {yaml_list(v)}')
        else:
            out.append(f'{k}: {yaml_str(v)}')
    for k, v in fm.items():  # keep anything else verbatim
        if k not in used:
            out.append(f'{k}: {yaml_str(v)}')
    return '---\n' + '\n'.join(out) + '\n---\n'


def write_file(src: Path, dst: Path, fm: dict, body: str):
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(render_fm(fm) + body, encoding='utf-8')
    # preserve mtime so hexo's updated_option: mtime keeps real dates
    st = src.stat()
    os.utime(dst, (st.st_atime, st.st_mtime))


# Images the previous site hotlinked from an external host. They now live in
# this repository, so the posts reference the local copy.
ASSET_REWRITES = {
    'https://i.mji.rip/2026/05/21/4f841a28ff3ae11eeae376df57c4b7be.jpeg':
        '/images/gallery/night-flight/night-flight.jpeg',
}


def rewrite_assets(body: str) -> str:
    for remote, local in ASSET_REWRITES.items():
        body = body.replace(remote, local)
    return body


def migrate_posts():
    count = 0
    for coll in ['articles', 'thoughts', 'gallery']:
        for f in sorted((SRC / 'src/content/posts' / coll).glob('*.md')):
            fm, body = parse_fm(f.read_text(encoding='utf-8'))
            if 'permalink' not in fm:
                print(f'WARN no permalink: {f.name}', file=sys.stderr)
                continue
            fm['permalink'] = fm['permalink'].strip()
            if 'title' not in fm:
                print(f'WARN no title: {f.name}', file=sys.stderr)
                continue
            # topics -> tags
            topics = fm.get('topics') or []
            if isinstance(topics, str):
                topics = [topics]
            if topics and not fm.get('tags'):
                fm['tags'] = topics
            fm.pop('topics', None)
            fm.pop('url_slug', None)
            fm.pop('alias', None)
            fm.pop('slug', None)
            fm.pop('layout', None)  # use theme post layout
            # The locale key drives both the edition a post belongs to and the
            # UI language Hexo renders it with (themes/cupertino/languages/<key>.yml).
            fm['lang'] = fm.get('lang_path', 'zh-cn')
            fm.pop('lang_path', None)
            dst = DST / 'source/_posts' / coll / f.name
            write_file(f, dst, fm, rewrite_assets(body))
            count += 1
    return count


# Copy for the read-only legacy message-board archive. Source of truth is the
# old Astro site's src/lib/i18n.ts (group `guestbook`); the archive note keeps
# the wording this site already shipped, which differs only in punctuation.
GUESTBOOK_COPY = {
    'zh-cn': {
        'loading': '正在加载留言…',
        'empty': '还没有留言。',
        'loadMore': '加载更多',
        'archiveTitle': '历史留言',
        'archiveNote': '以下旧版留言板的存档，已转为只读；新留言请写在下方评论区。',
        'errorServer': '服务暂时不可用，请稍后再试。',
    },
    'zh-tw': {
        'loading': '正在載入留言…',
        'empty': '還沒有留言。',
        'loadMore': '載入更多',
        'archiveTitle': '歷史留言',
        'archiveNote': '以下為舊版留言板的存檔，已轉為唯讀；新留言請寫在下方評論區。',
        'errorServer': '服務暫時不可用，請稍後再試。',
    },
    'en': {
        'loading': 'Loading messages…',
        'empty': 'No messages yet.',
        'loadMore': 'Load more',
        'archiveTitle': 'Archived messages',
        'archiveNote': 'Archive of the legacy message board, now read-only. New messages go in the comment section below.',
        'errorServer': 'The service is temporarily unavailable. Please try again later.',
    },
    'ja': {
        'loading': 'メッセージを読み込み中…',
        'empty': 'まだメッセージはありません。',
        'loadMore': 'もっと読み込む',
        'archiveTitle': '過去の留言',
        'archiveNote': '以下は旧留言板のアーカイブ（読み取り専用）。新しいメッセージは下のコメント欄へどうぞ。',
        'errorServer': 'サービスを一時的に利用できません。後でもう一度お試しください。',
    },
}

def guestbook_body(lang_path: str) -> str:
    """Guestbook page body: the archive card plus its client loader.

    The card carries copy and empty containers only — source/js/guestbook.js
    fetches GET /api/guestbook/list and renders the entries.
    """
    copy = GUESTBOOK_COPY.get(lang_path, GUESTBOOK_COPY['en'])
    # The copy is JSON in a single-quoted attribute, so an apostrophe inside a
    # translation must not be able to close it.
    payload = json.dumps(copy, ensure_ascii=False, separators=(',', ':')).replace("'", '&#39;')
    return f"""<section class="guestbook-card" data-guestbook-root data-guestbook-copy='{payload}'>
  <div class="guestbook-card__head">
    <h2>{html.escape(copy['archiveTitle'])}</h2>
    <p>{html.escape(copy['archiveNote'])}</p>
  </div>
  <div class="guestbook-card__status" data-guestbook-status>{html.escape(copy['loading'])}</div>
  <div class="guestbook-card__list" data-guestbook-list></div>
  <button class="guestbook-card__more" type="button" data-guestbook-more hidden>{html.escape(copy['loadMore'])}</button>
</section>
"""


def migrate_pages():
    count = 0
    for f in sorted((SRC / 'src/content/pages').glob('**/index.md')):
        rel = f.relative_to(SRC / 'src/content/pages').parent
        parts = rel.parts  # e.g. ('zh-cn', 'about') / ('projects',) / ('root',)
        fm, body = parse_fm(f.read_text(encoding='utf-8'))
        lang_path = fm.get('lang_path', 'zh-cn')
        name = parts[-1]
        if name == 'root':
            # The locale chooser is generated (scripts/generators.js).
            continue
        if name in ('about', 'guestbook', 'projects') and parts[0] != name:
            dst = DST / 'source' / parts[0] / name / 'index.md'
            if name == 'guestbook':
                body = guestbook_body(lang_path)
        else:
            # root-level pages: books, projects
            dst = DST / 'source' / name / 'index.md'
        fm['layout'] = 'page'
        # static pages shouldn't show a fake date or the "About this Post" block
        fm['no_date'] = True
        fm['no_about'] = True
        # The old site showed comments on posts, the guestbook and standalone
        # pages, but not on about pages; `comment: false` switched them off.
        if name == 'guestbook':
            fm['no_comments'] = False
            # The old site merged the guestbook into the about page's Twikoo
            # thread (path kept so every existing comment survives).
            fm['comment_path'] = f'/{lang_path}/about/'
            fm['guestbook'] = True  # theme loads js/guestbook.js (versioned)
        elif name == 'about' or str(fm.get('comment')).lower() == 'false':
            fm['no_comments'] = True
        fm.pop('comment', None)
        fm['lang'] = lang_path
        fm.pop('lang_path', None)
        fm.pop('banner_img', None)
        fm.pop('banner_img_height', None)
        fm.pop('banner_mask_alpha', None)
        fm.pop('is_locale_selector', None)
        fm.pop('comment', None)
        write_file(f, dst, fm, body)
        count += 1
    return count


def copy_assets():
    # images referenced from posts as /images/...
    if not (DST / 'source/images').exists():
        shutil.copytree(SRC / 'public/images', DST / 'source/images')
    for name in ['favicon.ico', 'favicon.svg', 'akari-logo.svg', 'apple-touch-icon.png',
                 'android-chrome-192x192.png', 'android-chrome-512x512.png',
                 'favicon-32x32.png']:
        src = SRC / 'public' / name
        if src.exists():
            shutil.copy2(src, DST / 'source' / name)


if __name__ == '__main__':
    n_posts = migrate_posts()
    n_pages = migrate_pages()
    copy_assets()
    print(f'migrated {n_posts} posts, {n_pages} pages')
