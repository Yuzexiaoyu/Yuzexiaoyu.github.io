import { canPreload, connection } from './preload-policy';

type Task = () => Promise<unknown> | void;
type FetchArgs = {url: string; options: RequestInit};
const w = window as any;
const WORKSHOP_PAGE = '/prints/';
const COVER_WAIT_MS = 1800;
const covers = new Set<string>();
let mounted = false;
let page: HTMLElement | null = null;
let group: HTMLElement | null = null;
let schedule: AbortController | undefined;
let queue: Task[] = [];
let running = 0;
let watchingWorkshop = false;
let workshopRequests = 0;
let onWorkshopRequest: (() => void) | undefined;

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
  onWorkshopRequest = undefined;
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

async function preloadPage(url: string): Promise<void> {
  const result = await w.swup.preload(url);
  // Some HTTP error documents reach the plugin cache. Let navigation retry.
  if (result && !/<main\b[^>]*\bclass=["'][^"']*\bmain\b/.test(result.html)) w.swup.cache.delete(url);
}

function watchWorkshopRequests(): void {
  if (watchingWorkshop || !w.swup?.hooks) return;
  watchingWorkshop = true;
  w.swup.hooks.replace('fetch:request', (visit: unknown, args: FetchArgs, send: (visit: unknown, args: FetchArgs) => Promise<Response>) => {
    const response = send(visit, args);
    if (args.url !== WORKSHOP_PAGE) return response;
    workshopRequests++;
    const notify = onWorkshopRequest;
    onWorkshopRequest = undefined;
    notify?.();
    return response.finally(() => { workshopRequests--; });
  });
}

async function preloadWorkshopPage(signal: AbortSignal): Promise<void> {
  const warmVideo = () => {
    if (!signal.aborted && canPreload()) w.WorkshopTopic?.preloadHomeVideo?.();
  };
  // Hover or focus can have already dispatched the request before the covers settle.
  if (workshopRequests || w.swup.cache.has(WORKSHOP_PAGE)) warmVideo();
  else onWorkshopRequest = warmVideo;
  try {
    await preloadPage(WORKSHOP_PAGE);
    if (!signal.aborted && canPreload()) w.WorkshopTopic?.preloadHomePage?.();
  } finally {
    if (onWorkshopRequest === warmVideo) {
      onWorkshopRequest = undefined;
      if (w.swup.cache.has(WORKSHOP_PAGE)) warmVideo();
    }
  }
}

function enqueueHomeMedia(mobile: boolean): void {
  if (!mobile && !w.__isMobileDevice?.()) queue.push(() => w.__warmNextBookshelfVideo?.());
  for (const url of (w.__preloadData?.novelCovers || []).slice(0, mobile ? 4 : 8)) {
    queue.push(() => warmCover(url));
  }
  if (!mobile) queue.push(() => w.__enableAudioPreload?.());
  pump();
}

async function refresh(): Promise<void> {
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
  if (current) schedule = new AbortController();
  const signal = schedule?.signal;
  if (current && signal) {
    // Use the actual cards so the paint and the preload share one image request.
    const images = current.querySelectorAll<HTMLImageElement>('.article-image img');
    const decoded = Promise.all(Array.from(images, image => {
      image.fetchPriority = 'high';
      image.loading = 'eager';
      return image.decode().catch(() => {}); // A broken cover must release the queue, too.
    }));
    await new Promise<void>(resolve => {
      const finish = () => {
        clearTimeout(timeout);
        signal.removeEventListener('abort', finish);
        resolve();
      };
      // Keep slow images loading in their reserved slots while the queue proceeds.
      const timeout = window.setTimeout(finish, COVER_WAIT_MS);
      signal.addEventListener('abort', finish, {once: true});
      void decoded.then(finish);
    });
    if (signal.aborted || !canPreload()) return;
  }
  const articles = current?.querySelectorAll<HTMLAnchorElement>('.article-title a') || [];
  const menu = document.querySelectorAll<HTMLAnchorElement>(mobile ? '.m-navigation nav a[href]' : '#main-menu a[href]');
  for (const link of [...Array.from(articles).slice(0, 6), ...menu]) {
    const url = link.pathname + link.search;
    if (link.origin === location.origin && !link.target && !link.hasAttribute('download') &&
        url !== location.pathname + location.search) urls.add(url);
  }
  const enqueuePages = () => {
    for (const url of urls) queue.push(() => preloadPage(url));
  };
  if (signal) {
    urls.delete(WORKSHOP_PAGE);
    queue.push(async () => {
      try { await w.__warmWorkshop?.(signal); }
      catch { /* Opening the workshop can retry. Other pages can still warm. */ }
      if (signal.aborted || !canPreload()) return;
      enqueuePages();
      afterLoadIdle(() => enqueueHomeMedia(mobile), signal);
    }, () => preloadWorkshopPage(signal));
  } else {
    enqueuePages();
  }
  pump();
}

export const pagePreload = {
  allowed: canPreload,
  start() { mounted = true; watchWorkshopRequests(); refresh(); },
  stop() { mounted = false; clearQueue(); },
  refresh
};

document.addEventListener('visibilitychange', refresh);
connection?.addEventListener('change', refresh);
window.addEventListener('online', refresh);
window.addEventListener('offline', refresh);
