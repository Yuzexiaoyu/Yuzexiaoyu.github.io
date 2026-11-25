import {bindTopicMusic, primeTopicMusic} from './workshop-topic-music';
import {canPreload} from './preload-policy';

let mounted: HTMLElement | null = null;
let controller: AbortController | undefined;
type Topic = {url: URL; sources: HTMLTemplateElement};
let catalog: {root: HTMLElement; topic: Topic | undefined; frame: number; events: AbortController} | undefined;
let warmed: {path: string; video: HTMLVideoElement} | undefined;

function releaseVideo(video: HTMLVideoElement) {
  video.removeAttribute('src');
  video.load();
}

function portraitQuery(template: HTMLTemplateElement) {
  return matchMedia(template.content.querySelector('source[media]')?.getAttribute('media') || '(max-aspect-ratio: 4/5)');
}

function selectCandidates(template: HTMLTemplateElement, video: HTMLVideoElement, mobile: boolean, tall: boolean) {
  const supported = Array.from(template.content.querySelectorAll('source'))
    .filter(source => Boolean(source.media) === tall && video.canPlayType(source.type));
  const urls = supported.map(source => new URL(source.getAttribute('src')!, document.baseURI));
  const mp4 = urls[supported.findIndex(source => source.type.startsWith('video/mp4'))];
  const candidates = mobile && mp4 ? [mp4, ...urls.filter(url => url !== mp4)] : urls;
  // Retry the compact MP4 on Pages before trying the larger CDN encodes.
  if (mp4 && mp4.origin !== location.origin) candidates.splice(1, 0, new URL(mp4.pathname, location.origin));
  return candidates.map(url => url.href);
}

function findTopic(root: ParentNode): Topic | undefined {
  const sources = root.querySelector<HTMLTemplateElement>('[data-topic-video-sources]');
  if (sources?.dataset.topicPath) return {sources, url: new URL(sources.dataset.topicPath, document.baseURI)};
}

function warmVideo(topic: Topic, preload: 'metadata' | 'auto') {
  const current = warmed?.path === topic.url.pathname ? warmed.video : undefined;
  const video = current || document.createElement('video');
  const mobile = document.documentElement.dataset.ui === 'mobile';
  const [source] = selectCandidates(topic.sources, video, mobile, mobile && portraitQuery(topic.sources).matches);
  if (!source) return;
  if (current?.src === source) {
    if (preload === 'auto') current.preload = 'auto';
    return;
  }
  if (warmed) releaseVideo(warmed.video);
  video.muted = true;
  video.playsInline = true;
  video.preload = preload;
  warmed = {path: topic.url.pathname, video};
  video.addEventListener('error', () => {
    if (warmed?.video === video) warmed = undefined;
  }, {once:true});
  video.src = source;
}

function warmTopicPage(topic: Topic) {
  const swup = (window as any).swup;
  const path = topic.url.pathname + topic.url.search;
  if (swup?.cache.get(path)) return;
  void swup?.preload?.(path)?.then((page: {html: string} | undefined) => {
    if (page && !page.html.includes('data-topic-video')) swup.cache.delete(path);
  }).catch(() => {});
}

function preloadHome() {
  const topic = findTopic(document);
  if (!topic || !canPreload()) return;
  warmTopicPage(topic);
  // Let the browser buffer metadata on the homepage, upgrading on workshop entry.
  warmVideo(topic, 'metadata');
}

function prepareCatalog(root: HTMLElement) {
  if (catalog?.root === root) return;
  const topic = findTopic(root);
  const card = root.querySelector<HTMLAnchorElement>('a[data-catalog-topic]');
  if (card) card.hidden = new URLSearchParams(location.search).get('tab') === 'product';
  const events = new AbortController();
  primeTopicMusic(root, events.signal);
  const frame = requestAnimationFrame(() => {
    if (!topic || card?.hidden || !canPreload()) return;
    warmTopicPage(topic);
    warmVideo(topic, 'auto');
  });
  catalog = {root, topic, frame, events};
}

