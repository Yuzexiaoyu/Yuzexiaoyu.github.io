import {Asset, Entry, firstVideoIndexForColor} from './workshop-shared';
import {canPreload, cancelPreloadOnPause} from './preload-policy';

const pages = new Map<string, Promise<unknown>>();
const failedAv1 = new Set<string>();
let warmed: {url: string; video: HTMLVideoElement; events: AbortController} | undefined;

export function productVideoSource(video: HTMLVideoElement, asset: Asset) {
  const alternative = asset.av1;
  if (alternative?.url && !failedAv1.has(alternative.url) && video.canPlayType('video/webm; codecs="av01.0.08M.08, opus"')) {
    return alternative;
  }
  return asset;
}

export function useOriginalVideo(video: HTMLVideoElement, asset?: Asset): boolean {
  const alternative = asset?.av1?.url;
  if (!video.error || video.error.code === MediaError.MEDIA_ERR_ABORTED ||
      !alternative || !asset?.url || alternative === asset.url || video.getAttribute('src') !== alternative) return false;
  failedAv1.add(alternative);
  video.src = asset.url;
  return true;
}

function discardWarmVideo() {
  if (!warmed) return;
  const {video, events} = warmed;
  warmed = undefined;
  events.abort();
  video.removeAttribute('src');
  video.load();
}

function warmVideo(entry: Entry) {
  const asset = entry.videos?.[firstVideoIndexForColor(entry)];
  if (!asset?.url || warmed?.url === asset.url) return;
  discardWarmVideo();
  const video = document.createElement('video');
  const events = new AbortController();
  const source = productVideoSource(video, asset);
  video.muted = true;
  video.playsInline = true;
  const preloadMode = (bytes: number) => bytes <= 8 * 1024 * 1024 ? 'auto' : 'metadata';
  video.preload = preloadMode(source.size);
  warmed = {url: asset.url, video, events};
  cancelPreloadOnPause(discardWarmVideo, events.signal);
  video.addEventListener('error', () => {
    if (useOriginalVideo(video, asset)) video.preload = preloadMode(asset.size);
    else discardWarmVideo();
  }, {signal: events.signal});
  video.src = source.url!;
}

export function takePreloadedVideo(url?: string | null): HTMLVideoElement | undefined {
  if (!warmed || warmed.url !== url) {
    discardWarmVideo();
    return;
  }
  const {video, events} = warmed;
  warmed = undefined;
  events.abort();
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
    const card = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('.wk-card') : null;
    const entry = card && items.get(card);
    if (!entry || !canPreload()) return;
    if (event.type === 'click' && event instanceof MouseEvent && !event.defaultPrevented &&
        event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      warmVideo(entry);
    }
    void warmPage(card!.href);
  };
  for (const type of ['pointerover', 'focusin', 'touchstart', 'click']) {
    root.addEventListener(type, prioritize, {signal: pending.signal, passive: true});
  }
  const run = async () => {
    // Warm detail HTML after the list paints. Media starts on a card's click.
    for (const card of cards.slice(0, 4)) {
      if (pending.signal.aborted || !canPreload()) return;
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
