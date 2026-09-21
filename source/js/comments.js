(function () {
  var TWIKOO_CDN = 'https://cdn.jsdelivr.net/npm/twikoo@1.7.13/dist/twikoo.all.min.js';

  // Comments live in the Twikoo deployment the blog has always used
  // (comment.rikka.moe). Threads are keyed by URL path: pages with pure ASCII
  // paths have one key, while part of the archive was written by an older
  // client under the decoded spelling of a non-ASCII path. The thread that
  // actually holds the comments wins, so no existing discussion is lost; new
  // threads always use the path the browser sends.
  function resolvePath(root, done) {
    var explicit = root.getAttribute('data-twikoo-path');
    if (explicit) {
      done(explicit);
      return;
    }

    var encoded = window.location.pathname.replace(/index\.html$/, '');
    var candidates = window.AkariTwikoo.pathCandidates(encoded);

    if (candidates.length === 1) {
      done(encoded);
      return;
    }

    window.AkariTwikoo.countComments(candidates).then(function (counts) {
      var best = encoded;
      var bestCount = 0;

      candidates.forEach(function (candidate) {
        var count = counts[candidate] || 0;
        if (count > bestCount) {
          best = candidate;
          bestCount = count;
        }
      });

      done(best);
    });
  }

  function initTwikoo() {
    var root = document.querySelector('.post-comments[data-twikoo-env-id]');
    if (!root) return;

    var container = root.querySelector('[data-twikoo-container]');
    if (!container || !container.id) return;
    if (container.getAttribute('data-twikoo-ready') === 'true') return;
    if (!window.twikoo || !window.twikoo.init) return;

    var envId = root.getAttribute('data-twikoo-env-id');

    resolvePath(root, function (path) {
      window.twikoo.init({
        envId: envId,
        el: '#' + container.id,
        path: path,
        lang: root.getAttribute('data-twikoo-lang') || document.documentElement.lang || 'en'
      });
      container.setAttribute('data-twikoo-ready', 'true');
    });
  }

  function loadTwikoo() {
    if (window.twikoo && window.twikoo.init) {
      initTwikoo();
      return;
    }

    var existing = document.querySelector('script[data-akari-twikoo="true"]');
    if (existing) {
      if (window.twikoo) initTwikoo();
      else existing.addEventListener('load', initTwikoo, { once: true });
      return;
    }

    var script = document.createElement('script');
    script.src = TWIKOO_CDN;
    script.async = true;
    script.dataset.akariTwikoo = 'true';
    script.addEventListener('load', initTwikoo, { once: true });
    script.addEventListener('error', function () {
      console.error('[twikoo] failed to load:', TWIKOO_CDN);
    });
    document.head.appendChild(script);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadTwikoo, { once: true });
  } else {
    loadTwikoo();
  }
})();