function destroy(nextUrl?: string) {
  controller?.abort();
  controller = undefined;
  mounted = null;
  const nextPath = nextUrl && new URL(nextUrl, document.baseURI).pathname;
  if (catalog) {
    cancelAnimationFrame(catalog.frame);
    catalog.events.abort();
    // An explicit navigation starts the media alongside HTML even on a slow connection.
    if (catalog.topic && catalog.topic.url.pathname === nextPath) warmVideo(catalog.topic, 'auto');
    catalog = undefined;
  }
  if (warmed && warmed.path !== nextPath && nextPath !== '/prints/') {
    releaseVideo(warmed.video);
    warmed = undefined;
  }
}

function mount(root: HTMLElement) {
  if (mounted === root) return;
  const preloaded = warmed?.video;
  warmed = undefined;
  destroy();
  mounted = root;
  controller = new AbortController();
  const {signal} = controller;
  const startMusic = bindTopicMusic(root, signal);
  let video = root.querySelector<HTMLVideoElement>('[data-topic-video]')!;
  const template = root.querySelector<HTMLTemplateElement>('[data-topic-video-sources]');
  if (!video || !template) {
    if (preloaded) releaseVideo(preloaded);
    startMusic?.();
    return;
  }

  const portrait = portraitQuery(template);
  const mobile = document.documentElement.dataset.ui === 'mobile';
  const poster = root.querySelector<HTMLImageElement>('[data-topic-poster]')!;
  const posters = root.querySelector<HTMLTemplateElement>('[data-topic-posters]')?.content;
  const widePoster = posters?.querySelector('img[data-wide]')?.getAttribute('src') || poster.src;
  const tallPoster = posters?.querySelector('img[data-tall]')?.getAttribute('src') ||
    root.querySelector<HTMLTemplateElement>('[data-topic-portrait-poster]')?.content.querySelector('img')?.getAttribute('src');
  const playButton = root.querySelector<HTMLButtonElement>('[data-topic-video-play]');
  let candidates = selectCandidates(template, video, mobile, mobile && portrait.matches);
  if (preloaded) {
    if (!preloaded.error && preloaded.src === candidates[0]) {
      // Keep the in-flight request and buffered bytes owned by this media element.
      for (const attribute of video.attributes) preloaded.setAttribute(attribute.name, attribute.value);
      video.replaceWith(preloaded);
      video = preloaded;
    } else releaseVideo(preloaded);
  }
  let index = 0;

  function offerPlayback() {
    poster.hidden = false;
    if (playButton) playButton.hidden = false;
    else root.addEventListener('click', retry, {once:true, signal});
    startMusic?.();
  }

  function play() {
    const source = video.src;
    void video.play().catch((error: DOMException) => {
      if (!signal.aborted && video.src === source && error.name === 'NotAllowedError') offerPlayback();
      // Network and decoder failures advance to the next source via the media error event.
    });
  }

  function loadCandidate() {
    video.classList.remove('is-playing');
    if (index >= candidates.length) { offerPlayback(); return; }
    if (playButton) playButton.hidden = true;
    if (video.src !== candidates[index] || video.error) video.src = candidates[index];
    play();
  }

  function selectSources() {
    const tall = mobile && portrait.matches;
    poster.src = (tall && tallPoster) || widePoster;
    poster.hidden = !mobile;
    candidates = selectCandidates(template, video, mobile, tall);
    index = 0;
    loadCandidate();
  }

  function retry() {
    if (index >= candidates.length) selectSources();
    else play();
  }

  video.muted = true;
  poster.addEventListener('error', () => {
    const url = new URL(poster.src);
    if (url.origin !== location.origin) poster.src = url.pathname;
  }, {signal});
  video.addEventListener('playing', () => {
    video.classList.add('is-playing');
    if (playButton) playButton.hidden = true;
    startMusic?.();
  }, {signal});
  video.addEventListener('error', () => {
    if (!video.error) return;
    index++;
    loadCandidate();
  }, {signal});
  playButton?.addEventListener('click', retry, {signal});
  if (mobile) portrait.addEventListener('change', selectSources, {signal});
  signal.addEventListener('abort', () => releaseVideo(video), {once:true});
  selectSources();
}

(window as any).WorkshopTopic = {mount, destroy, prepareCatalog, preloadHome};
