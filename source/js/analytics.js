(function() {
  // __AKARI_API_BASE__ is emitted per page: '/api' behind the same origin,
  // or http://<host>:<preview-port>/api while the site runs on hexo server.
  const ANALYTICS_API = (window.__AKARI_API_BASE__ || '/api') + '/analytics';
  const VISITOR_ID_KEY = 'visitor_id';
  
  // Generate a simple visitor ID if not exists
  function getVisitorId() {
    let visitorId = localStorage.getItem(VISITOR_ID_KEY);
    if (!visitorId) {
      visitorId = 'v_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      localStorage.setItem(VISITOR_ID_KEY, visitorId);
    }
    return visitorId;
  }
  
  // Track page view and update counters
  async function trackPageView() {
    try {
      const response = await fetch(ANALYTICS_API, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'X-Visitor-ID': getVisitorId()
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        updateCounters(data);
      }
    } catch (error) {
      console.error('Analytics tracking failed:', error);
    }
  }
  
  // Update the counter displays
  function updateCounters(data) {
    if (!data) return;
    
    // Update site UV (unique visitors)
    const uvElement = document.getElementById('busuanzi_value_site_uv');
    if (uvElement && data.uniqueVisitors !== undefined) {
      uvElement.textContent = data.uniqueVisitors.toLocaleString();
      // Show the container
      const uvContainer = document.getElementById('busuanzi_container_site_uv');
      if (uvContainer) {
        uvContainer.style.display = 'inline';
      }
    }
    
    // Update site PV (page views)
    const pvElement = document.getElementById('busuanzi_value_site_pv');
    if (pvElement && data.pageViews !== undefined) {
      pvElement.textContent = data.pageViews.toLocaleString();
      // Show the container
      const pvContainer = document.getElementById('busuanzi_container_site_pv');
      if (pvContainer) {
        pvContainer.style.display = 'inline';
      }
    }
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', trackPageView);
  } else {
    trackPageView();
  }
})();
