/* Mobile UI owns page listeners across Swup navigation. */
import { initMobileBackground } from './mobile-background';
import { createMobilePagination } from './mobile-reader';
const w = window as any;
const root = document.documentElement;
let pageController: AbortController | null = null;
let pageObserver: ResizeObserver | null = null;

function isMobile(): boolean { return w.__isMobileUI?.() === true; }

function initHomeSwipe(signal: AbortSignal): void {
  const main = document.querySelector<HTMLElement>('body.home-page main.main');
  const pagination = document.querySelector<HTMLElement>('#local-pagination');
  if (!main || !pagination) return;

  const originalSections = Array.from(main.querySelectorAll<HTMLElement>('.home-article-list'));
  if (!originalSections.length) return;
  const originalGroups = originalSections.map(section => Array.from(section.children));
  const originalNav = pagination.innerHTML;
  const originalNavStyle = pagination.getAttribute('style');
  const cards = originalGroups.flat();
  const sections: HTMLElement[] = [];
  for (let start = 0; start < cards.length; start += 6) {
    const section = originalSections[0].cloneNode(false) as HTMLElement;
    section.dataset.page = String(sections.length + 1);
    section.style.display = sections.length ? 'none' : '';
    section.append(...cards.slice(start, start + 6));
    sections.push(section);
  }
  const viewport = document.createElement('div');
  const track = document.createElement('div');
  viewport.className = `m-home-viewport${sections.length === 1 ? ' m-home-single-page' : ''}`;
  track.className = 'm-home-track';
  originalSections[0].before(viewport);
  viewport.append(track);
  track.append(...sections);
  originalSections.forEach(section => section.remove());
  pagination.querySelectorAll<HTMLElement>('[data-goto]').forEach(button => {
    if (Number(button.dataset.goto) > sections.length) button.remove();
  });
  if (sections.length === 1) pagination.style.display = 'none';
  w.__prefetchAdjacent?.();

  type Sample = { x: number; time: number };
  type Gesture = { x: number; y: number; offset: number; locked: boolean; samples: Sample[] };
  let gesture: Gesture | null = null;
  let frame = 0;
  let offset = 0;
  let width = viewport.getBoundingClientRect().width;
  let currentIndex = 0;
  let suppressClickUntil = 0;
  const pageIndex = () => Math.max(0, sections.findIndex(section =>
    section.dataset.page === pagination.querySelector<HTMLElement>('[aria-current="page"]')?.dataset.goto
  ));
  const render = (position: number) => {
    offset = position;
    track.style.transform = `translate3d(${position}px, 0, 0)`;
  };
  const markCurrent = () => {
    sections.forEach((section, index) => {
      section.inert = index !== currentIndex;
      section.setAttribute('aria-hidden', String(index !== currentIndex));
    });
  };
  const settle = (index: number, animate = true) => {
    cancelAnimationFrame(frame);
    frame = 0;
    const target = -index * width;
    const duration = Math.min(320, Math.max(180, 120 + Math.abs(target - offset) / width * 220));
    track.style.transition = animate ? `transform ${duration}ms cubic-bezier(.22,.8,.24,1)` : 'none';
    currentIndex = index;
    markCurrent();
    render(target);
  };
  const syncPage = () => {
    const index = pageIndex();
    if (index !== currentIndex) settle(index);
  };
  const dragOffset = (position: number) => {
    const min = -(sections.length - 1) * width;
    if (position > 0) return position * .24 / (1 + position / width);
    if (position < min) return min + (position - min) * .24 / (1 + (min - position) / width);
    return position;
  };

  settle(pageIndex(), false);
  const navObserver = new MutationObserver(syncPage);
  navObserver.observe(pagination, { subtree: true, attributes: true, attributeFilter: ['aria-current'] });
  const sizeObserver = new ResizeObserver(() => {
    const nextWidth = viewport.getBoundingClientRect().width;
    if (nextWidth === width) return;
    width = nextWidth;
    gesture = null;
    settle(currentIndex, false);
  });
  sizeObserver.observe(viewport);

  main.addEventListener('touchstart', event => {
    if (sections.length < 2 || event.touches.length !== 1) return;
    if (document.querySelector<HTMLDetailsElement>('.m-navigation')?.open || window.getSelection()?.toString()) return;
    const touch = event.touches[0];
    if (touch.clientX < 24 || touch.clientX > window.innerWidth - 24) return;
    // Freeze an unfinished snap at its painted position so a new drag never jumps.
    cancelAnimationFrame(frame);
    frame = 0;
    const paintedOffset = track.getBoundingClientRect().left - viewport.getBoundingClientRect().left;
    track.style.transition = 'none';
    render(paintedOffset);
    gesture = {
      x: touch.clientX, y: touch.clientY, offset: paintedOffset, locked: false,
      samples: [{ x: touch.clientX, time: performance.now() }]
    };
  }, { signal, passive: true });

  main.addEventListener('touchmove', event => {
    if (!gesture) return;
    if (event.touches.length !== 1) { gesture = null; settle(currentIndex); return; }
    const touch = event.touches[0];
    const dx = touch.clientX - gesture.x;
    const dy = touch.clientY - gesture.y;
    if (!gesture.locked) {
      if (Math.abs(dy) > 8 && Math.abs(dy) > Math.abs(dx) * 1.15) {
        gesture = null; settle(currentIndex); return;
      }
      if (Math.abs(dx) < 7 || Math.abs(dx) < Math.abs(dy) * 1.15) return;
      gesture.locked = true;
    }
    if (event.cancelable) event.preventDefault();
    suppressClickUntil = performance.now() + 300;
    const now = performance.now();
    gesture.samples.push({ x: touch.clientX, time: now });
    gesture.samples = gesture.samples.filter(sample => now - sample.time <= 100);
    offset = dragOffset(gesture.offset + dx);
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(offset); });
  }, { signal, passive: false });

  main.addEventListener('touchend', event => {
    if (!gesture) return;
    const completed = gesture;
    gesture = null;
    if (!completed.locked || !event.changedTouches.length) { settle(currentIndex); return; }
    // Cancel the touch-generated click before document-level pagination listeners run.
    if (event.cancelable) event.preventDefault();
    suppressClickUntil = performance.now() + 380;
    const dx = event.changedTouches[0].clientX - completed.x;
    const sample = completed.samples[0];
    const velocity = (event.changedTouches[0].clientX - sample.x) / Math.max(1, performance.now() - sample.time);
    const shouldTurn = Math.abs(dx) >= Math.min(88, width * .2) || (Math.abs(dx) >= 28 && Math.abs(velocity) >= .45);
    const direction = Math.abs(velocity) >= .45 ? Math.sign(velocity) : Math.sign(dx);
    const target = Math.max(0, Math.min(sections.length - 1, currentIndex - (shouldTurn ? direction : 0)));
    if (target !== currentIndex) {
      pagination.querySelector<HTMLElement>(`[data-goto="${sections[target].dataset.page}"]`)?.click();
    }
    settle(target);
  }, { signal, passive: false });

  main.addEventListener('touchcancel', () => {
    gesture = null;
    settle(currentIndex);
  }, { signal, passive: true });
  main.addEventListener('click', event => {
    if (performance.now() >= suppressClickUntil || !event.isTrusted || !(event.target instanceof Element) ||
      !event.target.closest('.home-article-list a, .home-pagination a')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { signal, capture: true });
  signal.addEventListener('abort', () => {
    cancelAnimationFrame(frame);
    navObserver.disconnect();
    sizeObserver.disconnect();
    originalSections.forEach((section, index) => section.append(...originalGroups[index]));
    viewport.before(...originalSections);
    viewport.remove();
    pagination.innerHTML = originalNav;
    if (originalNavStyle === null) pagination.removeAttribute('style');
    else pagination.setAttribute('style', originalNavStyle);
    gesture = null;
  }, { once: true });
}

function destroyMobilePage(): void {
  pageController?.abort(); pageController = null;
  pageObserver?.disconnect(); pageObserver = null;
  const toc = document.getElementById('TableOfContents') as any;
  toc?.__tocAutoCollapseObserver?.disconnect();
  if (toc) delete toc.__tocAutoCollapseObserver;
  w.__destroyMobileReader?.();
  w.__destroyMobileMermaid?.();
  w.__searchInstance?.destroy?.();
  document.querySelector<HTMLDetailsElement>('.m-navigation')?.removeAttribute('open');
}

function initMobilePage(): void {
  if (!isMobile()) return;
  document.querySelectorAll('#aplayer').forEach(player => player.remove());
  pageController?.abort(); pageObserver?.disconnect();
  pageController = new AbortController();
  const signal = pageController.signal;
  const nav = document.querySelector<HTMLDetailsElement>('.m-navigation');
  if (nav) {
    const summary = nav.querySelector('summary')!;
    const close = () => { nav.open = false; summary.focus(); };
    nav.querySelector('.m-nav-close')?.addEventListener('click', close, {signal});
    nav.addEventListener('toggle', () => {
      summary.setAttribute('aria-expanded', String(nav.open));
      if (nav.open) nav.querySelector<HTMLButtonElement>('button')?.focus();
    }, {signal});
    document.addEventListener('click', e => {
      const target = e.target as HTMLElement;
      if (nav.open && (!nav.contains(target) || target === nav || target.closest('a'))) nav.open = false;
    }, {signal});
    document.addEventListener('keydown', e => {
      if (!nav.open) return;
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') {
        const items = Array.from(nav.querySelectorAll<HTMLElement>('summary,button,a[href]'));
        const first = items[0], last = items[items.length-1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }, {signal});
  }
  const header = document.querySelector<HTMLElement>('.m-header');
  pageObserver = new ResizeObserver(() => {
    if (header) root.style.setProperty('--m-header-height', `${header.getBoundingClientRect().height}px`);
  });
  if (header) pageObserver.observe(header);
  const toc = document.getElementById('TableOfContents');
  const widget = toc?.closest('.widget');
  if (widget && !widget.closest('.m-toc')) {
    const details = document.createElement('details'); details.className = 'm-toc';
    const summary = document.createElement('summary'); summary.textContent = '文章目录';
    widget.before(details); details.append(summary,widget);
  }
  toc?.addEventListener('click', e => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a) return;
    const target = document.getElementById(decodeURIComponent(a.hash.slice(1)));
    if (!target) return;
    e.preventDefault(); e.stopImmediatePropagation();
    toc.closest<HTMLDetailsElement>('.m-toc')!.open = false;
    history.replaceState(history.state, '', a.hash);
    requestAnimationFrame(() => target.scrollIntoView({block:'start',behavior:'smooth'}));
  }, {signal,capture:true});
  document.querySelectorAll<HTMLElement>('#local-pagination a').forEach(a => { a.tabIndex = 0; a.setAttribute('role','button'); });
  document.getElementById('local-pagination')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.target as HTMLElement).click(); }
  }, {signal});
  initHomeSwipe(signal);
  if (document.getElementById('novel-reader-root') && !document.getElementById('novel-reader-root')!.dataset.readerInit) w.__initNovelReader?.();
}

if (isMobile()) {
  w.__createMobilePagination = createMobilePagination;
  initMobileBackground();
  w.initMobilePage = initMobilePage; w.destroyMobilePage = destroyMobilePage;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initMobilePage,{once:true});
  else initMobilePage();
  window.addEventListener('pageshow',e=>{ if(e.persisted) initMobilePage(); });
}
