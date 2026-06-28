/**
 * Scroll-wheel page navigation for paginated list pages.
 * Boundary-triggered: scroll past bottom → next page, past top → previous page.
 *
 * Uses fetch + manual DOM replacement (article list + pagination only).
 * Leaves the sidebar and all other page chrome untouched — no Swup hook,
 * no body swap, no CSS animation replay.
 *
 * This module is side-effect-only — it registers a document-level wheel
 * listener at load time. Since custom.ts is loaded as a <script defer>,
 * the listener survives all Swup body swaps without re-initialization.
 */

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

interface NavState {
  swapping: boolean;   // prevents concurrent fetch+swap calls
  lastPathname: string;
  prefetchedNext: string | null;
  prefetchedPrev: string | null;
}

const state: NavState = {
  swapping: false,
  lastPathname: window.location.pathname,
  prefetchedNext: null,
  prefetchedPrev: null,
};

/** In-memory cache for prefetched page HTML, bypasses HTTP cache headers. */
const pageCache: Record<string, string> = {};

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/** Minimum wheel delta (px) to trigger navigation — filters trackpad settling */
const MIN_DELTA = 40;
/** Tolerance for "at bottom" check (accounts for sub-pixel rounding) */
const BOTTOM_THRESHOLD = 5;
/** Tolerance for "at top" check */
const TOP_THRESHOLD = 5;

/* ------------------------------------------------------------------ */
/*  Detection                                                          */
/* ------------------------------------------------------------------ */

/** Returns true only when the current page is a paginated list page. */
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

/** Returns the prev/next page pathname, or null when unavailable. */
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
/*  Content swap                                                       */
/* ------------------------------------------------------------------ */

/**
 * Fetches the target page, extracts the article list + pagination,
 * swaps them into the current DOM, and updates the URL.
 *
 * @param url          Target page pathname.
 * @param historyMode  "replace" for wheel (continuous scroll — back exits
 *                     the list); "push" for clicks (intentional navigation).
 */
async function swapContent(
  url: string,
  historyMode: 'push' | 'replace' = 'replace'
): Promise<void> {
  // Use in-memory cache if prefetched, otherwise fetch
  let html: string;
  if (pageCache[url]) {
    html = pageCache[url]!;
    delete pageCache[url];
  } else {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    html = await resp.text();
  }
  // Reset prefetch bookmarks — we're on a new page now
  state.prefetchedNext = null;
  state.prefetchedPrev = null;
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // ── Extract new content ──────────────────────────────────────────
  const newList = doc.querySelector('section.article-list, section.article-list--compact');
  const newPag = doc.querySelector('nav.pagination');

  if (!newList) throw new Error('No article list in fetched page');

  // ── Replace article list ─────────────────────────────────────────
  const oldList = document.querySelector('section.article-list, section.article-list--compact');
  if (oldList) {
    oldList.replaceWith(newList);
  } else {
    const mainEl = document.querySelector('main.main');
    if (mainEl) mainEl.appendChild(newList);
  }

  // ── Replace pagination ───────────────────────────────────────────
  const oldPag = document.querySelector('nav.pagination');
  if (oldPag && newPag) {
    oldPag.replaceWith(newPag);
  } else if (newPag && !oldPag) {
    const mainEl = document.querySelector('main.main');
    if (mainEl) mainEl.appendChild(newPag);
  } else if (!newPag && oldPag) {
    oldPag.remove();
  }

  // ── Update URL ───────────────────────────────────────────────────
  if (historyMode === 'push') {
    history.pushState({}, '', url);
  } else {
    history.replaceState({}, '', url);
  }

  // ── Re-init code copy buttons / color scheme on new content ─────
  if ((window as any).Stack && typeof (window as any).Stack.init === 'function') {
    (window as any).Stack.init();
  }

  // ── Scroll to top of new content ─────────────────────────────────
  window.scrollTo(0, 0);

  // ── Prefetch adjacent pages (idle) ───────────────────────────────
  schedulePrefetchAdjacent();
}

