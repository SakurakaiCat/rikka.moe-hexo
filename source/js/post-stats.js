(function () {
  // Per-post view and comment counters.
  //
  // Views come from the blog API (/api/page-views), keyed by the pathname the
  // visitor analytics recorded — i.e. the percent-encoded URL path, which is
  // what Hexo emits for `data-post-url` (see themes/cupertino/layout/post.ejs).
  // Comments come from the Twikoo backend (see js/twikoo-counts.js).
  var PAGE_VIEWS_API = (window.__AKARI_API_BASE__ || '/api') + '/page-views';

  function loadStats() {
    var containers = document.querySelectorAll('[data-post-url]');
    if (!containers.length) return;

    var seen = {};
    var urls = [];
    containers.forEach(function (el) {
      var url = el.getAttribute('data-post-url');
      if (url && !seen[url]) {
        seen[url] = true;
        urls.push(url);
      }
    });
    if (!urls.length) return;

    fetchViews(urls);
    fetchComments(urls);
  }

  function fetchViews(urls) {
    fetch(PAGE_VIEWS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: urls })
    })
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (!data || !data.views) return;
        updateCounter('[data-stats-views]', data.views);
      })
      .catch(function (err) {
        console.error('[post-stats] views fetch failed:', err);
      });
  }

  function updateCounter(selector, values) {
    document.querySelectorAll('[data-post-url]').forEach(function (el) {
      var url = el.getAttribute('data-post-url');
      var target = el.querySelector(selector);
      if (target && values[url] !== undefined) {
        target.textContent = values[url].toLocaleString();
      }
    });
  }

  function fetchComments(urls) {
    var lookup = {};
    urls.forEach(function (url) {
      window.AkariTwikoo.pathCandidates(url).forEach(function (candidate) {
        lookup[candidate] = url;
      });
    });

    window.AkariTwikoo.countComments(Object.keys(lookup)).then(function (counts) {
      var totals = {};
      Object.keys(counts).forEach(function (candidate) {
        var url = lookup[candidate];
        if (!url) return;
        totals[url] = (totals[url] || 0) + counts[candidate];
      });
      updateCounter('[data-stats-comments]', totals);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadStats, { once: true });
  } else {
    loadStats();
  }
})();
