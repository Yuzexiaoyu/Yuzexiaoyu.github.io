type SitePlayer = {
  audio: HTMLAudioElement;
  pause(): void;
  play(): void;
};

let primedMusic: HTMLAudioElement | undefined;

export function primeTopicMusic(root: HTMLElement, signal: AbortSignal) {
  root.addEventListener('click', event => {
    if (!event.isTrusted || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const card = event.target instanceof Element ? event.target.closest('.wk-topic-card') : null;
    const music = card?.querySelector<HTMLAudioElement>('[data-topic-music]');
    if (!music) return;

    // WebKit grants playback to the element used in the click handler. Reuse it after Swup replaces the page.
    primedMusic = music;
    void music.play().catch(() => {});
    music.pause();
  }, {signal});
}

export function bindTopicMusic(root: HTMLElement, signal: AbortSignal) {
  const track = root.querySelector<HTMLAudioElement>('[data-topic-music]');
  if (!track) return;
  const music = primedMusic?.src === track.src ? primedMusic : track;
  primedMusic = undefined;
  if (music !== track) track.replaceWith(music);

  const playButton = root.querySelector<HTMLButtonElement>('[data-topic-music-play]');
  const sitePlayer = (window as Window & {aplayerInstance?: SitePlayer}).aplayerInstance;
  const previousPlayer = sitePlayer?.audio && !sitePlayer.audio.paused ? sitePlayer : undefined;
  previousPlayer?.pause();

  const play = () => {
    void music.play().then(() => {
      if (playButton) playButton.hidden = true;
    }).catch((error: DOMException) => {
      if (!signal.aborted && playButton && error.name === 'NotAllowedError') playButton.hidden = false;
    });
  };
  playButton?.addEventListener('click', play, {signal});

  let resumeOnReturn = false;
  window.addEventListener('pagehide', () => {
    resumeOnReturn = !music.paused;
    music.pause();
  }, {signal});
  window.addEventListener('pageshow', event => {
    if (event.persisted && resumeOnReturn) play();
  }, {signal});
  signal.addEventListener('abort', () => {
    music.pause();
    music.removeAttribute('src');
    music.load();
    previousPlayer?.play();
  }, {once: true});

  let started = false;
  return () => {
    if (started) return;
    started = true;
    play();
  };
}
