import {Entry, firstVideoIndexForColor} from './workshop-shared';
import {canPreload} from './preload-policy';

const videos = new Map<string, HTMLVideoElement>();
const pages = new Map<string, Promise<unknown>>();
const MAX_WARM_VIDEOS = 2;

function warmVideo(entry: Entry, engaged = false) {
  const asset = entry.videos?.[firstVideoIndexForColor(entry)];
  if (!asset?.url) return;
  const buffered = videos.get(asset.url);
  const preload = engaged && asset.size <= 8 * 1024 * 1024 ? 'auto' : 'metadata';
  if (buffered) {
    if (preload === 'auto') buffered.preload = preload;
    return;
  }
  while (videos.size >= MAX_WARM_VIDEOS) {
    const [url, video] = videos.entries().next().value!;
    video.removeAttribute('src');
    video.load();
    videos.delete(url);
  }
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = preload;
  video.src = asset.url;
  video.addEventListener('error', () => {
    if (videos.get(asset.url!) === video) videos.delete(asset.url!);
  }, {once: true});
  videos.set(asset.url, video);
  video.load();
}

export function takePreloadedVideo(url?: string | null): HTMLVideoElement | undefined {
  if (!url) return;
  const video = videos.get(url);
  videos.delete(url);
  return video;
}

function warmPage(href: string): Promise<unknown> {
  // Swup must own the HTML cache so a click consumes the prefetched response.
  const swup = (window as any).swup;
  if (!swup?.preload) return Promise.resolve();
  if (!pages.has(href)) {
    pages.set(href, Promise.resolve(swup.preload(href)).catch(() => {}).finally(() => { pages.delete(href); }));
  }
  return pages.get(href)!;
}

export function preloadCatalogEntries(root: HTMLElement, entries: Entry[], signal: AbortSignal): () => void {
  const pending = new AbortController();
  const stop = () => pending.abort();
  signal.addEventListener('abort', stop, {once: true});
  const cards = Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-workshop-item]'));
  const items = new Map(cards.map((card, i) => [card, entries[i]]));
  const prioritize = (event: Event) => {
    const card = (event.target as Element).closest<HTMLAnchorElement>('.wk-card');
    const entry = card && items.get(card);
    if (!entry || !canPreload()) return;
    warmVideo(entry,true);
    void warmPage(card!.href);
  };
  for (const type of ['pointerover', 'focusin', 'touchstart']) {
    root.addEventListener(type, prioritize, {signal: pending.signal, passive: true});
  }
  const run = async () => {
    // Start after the list paints, with bounded media work and one HTML request at a time.
    for (const [index, card] of cards.slice(0, 4).entries()) {
      if (pending.signal.aborted || !canPreload()) return;
      if (index < MAX_WARM_VIDEOS) warmVideo(items.get(card)!);
      await warmPage(card.href);
    }
  };
  let idle: number | undefined;
  let timer: number | undefined;
  const frame = requestAnimationFrame(() => {
    if (pending.signal.aborted) return;
    if ('requestIdleCallback' in window) idle = window.requestIdleCallback(() => { void run(); }, {timeout: 600});
    else timer = window.setTimeout(() => { void run(); }, 150);
  });
  pending.signal.addEventListener('abort', () => {
    cancelAnimationFrame(frame);
    if (idle !== undefined) window.cancelIdleCallback(idle);
    if (timer !== undefined) window.clearTimeout(timer);
    signal.removeEventListener('abort', stop);
  }, {once: true});
  return stop;
}
