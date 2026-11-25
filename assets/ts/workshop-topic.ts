import {bindTopicMusic, primeTopicMusic} from './workshop-topic-music';

let mounted: HTMLElement | null = null;
let controller: AbortController | undefined;

function destroy() {
  controller?.abort();
  controller = undefined;
  mounted = null;
}

function mount(root: HTMLElement) {
  if (mounted === root) return;
  destroy();
  mounted = root;
  controller = new AbortController();
  const {signal} = controller;
  const startMusic = bindTopicMusic(root, signal);
  const video = root.querySelector<HTMLVideoElement>('[data-topic-video]')!;
  const template = root.querySelector<HTMLTemplateElement>('[data-topic-video-sources]');
  if (!video || !template) { startMusic?.(); return; }

  const sources = Array.from(template.content.querySelectorAll('source'));
  const portrait = matchMedia(sources.find(source => source.media)?.media || '(max-aspect-ratio: 4/5)');
  const mobile = document.documentElement.dataset.ui === 'mobile';
  const poster = root.querySelector<HTMLImageElement>('[data-topic-poster]')!;
  const posters = root.querySelector<HTMLTemplateElement>('[data-topic-posters]')?.content;
  const widePoster = posters?.querySelector('img[data-wide]')?.getAttribute('src') || poster.src;
  const tallPoster = posters?.querySelector('img[data-tall]')?.getAttribute('src') ||
    root.querySelector<HTMLTemplateElement>('[data-topic-portrait-poster]')?.content.querySelector('img')?.getAttribute('src');
  const playButton = root.querySelector<HTMLButtonElement>('[data-topic-video-play]');
  let candidates: string[] = [];
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
    video.src = candidates[index];
    play();
  }

  function selectSources() {
    const tall = mobile && portrait.matches;
    poster.src = (tall && tallPoster) || widePoster;
    poster.hidden = !mobile;
    const supported = sources.filter(source => Boolean(source.media) === tall && video.canPlayType(source.type));
    const mp4 = supported.find(source => source.type.startsWith('video/mp4'));
    candidates = supported.map(source => source.src);
    if (mobile && mp4) candidates = [mp4.src, ...candidates.filter(url => url !== mp4.src)];
    // Pages also serves the published MP4 if the media CDN is unreachable.
    if (mp4) {
      const url = new URL(mp4.src, document.baseURI);
      if (url.origin !== location.origin) candidates.push(new URL(url.pathname, location.origin).href);
    }
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
  signal.addEventListener('abort', () => {
    video.removeAttribute('src');
    video.load();
  }, {once:true});
  selectSources();
}

(window as any).WorkshopTopic = {mount, destroy, primeMusic: primeTopicMusic};
