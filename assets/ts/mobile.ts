/* Mobile UI owns page listeners across Swup navigation. */
import { initMobileBackground } from './mobile-background';
import { createMobilePagination } from './mobile-reader';
const w = window as any;
const root = document.documentElement;
let pageController: AbortController | null = null;
let pageObserver: ResizeObserver | null = null;

function isMobile(): boolean { return w.__isMobileUI?.() === true; }

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
