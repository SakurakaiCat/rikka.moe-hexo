---
title: 留言板
description: Akari 的留言板，欢迎留下任何想说的话。
lang: zh-cn
translation_key: site-guestbook
layout: page
no_date: True
no_about: True
no_comments: False
comment_path: /zh-cn/about/
guestbook: True
---
<section class="guestbook-card" data-guestbook-root data-guestbook-copy='{"loading":"正在加载留言…","empty":"还没有留言。","loadMore":"加载更多","archiveTitle":"历史留言","archiveNote":"以下旧版留言板的存档，已转为只读；新留言请写在下方评论区。","errorServer":"服务暂时不可用，请稍后再试。"}'>
  <div class="guestbook-card__head">
    <h2>历史留言</h2>
    <p>以下旧版留言板的存档，已转为只读；新留言请写在下方评论区。</p>
  </div>
  <div class="guestbook-card__status" data-guestbook-status>正在加载留言…</div>
  <div class="guestbook-card__list" data-guestbook-list></div>
  <button class="guestbook-card__more" type="button" data-guestbook-more hidden>加载更多</button>
</section>
