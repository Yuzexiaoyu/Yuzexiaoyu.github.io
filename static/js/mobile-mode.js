/* One device decision for both Hugo pages and the standalone gallery. Width is layout only. */
(function () {
  var ua = navigator.userAgent || '';
  var isDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Silk|Kindle|PlayBook|BB10|Windows Phone/i.test(ua) ||
    (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var root = document.documentElement;
  window.__isMobileDevice = function () { return isDevice; };
  if (isDevice && window.__mobileEnabled === true) root.dataset.ui = 'mobile';
  window.__isMobileUI = function () { return root.dataset.ui === 'mobile'; };
  if (window.__isMobileUI()) {
    var viewport = document.querySelector('meta[name="viewport"]');
    if (viewport) viewport.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
  }
})();
