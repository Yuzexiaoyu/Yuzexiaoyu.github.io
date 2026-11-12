/** Customer workshop entrance. The site's existing canvas owns all particles. */
(() => {
  const w = window as any;
  if (w.WorkshopIntro) return;
  const html = document.documentElement;
  const HOLD = 1600;
  const REVEAL = 900;
  const NORMAL = 5;
  const FAST = 40;
  let frame = 0;
  let started = 0;
  let revealing = 0;
  let phase: 'warp' | 'reveal' | null = null;
  let root: HTMLElement | null = null;
  let motionReduced = false;
  let animations: Animation[] = [];
  const locked = new Map<HTMLElement, boolean>();

  const isWorkshop = (url: string) => {
    try { return /^\/prints(?:\/|$)/.test(new URL(url, location.origin).pathname); }
    catch { return false; }
  };
  const speed = (value: number) => {
    if (w.__isMobileUI?.()) w.__mobileWarp?.setSpeed(value);
    else w.setWarpSpeed?.(value);
  };
  const lock = () => {
    if (!document.body || locked.has(document.body)) return;
    locked.set(document.body, document.body.inert);
    document.body.inert = true;
  };
  function finish() {
    cancelAnimationFrame(frame);
    frame = 0;
    phase = null;
    root = null;
    delete html.dataset.workshopIntro;
    animations.forEach(animation => animation.cancel());
    animations = [];
    locked.forEach((inert, body) => { body.inert = inert; });
    locked.clear();
    speed(NORMAL);
  }
  function reveal(now: number) {
    phase = 'reveal';
    revealing = now;
    // Opacity on outer containers also covers late-arriving images/API content.
    const containers = Array.from(document.body.children).filter((node): node is HTMLElement =>
      node instanceof HTMLElement && !/^(SCRIPT|STYLE|LINK|TEMPLATE|NOSCRIPT)$/.test(node.tagName));
    const groups = Array.from(document.querySelectorAll<HTMLElement>(
      '[data-workshop] > .wk-nav, .wk-collection-toolbar, .wk-grid, .wk-breadcrumb, .wk-gallery, .wk-config > *'));
    const duration = motionReduced ? 160 : REVEAL;
    containers.forEach(element => {
      const animation = element.animate([{opacity: 0}, {opacity: 1}], {duration, fill: 'both'});
      animation.pause();
      animations.push(animation);
    });
    if (!motionReduced) groups.forEach((element, index) => {
      const delay = Math.min(index * 70, 240);
      const animation = element.animate([
        {opacity: 0, transform: 'translate3d(0,20px,0)'},
        {opacity: 1, transform: 'translate3d(0,0,0)'}
      ], {duration: REVEAL - delay, delay, fill: 'both', easing: 'cubic-bezier(.22,1,.36,1)'});
      animation.pause();
      animations.push(animation);
    });
    html.dataset.workshopIntro = 'reveal';
  }
  function tick(now: number) {
    if (!phase) return;
    const elapsed = now - started;
    if (phase === 'warp') {
      const ramp = Math.min(elapsed / 400, 1);
      // The requested workshop warp runs even when content motion is reduced.
      speed(NORMAL + (FAST - NORMAL) * ramp * ramp * (3 - 2 * ramp));
      if (root?.isConnected && elapsed >= HOLD) reveal(now);
      // A failed/cancelled navigation must not leave the old page invisible.
      else if (elapsed > 8000) { finish(); return; }
    }
    if (phase === 'reveal') {
      const time = now - revealing;
      const progress = Math.min(time / REVEAL, 1);
      speed(NORMAL + (FAST - NORMAL) * Math.pow(1 - progress, 3));
      animations.forEach(animation => { animation.currentTime = time; });
      if (progress === 1) { finish(); return; }
    }
    frame = requestAnimationFrame(tick);
  }
  function start() {
    finish();
    motionReduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    phase = 'warp';
    started = performance.now();
    html.dataset.workshopIntro = 'warp';
    lock();
    frame = requestAnimationFrame(tick);
  }
  w.WorkshopIntro = {
    active: () => phase !== null,
    navigate(to: string, from: string) {
      if (isWorkshop(to) && !isWorkshop(from)) { start(); return true; }
      finish();
      return false;
    },
    enter(element: HTMLElement) {
      if (!phase) return;
      if (element.dataset.workshop === 'admin') { finish(); return; }
      root = element;
      lock();
    },
    cancel: finish
  };
  window.addEventListener('pagehide', finish);
  if (isWorkshop(location.href)) start();
})();
