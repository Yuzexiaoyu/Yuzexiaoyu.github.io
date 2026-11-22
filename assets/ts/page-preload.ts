import { canPreload, connection } from './preload-policy';

type Task = () => Promise<unknown> | void;
const w = window as any;
const covers = new Set<string>();
let mounted = false;
let page: HTMLElement | null = null;
let group: HTMLElement | null = null;
let schedule: AbortController | undefined;
let queue: Task[] = [];
let running = 0;

function warmCover(url: string): Promise<void> | void {
  if (covers.has(url)) return;
  covers.add(url);
  return new Promise(resolve => {
    const image = new Image();
    image.decoding = 'async';
    image.fetchPriority = 'low';
    const finish = (loaded: boolean) => {
      clearTimeout(timer);
      image.onload = image.onerror = null;
      if (!loaded) covers.delete(url);
      resolve();
    };
    const timer = window.setTimeout(() => { image.removeAttribute('src'); finish(false); }, 10000);
    image.onload = () => finish(true);
    image.onerror = () => finish(false);
    image.src = url;
  });
}

// Keep the same two slots across page/group changes. An in-flight HTML request
// can still satisfy a click via Swup while the pending work is replaced.
function pump(): void {
  while (running < 2 && queue.length && canPreload()) {
    const task = queue.shift()!;
    running++;
    (async () => {
      try { await task(); } catch { /* A subsequent visit can retry. */ }
      finally { running--; pump(); }
    })();
  }
}

function clearQueue(): void {
  schedule?.abort();
  schedule = undefined;
  queue = [];
  page = group = null;
}

function afterLoadIdle(run: () => void, signal: AbortSignal): void {
  const idle = () => {
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(run, {timeout: 2000});
      signal.addEventListener('abort', () => window.cancelIdleCallback(id), {once: true});
    } else {
      const id = window.setTimeout(run, 200);
      signal.addEventListener('abort', () => clearTimeout(id), {once: true});
    }
  };
  if (document.readyState === 'complete') idle();
  else window.addEventListener('load', idle, {signal, once: true});
}

function refresh(): void {
  if (!mounted || !w.swup?.preload) return;
  if (!canPreload()) { clearQueue(); return; }
  const mobile = !!w.__isMobileUI?.();
  const current = mobile
    ? document.querySelector<HTMLElement>('.m-home-track [aria-hidden="false"]')
    : Array.from(document.querySelectorAll<HTMLElement>('main > .home-article-list')).find(el => el.style.display !== 'none') || null;
  if (page === document.body && group === current) return;
  clearQueue();
  page = document.body;
  group = current;
  const urls = new Set<string>();
  const articles = current?.querySelectorAll<HTMLAnchorElement>('.article-title a') || [];
  const menu = document.querySelectorAll<HTMLAnchorElement>(mobile ? '.m-navigation nav a[href]' : '#main-menu a[href]');
  for (const link of [...Array.from(articles).slice(0, 6), ...menu]) {
    const url = link.pathname + link.search;
    if (link.origin === location.origin && !link.target && !link.hasAttribute('download') &&
        url !== location.pathname + location.search) urls.add(url);
  }
  if (current) schedule = new AbortController();
  const signal = schedule?.signal;
  const prioritizeWorkshop = mobile && urls.has('/prints/');
  if (prioritizeWorkshop && signal) queue.push(() => w.__warmWorkshop?.(signal));
  for (const url of urls) {
    queue.push(async () => {
      const result = await w.swup.preload(url);
      // Some HTTP error documents reach the plugin cache. Let navigation retry.
      if (result && !/<main\b[^>]*\bclass=["'][^"']*\bmain\b/.test(result.html)) w.swup.cache.delete(url);
    });
  }
  pump();
  if (!signal) return;

  afterLoadIdle(() => {
    if (!prioritizeWorkshop) queue.push(() => w.__warmWorkshop?.(signal));
    if (!mobile && !w.__isMobileDevice?.()) queue.push(() => w.__warmNextBookshelfVideo?.());
    for (const url of (w.__preloadData?.novelCovers || []).slice(0, mobile ? 4 : 8)) {
      queue.push(() => warmCover(url));
    }
    if (!mobile) queue.push(() => w.__enableAudioPreload?.());
    pump();
  }, signal);
}

export const pagePreload = {
  allowed: canPreload,
  start() { mounted = true; refresh(); },
  stop() { mounted = false; clearQueue(); },
  refresh
};

document.addEventListener('visibilitychange', refresh);
connection?.addEventListener('change', refresh);
window.addEventListener('online', refresh);
window.addEventListener('offline', refresh);
