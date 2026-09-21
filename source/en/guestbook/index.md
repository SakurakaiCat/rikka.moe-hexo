---
title: Guestbook
description: "Akari's guestbook — leave a message in any language."
lang: en
translation_key: site-guestbook
layout: page
no_date: True
no_about: True
no_comments: False
comment_path: /en/about/
guestbook: True
---
<section class="guestbook-card" data-guestbook-root data-guestbook-copy='{"loading":"Loading messages…","empty":"No messages yet.","loadMore":"Load more","archiveTitle":"Archived messages","archiveNote":"Archive of the legacy message board, now read-only. New messages go in the comment section below.","errorServer":"The service is temporarily unavailable. Please try again later."}'>
  <div class="guestbook-card__head">
    <h2>Archived messages</h2>
    <p>Archive of the legacy message board, now read-only. New messages go in the comment section below.</p>
  </div>
  <div class="guestbook-card__status" data-guestbook-status>Loading messages…</div>
  <div class="guestbook-card__list" data-guestbook-list></div>
  <button class="guestbook-card__more" type="button" data-guestbook-more hidden>Load more</button>
</section>
