/** Reveal workshop modules as they arrive; never gate content behind the canvas. */
(() => {
  const w = window as any;
  const VERSION = 'module-reveal-10';
  if (w.WorkshopIntro?.version === VERSION) return;
  w.WorkshopIntro?.cancel?.();
  const html = document.documentElement;
  const animations = new Map<Animation, {element: HTMLElement; startAt: number; launched: boolean}>();
  const pending = new Set<Animation>();
  let frame = 0;
  let root: HTMLElement | null = null;
  let seen = new WeakSet<HTMLElement>();
  let visibleAt: number | null = null;
  let hiddenAt: number | null = null;
  let reduced = false;
  let compact = false;
  let nextCompact = false;

  const isWorkshop = (url: string) => {
    try { return /^\/prints(?:\/|$)/.test(new URL(url, location.origin).pathname); }
    catch { return false; }
  };
  const isCollection = (url: string) => {
    try { return /^\/prints\/(?:detail\/)?$/.test(new URL(url, location.origin).pathname); }
    catch { return false; }
  };
  function cancel() {
    cancelAnimationFrame(frame);
    frame = 0;
    animations.forEach(({element}, animation) => {
      animation.onfinish = null;
      animation.cancel();
      delete element.dataset.workshopReveal;
    });
    animations.clear();
    pending.clear();
    root?.querySelectorAll<HTMLElement>('[data-workshop-cover-pending]').forEach(cover => {
      delete cover.dataset.workshopCoverPending;
    });
    root = null;
    compact = nextCompact = false;
    visibleAt = hiddenAt = null;
    seen = new WeakSet();
    delete html.dataset.workshopIntro;
    delete html.dataset.workshopEntry;
  }
  function playWhenVisible() {
    if (frame || !pending.size || document.visibilityState === 'hidden') return;
    // Let the first visible frame paint before starting the module choreography.
    frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(now => {
        frame = 0;
        if (document.visibilityState === 'hidden') return;
        if (visibleAt === null) visibleAt = now;
        else if (hiddenAt !== null) visibleAt += now-hiddenAt;
        hiddenAt = null;
        const elapsed = now-visibleAt;
        pending.forEach(animation => {
          const item = animations.get(animation);
          if (!item) return;
          if (!item.launched) {
            animation.effect?.updateTiming({delay: Math.max(0,item.startAt-elapsed)});
            item.launched = true;
          }
          animation.play();
        });
        pending.clear();
      });
    });
  }
  function show(element: HTMLElement, startAt: number, duration: number, distance: number, opacity = 0, x = 0) {
    if (seen.has(element)) return;
    seen.add(element);
    if (typeof element.animate !== 'function') return;
    const keyframes: Keyframe[] = reduced || (!distance && !x)
      ? [{opacity: reduced ? 0 : opacity}, {opacity: 1}]
      : [{opacity, transform: `translate3d(${x}px,${distance}px,0)`}, {opacity: 1, transform: 'translate3d(0,0,0)'}];
    const shortenDefault = reduced && root?.dataset.workshop !== 'catalog';
    const scheduled = shortenDefault ? Math.min(startAt,180) : startAt;
    const animation = element.animate(keyframes, {
      delay: scheduled,
      duration: shortenDefault ? 260 : duration,
      easing: reduced ? 'linear' : 'cubic-bezier(.2,.6,.3,1)',
      fill: 'both'
    });
    animation.id = 'workshop-reveal';
    animation.pause();
    animation.currentTime = 0;
    element.dataset.workshopReveal = 'true';
    html.dataset.workshopIntro = 'reveal';
    animations.set(animation, {element, startAt: scheduled, launched: false});
    pending.add(animation);
    animation.onfinish = () => {
      animation.cancel();
      animations.delete(animation);
      pending.delete(animation);
      delete element.dataset.workshopReveal;
      if (!animations.size) delete html.dataset.workshopIntro;
    };
    playWhenVisible();
  }
  const elapsedTime = () => visibleAt === null ? 0 : Math.max(0,(hiddenAt ?? performance.now())-visibleAt);

  function refresh(element: HTMLElement) {
    if (element !== root || !element.isConnected) return;
    const elapsed = elapsedTime();
    const catalog = element.dataset.workshop === 'catalog';
    const mobile = w.__isMobileUI?.();
    const revealHeader = !compact && (
      !catalog || (!mobile && !!element.querySelector(':scope > .wk-nav > .wk-brand'))
    );
    const headerDuration = catalog ? (reduced ? 120 : 220) : 560;
    const group = (selector: string, delay: number, duration: number, distance: number, x = 0) =>
      element.querySelectorAll<HTMLElement>(selector).forEach(node => show(node, delay, duration, distance, 0, x));

    if (revealHeader) {
      group(':scope > .wk-nav > .wk-brand', 0, headerDuration, 0, -24);
      group(':scope > .wk-nav > .wk-nav-back', catalog ? 0 : 160, headerDuration, 0, 24);
    }

    if (catalog) {
      const stageGap = 16;
      const toolbarAt = revealHeader ? headerDuration + stageGap : 0;
      const toolbarDuration = reduced ? 100 : 180;
      const cardsAt = Math.max(elapsed, toolbarAt + toolbarDuration + stageGap);
      const stagger = reduced ? 24 : 45;
      group('.wk-collection-toolbar', toolbarAt, toolbarDuration, 8);
      group('.wk-catalog-notice', toolbarAt, toolbarDuration, 8);
      if (!mobile) group('.wk-catalog-home', toolbarAt, toolbarDuration, 8);
      element.querySelectorAll<HTMLElement>('.wk-grid > .wk-card').forEach((card, index) => {
        if (seen.has(card)) return;
        const cardAt = cardsAt + Math.min(index, 2) * stagger;
        show(card, cardAt, reduced ? 180 : 320, 10);
        const cover = card.querySelector<HTMLImageElement>('.wk-card-image > img');
        if (!cover || cover.complete || typeof cover.animate !== 'function') return;
        cover.dataset.workshopCoverPending = 'true';
        cover.addEventListener('load', () => {
          const loadedAt = elapsedTime();
          if (element === root && cover.isConnected && loadedAt >= cardAt) {
            show(cover, loadedAt, reduced ? 180 : 260, 0);
          }
          delete cover.dataset.workshopCoverPending;
        }, {once: true});
        cover.addEventListener('error', () => { delete cover.dataset.workshopCoverPending; }, {once: true});
      });
      return;
    }

    group('.wk-breadcrumb', compact ? 0 : 220, compact ? 260 : 420, compact ? 6 : 10);
    const detailStart = Math.max(compact ? 0 : 320,elapsed);
    element.querySelectorAll<HTMLElement>('.wk-gallery').forEach(node => show(node, elapsed, 320, 8, .45));
    group('.wk-config > h1', detailStart + (compact ? 0 : 90), compact ? 320 : 480, compact ? 8 : 14);
    group('.wk-config > .wk-description', detailStart + (compact ? 35 : 170), compact ? 320 : 500, compact ? 8 : 14);
    element.querySelectorAll<HTMLElement>('.wk-config-section').forEach((section, index) =>
      show(section, detailStart + (compact ? 70 : 240) + Math.min(index * (compact ? 35 : 70),compact ? 70 : 140), compact ? 320 : 500, compact ? 8 : 16));
    group('.wk-price-box, .wk-stock-facts', detailStart + (compact ? 105 : 380), compact ? 300 : 460, compact ? 8 : 14);
    group('.wk-contact-button', detailStart + (compact ? 140 : 460), compact ? 280 : 430, compact ? 8 : 10);
  }
  w.WorkshopIntro = {
    version: VERSION,
    active: () => animations.size > 0,
    navigate(to: string, from: string) {
      cancel();
      nextCompact = isCollection(from) && isCollection(to);
      return isWorkshop(to);
    },
    enter(element: HTMLElement) {
      if (element.dataset.workshop === 'admin') { cancel(); return; }
      if (element !== root) {
        const internalVisit = nextCompact;
        cancel();
        compact = internalVisit;
        root = element;
        reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
        html.dataset.workshopEntry = 'true';
      }
      refresh(element);
    },
    refresh,
    cancel
  };
  window.addEventListener('pagehide', cancel);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (visibleAt !== null && hiddenAt === null) hiddenAt = performance.now();
      animations.forEach((_element, animation) => {
        animation.pause();
        pending.add(animation);
      });
    } else playWhenVisible();
  });
  if (isWorkshop(location.href)) html.dataset.workshopEntry = 'true';
})();
