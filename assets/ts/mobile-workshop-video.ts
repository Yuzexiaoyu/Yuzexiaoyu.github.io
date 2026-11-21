export const mobileVideoBar = `
  <div class="wk-video-bar" data-video-bar role="group" aria-label="视频播放控制">
    <button type="button" data-video-toggle aria-label="播放">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path data-play-icon d="M8 5v14l11-7z"/><path data-pause-icon d="M6 5h4v14H6zm8 0h4v14h-4z" hidden/></svg>
    </button>
    <input type="range" data-video-seek aria-label="播放进度" min="0" max="1" step="0.1" value="0" disabled>
    <span class="wk-video-time" data-video-time aria-hidden="true">0:00 / 0:00</span>
    <button type="button" class="wk-video-sound" data-video-sound>静音</button>
  </div>`;

function timestamp(seconds: number): string {
  const time = Math.floor(seconds);
  return `${Math.floor(time / 60)}:${String(time % 60).padStart(2,'0')}`;
}

export function bindMobileVideoBar(bar: HTMLElement, video: HTMLVideoElement, play: (restart: boolean)=>void, signal: AbortSignal): void {
  const toggle = bar.querySelector<HTMLButtonElement>('[data-video-toggle]')!;
  const seek = bar.querySelector<HTMLInputElement>('[data-video-seek]')!;
  const time = bar.querySelector<HTMLElement>('[data-video-time]')!;
  const sound = bar.querySelector<HTMLButtonElement>('[data-video-sound]')!;
  const playIcon = toggle.querySelector('[data-play-icon]')!;
  const pauseIcon = toggle.querySelector('[data-pause-icon]')!;
  let scrubbing = false;

  function sync() {
    const duration = Number.isFinite(video.duration) ? Math.max(0,video.duration) : 0;
    seek.disabled = duration === 0;
    seek.max = String(duration || 1);
    if (!scrubbing) seek.value = String(video.currentTime);
    const label = `${timestamp(seek.valueAsNumber)} / ${timestamp(duration)}`;
    const progress = duration ? 100 * seek.valueAsNumber / duration : 0;
    seek.style.setProperty('--wk-video-progress', `${progress}%`);
    seek.setAttribute('aria-valuetext',label);
    if (time.textContent !== label) time.textContent = label;
    const playing = !video.paused && !video.ended;
    toggle.setAttribute('aria-label',playing ? '暂停' : '播放');
    playIcon.toggleAttribute('hidden',playing);
    pauseIcon.toggleAttribute('hidden',!playing);
    const soundLabel = video.muted ? '开启声音' : '静音';
    if (sound.textContent !== soundLabel) sound.textContent = soundLabel;
  }
  toggle.addEventListener('click',()=>{
    if (video.paused || video.ended) play(video.ended);
    else video.pause();
  },{signal});
  sound.addEventListener('click',()=>{
    video.muted = !video.muted;
    if (!video.muted && video.paused && !video.played.length) play(false);
    sync();
  },{signal});
  seek.addEventListener('input',()=>{scrubbing=true;sync();},{signal});
  seek.addEventListener('change',()=>{
    scrubbing = false;
    if (!seek.disabled) video.currentTime = seek.valueAsNumber;
    sync();
  },{signal});
  seek.addEventListener('pointercancel',()=>{scrubbing=false;sync();},{signal});
  video.addEventListener('emptied',()=>{scrubbing=false;sync();},{signal});
  for (const event of ['play','pause','ended','durationchange','timeupdate','seeked','volumechange']) {
    video.addEventListener(event,sync,{signal});
  }
  sync();
}
