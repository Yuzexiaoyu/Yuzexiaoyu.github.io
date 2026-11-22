export const mobileVideoBar = `
  <div class="wk-video-bar" data-video-bar role="group" aria-label="视频播放控制" hidden>
    <div class="wk-video-actions">
      <button type="button" data-video-toggle aria-label="播放">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path data-play-icon d="M8 5v14l11-7z"/><path data-pause-icon d="M6 5h4v14H6zm8 0h4v14h-4z" hidden/></svg>
      </button>
      <span class="wk-video-time" data-video-time aria-hidden="true">0:00 / 0:00</span>
      <button type="button" data-video-sound aria-label="静音">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 9h4l5-4v14l-5-4H3z"/>
          <g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
            <path data-sound-on d="M15 9a4.2 4.2 0 0 1 0 6m2.5-8.5a7.8 7.8 0 0 1 0 11"/>
            <path data-sound-off d="m15.5 9.5 5 5m0-5-5 5" hidden/>
          </g>
        </svg>
      </button>
    </div>
    <input type="range" data-video-seek aria-label="播放进度" min="0" max="1" step="0.1" value="0" disabled>
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
  const soundOnIcon = sound.querySelector('[data-sound-on]')!;
  const soundOffIcon = sound.querySelector('[data-sound-off]')!;
  let scrubbing = false;

  const syncFrame = () => {
    if (video.videoWidth && video.videoHeight) {
      bar.style.setProperty('--wk-video-aspect',String(video.videoWidth / video.videoHeight));
    }
  };

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
    sound.setAttribute('aria-label',video.muted ? '开启声音' : '静音');
    soundOnIcon.toggleAttribute('hidden',video.muted);
    soundOffIcon.toggleAttribute('hidden',!video.muted);
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
  video.addEventListener('resize',syncFrame,{signal});
  syncFrame();
  sync();
}