/* ------------------------------------------------------------------ */
/*  Navigation                                                         */
/* ------------------------------------------------------------------ */

/**
 * Shared entry point for both wheel and click navigation.
 * @param historyMode  "replace" for wheel scroll, "push" for clicks.
 */
function navigateToUrl(url: string, historyMode: 'push' | 'replace'): void {
  if (state.swapping) return; // prevent concurrent fetch+swap

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
  // ── Pathname change detection ──────────────────────────────────
  if (window.location.pathname !== state.lastPathname) {
    state.swapping = false;
    state.lastPathname = window.location.pathname;
    return;
  }

  // ── Concurrent-swap guard ──────────────────────────────────────
  if (state.swapping) return;

  // ── Relevance guard ────────────────────────────────────────────
  if (!isPaginatedListPage()) return;

  // ── Delta threshold ────────────────────────────────────────────
  if (Math.abs(e.deltaY) < MIN_DELTA) return;

  // ── Boundary check ─────────────────────────────────────────────
  let direction: 'prev' | 'next' | null = null;

  if (e.deltaY > 0 && isAtBottom()) {
    direction = 'next';
  } else if (e.deltaY < 0 && isAtTop()) {
    direction = 'prev';
  }

  if (!direction) return;

  // ── Resolve URL ────────────────────────────────────────────────
  const url = getPageUrl(direction);
  if (!url) return;

  // ── Navigate ───────────────────────────────────────────────────
  e.preventDefault();
  navigateToUrl(url, 'replace'); // wheel = continuous scroll, no history entry
}

/* ------------------------------------------------------------------ */
/*  Click handler for pagination links                                 */
/* ------------------------------------------------------------------ */

/**
 * Capture-phase click handler on document.
 * Intercepts clicks on pagination number buttons BEFORE Swup's
 * bubble-phase handler sees them, so Swup's stale internal URL
 * never causes a skipped navigation.
 */
function handlePaginationClick(e: MouseEvent): void {
  if (!isPaginatedListPage()) return;

  const target = e.target as HTMLElement;
  const link = target.closest('nav.pagination a.page-link') as HTMLAnchorElement | null;
  if (!link) return;

  // Skip disabled (prev/next at boundaries) and current-page button
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

  // Block Swup from seeing this event
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();

  navigateToUrl(url, 'push'); // click = intentional, add to history
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
/*  Prefetch adjacent pages (post-navigation)                           */
/* ------------------------------------------------------------------ */

/**
 * Prefetch next/prev page HTML into an in-memory cache (pageCache).
 * On the next navigation, swapContent reads from pageCache directly —
 * zero network latency, independent of HTTP cache headers. */
function schedulePrefetchAdjacent(): void {
  if (!isPaginatedListPage()) return;
  const nextUrl = getPageUrl('next');
  if (nextUrl && !pageCache[nextUrl] && nextUrl !== state.prefetchedNext) {
    state.prefetchedNext = nextUrl;
    fetch(nextUrl)
      .then(r => r.text())
      .then(t => { pageCache[nextUrl] = t; })
      .catch(() => {});
  }
  const prevUrl = getPageUrl('prev');
  if (prevUrl && !pageCache[prevUrl] && prevUrl !== state.prefetchedPrev) {
    state.prefetchedPrev = prevUrl;
    fetch(prevUrl)
      .then(r => r.text())
      .then(t => { pageCache[prevUrl] = t; })
      .catch(() => {});
  }
}


/* ------------------------------------------------------------------ */
/*  Initialisation                                                     */
/* ------------------------------------------------------------------ */

// Wheel: passive:false so we can preventDefault at page boundaries
document.addEventListener('wheel', handleWheel, { passive: false });

// Pagination clicks: capture phase fires before Swup's bubble handler,
// so Swup never sees a stale URL and never skips navigation.
document.addEventListener('click', handlePaginationClick, true);

// Prefetch adjacent pages on initial load, not just after navigation
schedulePrefetchAdjacent();
