(function () {
  // Deep-space background: asks the blog API (/api/nasa-apod) for the day's
  // NASA APOD image and fades it in behind the page. The API caches the
  // upstream window and prefers starry-sky candidates, so failures leave the
  // plain theme background in place.
  var API_BASE = window.__AKARI_API_BASE__ || '/api';
  var MOBILE_QUERY = window.matchMedia('(max-width: 720px)');
  var STORE_KEY = 'akari_nasa_bg';

  function apply(data) {
    var el = document.querySelector('.akari-nasa-bg');
    if (!el || !data || !data.url) return;

    var url = MOBILE_QUERY.matches && data.thumbnailUrl ? data.thumbnailUrl : data.url;
    var img = new Image();
    img.onload = function () {
      el.style.backgroundImage = 'url("' + url + '")';
      document.body.classList.add('akari-nasa-loaded');
      el.setAttribute('title', (data.title || '') + (data.copyright ? ' © ' + data.copyright : ''));
    };
    img.src = url;
  }

  function load() {
    if (window.__akariNasaApplied) {
      apply(window.__akariNasaApplied);
      return;
    }

    var today = new Date().toISOString().slice(0, 10);
    try {
      var cached = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (cached && cached.day === today && cached.data && cached.data.url) {
        window.__akariNasaApplied = cached.data;
        apply(cached.data);
        return;
      }
    } catch (e) {
      /* private mode: fall through to the network */
    }

    window
      .fetch(API_BASE + '/nasa-apod')
      .then(function (response) {
        return response.json();
      })
      .then(function (res) {
        if (!res || !res.ok || !res.candidate || !res.candidate.url) return;
        window.__akariNasaApplied = res.candidate;
        try {
          localStorage.setItem(STORE_KEY, JSON.stringify({ day: today, data: res.candidate }));
        } catch (e) {
          /* ignore */
        }
        apply(res.candidate);
      })
      .catch(function () {
        /* keep the static background */
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load, { once: true });
  } else {
    load();
  }

  if (MOBILE_QUERY.addEventListener) {
    MOBILE_QUERY.addEventListener('change', function () {
      if (window.__akariNasaApplied) apply(window.__akariNasaApplied);
    });
  }
})();
