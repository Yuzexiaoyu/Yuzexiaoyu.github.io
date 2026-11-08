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
  if (!main || !pagination || document.querySelectorAll('.home-article-list').length < 2) return;

  type Gesture = { section: HTMLElement; x: number; y: number; started: number; locked: boolean };
  let gesture: Gesture | null = null;
  let outgoingSection: HTMLElement | null = null;
  let settling = false;
  let swapTimer = 0;
  let unlockTimer = 0;
  let suppressClickUntil = 0;
  const visibleSection = () => Array.from(document.querySelectorAll<HTMLElement>('.home-article-list'))
    .find(section => getComputedStyle(section).display !== 'none');
  const reset = (section: HTMLElement, spring: boolean) => {
    section.style.transition = spring ? 'transform 220ms cubic-bezier(.2,.8,.2,1), opacity 220ms ease-out' : '';
    section.style.transform = '';
    section.style.opacity = '';
    section.style.willChange = '';
  };
  const adjacentButton = (dx: number) => pagination.querySelector<HTMLElement>(
    dx < 0 ? '[data-dir="next"]' : '[data-dir="prev"]'
  );

  main.addEventListener('touchstart', event => {
    if (settling || event.touches.length !== 1) return;
    if (document.querySelector<HTMLDetailsElement>('.m-navigation')?.open || window.getSelection()?.toString()) return;
    const touch = event.touches[0];
    if (touch.clientX < 24 || touch.clientX > window.innerWidth - 24) return;
    const section = visibleSection();
    if (!section) return;
    gesture = { section, x: touch.clientX, y: touch.clientY, started: performance.now(), locked: false };
  }, { signal, passive: true });

  main.addEventListener('touchmove', event => {
    if (!gesture) return;
    if (event.touches.length !== 1) { reset(gesture.section, true); gesture = null; return; }
    const touch = event.touches[0];
    const dx = touch.clientX - gesture.x;
    const dy = touch.clientY - gesture.y;
    if (!gesture.locked) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx) * 1.15) { gesture = null; return; }
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      gesture.locked = true;
      gesture.section.style.transition = 'none';
      gesture.section.style.willChange = 'transform, opacity';
    }
    if (event.cancelable) event.preventDefault();
    suppressClickUntil = performance.now() + 300;
    const button = adjacentButton(dx);
    const available = !!button && !button.classList.contains('disabled');
    const offset = Math.sign(dx) * Math.min(Math.abs(dx) * (available ? .42 : .13), available ? 72 : 16);
    gesture.section.style.transform = `translate3d(${offset}px, 0, 0)`;
    gesture.section.style.opacity = String(1 - Math.min(Math.abs(offset) / 400, .18));
  }, { signal, passive: false });

  main.addEventListener('touchend', event => {
    if (!gesture) return;
    const completed = gesture;
    gesture = null;
    if (!completed.locked || !event.changedTouches.length) return;
    suppressClickUntil = performance.now() + 380;
    const dx = event.changedTouches[0].clientX - completed.x;
    const distance = Math.abs(dx);
    const elapsed = Math.max(1, performance.now() - completed.started);
    const button = adjacentButton(dx);
    const shouldTurn = distance >= Math.min(74, window.innerWidth * .19) ||
      (distance >= 36 && elapsed <= 240);
    if (!button || button.classList.contains('disabled') || !shouldTurn) {
      reset(completed.section, true);
      return;
    }

    settling = true;
    outgoingSection = completed.section;
    completed.section.style.transition = 'transform 130ms ease-out, opacity 130ms ease-out';
    completed.section.style.transform = `translate3d(${Math.sign(dx) * 90}px, 0, 0)`;
    completed.section.style.opacity = '0';
    swapTimer = window.setTimeout(() => {
      reset(completed.section, false);
      outgoingSection = null;
      const oldNavTop = pagination.getBoundingClientRect().top;
      button.click();
      const navShift = oldNavTop - pagination.getBoundingClientRect().top;
      if (navShift) pagination.animate([
        { transform: `translate3d(0, ${navShift}px, 0)` },
        { transform: 'translate3d(0, 0, 0)' }
      ], { duration: 250, easing: 'cubic-bezier(.22,1,.36,1)' });
      const incoming = visibleSection();
      incoming?.animate([
        { transform: `translate3d(${-Math.sign(dx) * 44}px, 0, 0)`, opacity: .72 },
        { transform: 'translate3d(0, 0, 0)', opacity: 1 }
      ], { duration: 250, easing: 'cubic-bezier(.22,1,.36,1)' });
      unlockTimer = window.setTimeout(() => { settling = false; }, 250);
    }, 115);
  }, { signal, passive: true });

  main.addEventListener('touchcancel', () => {
    if (gesture) reset(gesture.section, true);
    gesture = null;
  }, { signal, passive: true });
  main.addEventListener('click', event => {
    if (performance.now() >= suppressClickUntil || !event.isTrusted || !(event.target instanceof Element) ||
      !event.target.closest('.home-article-list a, .home-pagination a')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { signal, capture: true });
  signal.addEventListener('abort', () => {
    window.clearTimeout(swapTimer);
    window.clearTimeout(unlockTimer);
    if (gesture) reset(gesture.section, false);
    if (outgoingSection) reset(outgoingSection, false);
    gesture = null;
    outgoingSection = null;
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
