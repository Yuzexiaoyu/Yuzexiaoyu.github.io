/**
 * Scroll-wheel page navigation for paginated list pages.
 * 纯本地分页：所有文章在构建时已渲染到 HTML 中，翻页仅切换 display，零网络请求。
 */

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MIN_DELTA = 40;
const BOTTOM_THRESHOLD = 5;
const TOP_THRESHOLD = 5;
const NAV_COOLDOWN = 300;

/* ------------------------------------------------------------------ */
/*  State                                                              */
/* ------------------------------------------------------------------ */

let currentPage = 1;
let lastNavTime = 0;

/* ------------------------------------------------------------------ */
/*  Detection                                                          */
/* ------------------------------------------------------------------ */

function isLocalPagination(): boolean {
  return !!document.querySelector('#local-pagination');
}

function getAllPageSections(): HTMLElement[] {
  return Array.from(document.querySelectorAll('section.article-list[data-page]'));
}

function getTotalPages(): number {
  return getAllPageSections().length;
}

/* ------------------------------------------------------------------ */
/*  Page switching (pure local, no fetch)                              */
/* ------------------------------------------------------------------ */

function showPage(pageNum: number): void {
  const sections = getAllPageSections();
  const total = sections.length;
  if (pageNum < 1 || pageNum > total) return;

  currentPage = pageNum;

  // 切换 section 显示
  sections.forEach((el) => {
    const p = parseInt(el.dataset.page || '0', 10);
    el.style.display = p === pageNum ? '' : 'none';
  });

  // 更新分页导航状态
  const nav = document.querySelector('#local-pagination');
  if (nav) {
    // 页码按钮
    nav.querySelectorAll('a[data-goto]').forEach((a) => {
      const num = parseInt((a as HTMLElement).dataset.goto || '0', 10);
      a.classList.toggle('current', num === pageNum);
      if (num === pageNum) {
        a.setAttribute('aria-current', 'page');
      } else {
        a.removeAttribute('aria-current');
      }
    });

    // 前后按钮
    const prev = nav.querySelector('a[data-dir="prev"]');
    const next = nav.querySelector('a[data-dir="next"]');
    if (prev) {
      prev.classList.toggle('disabled', pageNum <= 1);
      if (pageNum <= 1) prev.setAttribute('aria-disabled', 'true');
      else prev.removeAttribute('aria-disabled');
    }
    if (next) {
      next.classList.toggle('disabled', pageNum >= total);
      if (pageNum >= total) next.setAttribute('aria-disabled', 'true');
      else next.removeAttribute('aria-disabled');
    }
  }

  window.scrollTo(0, 0);
}

/* ------------------------------------------------------------------ */
/*  Wheel handler                                                      */
/* ------------------------------------------------------------------ */

function handleWheel(e: WheelEvent): void {
  if (!isLocalPagination()) return;
  if (Date.now() - lastNavTime < NAV_COOLDOWN) return;
  if (Math.abs(e.deltaY) < MIN_DELTA) return;

  const total = getTotalPages();
  let target: number | null = null;

  if (e.deltaY > 0 && isAtBottom() && currentPage < total) {
    target = currentPage + 1;
  } else if (e.deltaY < 0 && isAtTop() && currentPage > 1) {
    target = currentPage - 1;
  }

  if (target === null) return;

  e.preventDefault();
  lastNavTime = Date.now();
  showPage(target);
}

/* ------------------------------------------------------------------ */
/*  Click handler for pagination                                       */
/* ------------------------------------------------------------------ */

function handlePaginationClick(e: MouseEvent): void {
  if (!isLocalPagination()) return;

  const target = e.target as HTMLElement;
  const link = target.closest('#local-pagination a') as HTMLElement | null;
  if (!link) return;
  if (link.classList.contains('disabled') || link.classList.contains('current')) return;

  e.preventDefault();
  e.stopPropagation();

  const goto = link.dataset.goto;
  const dir = link.dataset.dir;

  if (goto) {
    showPage(parseInt(goto, 10));
  } else if (dir === 'prev') {
    showPage(currentPage - 1);
  } else if (dir === 'next') {
    showPage(currentPage + 1);
  }

  lastNavTime = Date.now();
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

// Expose for Swup page:view hook (重新初始化当前页状态)
(window as any).__prefetchAdjacent = function() {
  if (isLocalPagination()) {
    currentPage = 1;
    showPage(1);
  }
};
