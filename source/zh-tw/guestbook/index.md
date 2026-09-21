---
title: 留言板
description: Akari 的留言板，歡迎留下任何想說的話。
lang: zh-tw
translation_key: site-guestbook
layout: page
no_date: True
no_about: True
no_comments: False
comment_path: /zh-tw/about/
guestbook: True
---
<section class="guestbook-card" data-guestbook-root data-guestbook-copy='{"loading":"正在載入留言…","empty":"還沒有留言。","loadMore":"載入更多","archiveTitle":"歷史留言","archiveNote":"以下為舊版留言板的存檔，已轉為唯讀；新留言請寫在下方評論區。","errorServer":"服務暫時不可用，請稍後再試。"}'>
  <div class="guestbook-card__head">
    <h2>歷史留言</h2>
    <p>以下為舊版留言板的存檔，已轉為唯讀；新留言請寫在下方評論區。</p>
  </div>
  <div class="guestbook-card__status" data-guestbook-status>正在載入留言…</div>
  <div class="guestbook-card__list" data-guestbook-list></div>
  <button class="guestbook-card__more" type="button" data-guestbook-more hidden>載入更多</button>
</section>
