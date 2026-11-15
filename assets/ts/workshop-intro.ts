/** Customer workshop entrance. The site's existing canvas owns all particles. */
(() => {
  const w = window as any;
  if (w.WorkshopIntro) return;
  const html = document.documentElement;
  const RAMP = 240;
  const SETTLE = 620;
  const REVEAL = 620;
  const NORMAL = 5;
  const FAST = 32;
  let frame = 0;
  let started = 0;
  let revealing = 0;
  let phase: 'warp' | 'reveal' | null = null;
  let root: HTMLElement | null = null;
  let motionReduced = false;
  let revealDuration = REVEAL;
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
  const ease = (value: number) => {
    const progress = Math.max(0, Math.min(value, 1));
    return progress * progress * (3 - 2 * progress);
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
    revealDuration = motionReduced ? 160 : REVEAL;
    containers.forEach(element => {
      const animation = element.animate([{opacity: 0}, {opacity: 1}], {
        duration: revealDuration, fill: 'both', easing: 'cubic-bezier(.2,0,.2,1)'
      });
      animation.pause();
      animations.push(animation);
    });
    if (!motionReduced) groups.forEach((element, index) => {
      const delay = Math.min(index * 25, 100);
      const animation = element.animate([
        {transform: 'translate3d(0,8px,0)'},
        {transform: 'translate3d(0,0,0)'}
      ], {duration: REVEAL - delay, delay, fill: 'both', easing: 'cubic-bezier(.22,1,.36,1)'});
      animation.pause();
      animations.push(animation);
    });
    html.dataset.workshopIntro = 'reveal';
  }
  function tick(now: number) {
    if (!phase) return;
    const elapsed = now - started;
    // One continuous pulse, independent of navigation/content readiness. Slow
    // responses must never hold peak speed or restart acceleration on arrival.
    const pulse = elapsed < RAMP ? ease(elapsed / RAMP) : 1 - ease((elapsed - RAMP) / SETTLE);
    speed(NORMAL + (FAST - NORMAL) * pulse);
    if (phase === 'warp') {
      if (root?.isConnected && elapsed >= RAMP) reveal(now);
      // A failed/cancelled navigation must not leave the old page invisible.
      else if (elapsed > 8000) { finish(); return; }
    }
    if (phase === 'reveal') {
      const time = now - revealing;
      animations.forEach(animation => { animation.currentTime = time; });
      if (time >= revealDuration && elapsed >= RAMP + SETTLE) { finish(); return; }
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
