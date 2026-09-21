(function () {
  // Shared Twikoo plumbing for the comment section and the per-post counters.
  //
  // Counts go straight to the comment backend instead of through the Twikoo
  // SDK: the SDK only exposes `getCommentsCount` once its bundle has finished
  // booting, which is too late for the path resolution in comments.js.
  var ENV_ID = 'https://comment.rikka.moe';

  function countComments(urls) {
    if (!urls.length) return Promise.resolve({});

    return fetch(ENV_ID, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'GET_COMMENTS_COUNT', urls: urls, includeReply: false })
    })
      .then(function (response) {
        return response.json();
      })
      .then(function (payload) {
        var counts = {};
        ((payload && payload.data) || []).forEach(function (item) {
          counts[item.url] = item.count;
        });
        return counts;
      })
      .catch(function (error) {
        console.error('[twikoo] comment count failed:', error);
        return {};
      });
  }

  // A past client build stored some threads under the decoded spelling of a
  // non-ASCII path; both spellings are checked so those threads stay reachable.
  function pathCandidates(path) {
    var candidates = [path];

    try {
      var decoded = decodeURI(path);
      if (decoded !== path) candidates.push(decoded);
    } catch (error) {
      /* malformed escape sequence: keep the path as-is */
    }

    return candidates;
  }

  window.AkariTwikoo = window.AkariTwikoo || {
    envId: ENV_ID,
    countComments: countComments,
    pathCandidates: pathCandidates
  };
})();
