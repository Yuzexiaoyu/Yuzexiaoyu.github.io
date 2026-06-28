/**
 * Scroll-wheel page navigation for paginated list pages.
 * Boundary-triggered: scroll past bottom → next page, past top → previous page.
 *
 * Uses fetch + manual DOM replacement (article list + pagination only).
 * In-memory pageCache eliminates network round-trips after the first prefetch.
 */

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

interface NavState {
  swapping: boolean;
  lastPathname: string;
}

const state: NavState = {
  swapping: false,
  lastPathname: window.location.pathname,
};

/** In-memory cache for prefetched page HTML (string = resolved, Promise = in-flight). */
const pageCache: Record<string, string | Promise<string>> = {};

/** Track in-flight prefetch requests so stale ones can be aborted. */
let prefetchAborts: AbortController[] = [];

function cancelStalePrefetches(): void {
  prefetchAborts.forEach(c => c.abort());
  prefetchAborts = [];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MIN_DELTA = 40;
const BOTTOM_THRESHOLD = 5;
const TOP_THRESHOLD = 5;

/* ------------------------------------------------------------------ */
/*  Detection                                                          */
/* ------------------------------------------------------------------ */

function isPaginatedListPage(): boolean {
  if (!document.querySelector('nav.pagination')) return false;
  if (
    !document.querySelector('section.article-list') &&
    !document.querySelector('section.article-list--compact')
  )
    return false;
  if (document.querySelector('#novel-reader-root')) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/*  URL helpers                                                        */
/* ------------------------------------------------------------------ */

function getPageUrl(direction: 'prev' | 'next'): string | null {
  const label = direction === 'prev' ? 'Previous page' : 'Next page';
  const link = document.querySelector(
    `nav.pagination a[aria-label="${label}"]:not(.disabled):not([aria-disabled="true"])`
  ) as HTMLAnchorElement | null;

  if (!link) return null;

  try {
    return new URL(link.href).pathname;
  } catch {
    return link.getAttribute('href');
  }
}

/* ------------------------------------------------------------------ */
/*  Prefetch                                                           */
/* ------------------------------------------------------------------ */

function prefetch(url: string): void {
  if (pageCache[url]) return;
  // 认领 head inline 脚本提前启动的 Promise 或已完成的字符串
  const early = (window as any).__pageCache || {};
  if (early[url] !== undefined) {
    pageCache[url] = early[url];
    delete early[url];
    if (typeof pageCache[url] !== 'string') {
      (pageCache[url] as Promise<string>).then(t => { pageCache[url] = t; }).catch(() => { delete pageCache[url]; });
    }
    return;
  }
  // 兜底：AbortController 可被 cancelStalePrefetches 取消
  const ctrl = new AbortController();
  prefetchAborts.push(ctrl);
  const p = fetch(url, { signal: ctrl.signal })
    .then(r => { if (!r.ok) throw new Error(''); return r.text(); })
    .then(t => { pageCache[url] = t; return t; })
    .catch(() => { delete pageCache[url]; })
    .finally(() => { prefetchAborts = prefetchAborts.filter(c => c !== ctrl); });
  pageCache[url] = p;
}

function prefetchAdjacent(): void {
  if (!isPaginatedListPage()) return;
  cancelStalePrefetches();
  const next = getPageUrl('next');
  if (next) prefetch(next);
  const prev = getPageUrl('prev');
  if (prev) prefetch(prev);
}

/* ------------------------------------------------------------------ */
/*  Content swap                                                       */
/* ------------------------------------------------------------------ */

async function swapContent(
  url: string,
  historyMode: 'push' | 'replace' = 'replace'
): Promise<void> {
  let html: string;
  // 先看 pageCache（custom.ts 已认领的）
  const cached = pageCache[url];
  if (cached) {
    delete pageCache[url];
    html = (typeof cached === 'string') ? cached : await cached;
  } else {
    // 再看 head inline 脚本的结果（custom.ts 还没跑时走这里）
    const early = (window as any).__pageCache || {};
    const earlyVal = early[url];
    if (earlyVal !== undefined) {
      delete early[url];
      html = (typeof earlyVal === 'string') ? earlyVal : await earlyVal;
    } else {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      html = await resp.text();
    }
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');

  const newList = doc.querySelector('section.article-list, section.article-list--compact');
  const newPag = doc.querySelector('nav.pagination');

  if (!newList) throw new Error('No article list in fetched page');

  const oldList = document.querySelector('section.article-list, section.article-list--compact');
  if (oldList) {
    oldList.replaceWith(newList);
  } else {
    const mainEl = document.querySelector('main.main');
    if (mainEl) mainEl.appendChild(newList);
  }

  const oldPag = document.querySelector('nav.pagination');
  if (oldPag && newPag) {
    oldPag.replaceWith(newPag);
  } else if (newPag && !oldPag) {
    const mainEl = document.querySelector('main.main');
    if (mainEl) mainEl.appendChild(newPag);
  } else if (!newPag && oldPag) {
    oldPag.remove();
  }

  if (historyMode === 'push') {
    history.pushState({}, '', url);
  } else {
    history.replaceState({}, '', url);
  }

  if ((window as any).Stack && typeof (window as any).Stack.init === 'function') {
    (window as any).Stack.init();
  }

  window.scrollTo(0, 0);

  prefetchAdjacent();
}

/* ------------------------------------------------------------------ */
/*  Navigation                                                         */
/* ------------------------------------------------------------------ */

function navigateToUrl(url: string, historyMode: 'push' | 'replace'): void {
  if (state.swapping) return;

  state.swapping = true;
  state.lastPathname = url;

  swapContent(url, historyMode)
    .catch((err) => {
      console.error('Navigation failed, falling back:', err);
      window.location.href = url;
    })
    .finally(() => {
      state.swapping = false;
    });
}

/* ------------------------------------------------------------------ */
/*  Wheel handler                                                      */
/* ------------------------------------------------------------------ */

function handleWheel(e: WheelEvent): void {
  if (window.location.pathname !== state.lastPathname) {
    state.swapping = false;
    state.lastPathname = window.location.pathname;
    prefetchAdjacent();
    return;
  }

  if (state.swapping) return;
  if (!isPaginatedListPage()) return;
  if (Math.abs(e.deltaY) < MIN_DELTA) return;

  let direction: 'prev' | 'next' | null = null;

  if (e.deltaY > 0 && isAtBottom()) {
    direction = 'next';
  } else if (e.deltaY < 0 && isAtTop()) {
    direction = 'prev';
  }

  if (!direction) return;

  const url = getPageUrl(direction);
  if (!url) return;

  e.preventDefault();
  navigateToUrl(url, 'replace');
}

/* ------------------------------------------------------------------ */
/*  Click handler for pagination links                                 */
/* ------------------------------------------------------------------ */

function handlePaginationClick(e: MouseEvent): void {
  if (!isPaginatedListPage()) return;

  const target = e.target as HTMLElement;
  const link = target.closest('nav.pagination a.page-link') as HTMLAnchorElement | null;
  if (!link) return;

  if (
    link.classList.contains('disabled') ||
    link.classList.contains('current') ||
    link.hasAttribute('aria-disabled') ||
    link.hasAttribute('aria-current')
  )
    return;

  const href = link.getAttribute('href');
  if (!href) return;

  let url: string;
  try {
    url = new URL(href).pathname;
  } catch {
    url = href;
  }

  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  navigateToUrl(url, 'push');
}

/* ------------------------------------------------------------------ */
/*  Scroll helpers                                                     */
/* ------------------------------------------------------------------ */

function isAtBottom(): boolean {
  const de = document.documentElement;
  return de.scrollTop + de.clientHeight >= de.scrollHeight - BOTTOM_THRESHOLD;
}

function isAtTop(): boolean {
  return document.documentElement.scrollTop <= TOP_THRESHOLD;
}

/* ------------------------------------------------------------------ */
/*  Initialisation                                                     */
/* ------------------------------------------------------------------ */

document.addEventListener('wheel', handleWheel, { passive: false });
document.addEventListener('click', handlePaginationClick, true);

// Expose for Swup page:view hook
(window as any).__prefetchAdjacent = prefetchAdjacent;

prefetchAdjacent();
