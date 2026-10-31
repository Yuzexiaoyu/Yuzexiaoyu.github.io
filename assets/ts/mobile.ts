/* Mobile UI owns page listeners; the audio element and its listeners live once per document. */
import { initMobileBackground } from './mobile-background';
import { createMobilePagination } from './mobile-reader';
const w = window as any;
const root = document.documentElement;
let pageController: AbortController | null = null;
let pageObserver: ResizeObserver | null = null;
let playerElement: HTMLElement | null = null;
let playerTimer = 0;

function isMobile(): boolean { return w.__isMobileUI?.() === true; }

function measureObstruction(): void {
  const visible = playerElement && getComputedStyle(playerElement).display !== 'none';
  const rect = visible ? playerElement!.getBoundingClientRect() : null;
  // Include the actual bottom inset (notch / home indicator), plus a small reading gap.
  const height = rect ? Math.ceil(Math.max(0, window.innerHeight - rect.top) + 8) : 0;
  const next = `${height}px`;
  if (root.style.getPropertyValue('--m-bottom-obstruction') !== next) root.style.setProperty('--m-bottom-obstruction', next);
}

function initPlayer(): boolean {
  const ap = w.aplayerInstance;
  if (!ap?.audio) return false;
  const player = document.querySelector('#aplayer .aplayer-body')?.parentElement as HTMLElement;
  if (!player) return false;
  playerElement = player;
  document.querySelectorAll('#aplayer').forEach(el => { if (el !== player) el.remove(); });
  if (player.querySelector('.m-player-bar')) { measureObstruction(); return true; }
  const bar = document.createElement('div');
  bar.className = 'm-player-bar';
  bar.innerHTML = '<span class="m-player-title"></span><button type="button" class="m-play" aria-label="播放音乐">播放</button><button type="button" class="m-expand" aria-expanded="false" aria-label="展开播放器">展开</button>';
  const tools = document.createElement('div');
  tools.className = 'm-player-tools'; tools.hidden = true;
  tools.innerHTML = '<div class="m-player-actions"><button type="button" class="m-prev">上一曲</button><button type="button" class="m-next">下一曲</button><button type="button" class="m-manage">管理音乐</button></div><label>进度 <input class="m-seek" type="range" min="0" max="1000" value="0" aria-label="音乐播放进度"></label><label>音量 <input class="m-volume" type="range" min="0" max="1" step="0.05" aria-label="音乐音量"></label><span class="m-audio-time"></span>';
  const error = document.createElement('div'); error.className = 'm-player-error'; error.setAttribute('role', 'status');
  player.prepend(bar, error, tools);
  const title = bar.querySelector('.m-player-title')!;
  const play = bar.querySelector<HTMLButtonElement>('.m-play')!;
  const expand = bar.querySelector<HTMLButtonElement>('.m-expand')!;
  const seek = tools.querySelector<HTMLInputElement>('.m-seek')!;
  const volume = tools.querySelector<HTMLInputElement>('.m-volume')!;
  const time = tools.querySelector('.m-audio-time')!;
  const fmt = (s: number) => `${Math.floor((s || 0)/60)}:${String(Math.floor((s || 0)%60)).padStart(2,'0')}`;
  function sync() {
    const audio = ap.list.audios[ap.list.index];
    title.textContent = audio?.name || '音乐'; title.setAttribute('title', title.textContent!);
    play.textContent = ap.audio.paused ? '播放' : '暂停';
    play.setAttribute('aria-label', ap.audio.paused ? '播放音乐' : '暂停音乐');
    seek.disabled = !Number.isFinite(ap.audio.duration) || ap.audio.duration <= 0;
    seek.value = seek.disabled ? '0' : String(ap.audio.currentTime / ap.audio.duration * 1000);
    volume.value = String(ap.audio.volume);
    time.textContent = `${fmt(ap.audio.currentTime)} / ${fmt(Number.isFinite(ap.audio.duration) ? ap.audio.duration : 0)}`;
  }
  play.addEventListener('click', () => {
    error.textContent = '';
    if (!ap.audio.paused) ap.pause();
    else {
      if (ap.audio.error) ap.audio.load();
      ap.audio.play().catch(() => { error.textContent = '播放未开始，请再次点击播放重试'; sync(); });
    }
    sync();
  });
  expand.addEventListener('click', () => {
    const open = !player.classList.contains('m-expanded');
    player.classList.toggle('m-expanded', open); tools.hidden = !open;
    expand.textContent = open ? '收起' : '展开'; expand.setAttribute('aria-expanded', String(open));
    measureObstruction();
  });
  tools.querySelector('.m-prev')!.addEventListener('click', () => { ap.skipBack(); sync(); });
  tools.querySelector('.m-next')!.addEventListener('click', () => { ap.skipForward(); sync(); });
  tools.querySelector('.m-manage')!.addEventListener('click', () => {
    if (w.__musicUploads) w.__musicUploads.openPanel(ap);
    else error.textContent = '音乐管理正在加载，请稍后重试';
  });
  seek.addEventListener('input', () => { if (!seek.disabled) ap.seek(Number(seek.value)/1000 * ap.audio.duration); });
  volume.addEventListener('input', () => ap.volume(Number(volume.value), false));
  ['play','pause','timeupdate','durationchange','loadedmetadata','volumechange','emptied'].forEach(name => ap.audio.addEventListener(name, sync));
  ap.audio.addEventListener('error', () => { error.textContent = '音频加载失败，点击播放可重试或选择其他曲目'; sync(); });
  window.addEventListener('music-uploads-changed', sync);
  new ResizeObserver(measureObstruction).observe(player);
  sync(); measureObstruction(); return true;
}

function destroyMobilePage(): void {
  pageController?.abort(); pageController = null;
  pageObserver?.disconnect(); pageObserver = null;
  clearInterval(playerTimer);
  const toc = document.getElementById('TableOfContents') as any;
  toc?.__tocAutoCollapseObserver?.disconnect();
  if (toc) delete toc.__tocAutoCollapseObserver;
  w.__destroyMobileReader?.();
  w.__destroyMobileMermaid?.();
  w.__musicUploads?.closePanel?.();
  w.__searchInstance?.destroy?.();
  document.querySelector<HTMLDetailsElement>('.m-navigation')?.removeAttribute('open');
  root.classList.remove('m-keyboard');
}

function initMobilePage(): void {
  if (!isMobile()) return;
  pageController?.abort(); pageObserver?.disconnect(); clearInterval(playerTimer);
  pageController = new AbortController();
  const signal = pageController.signal;
  const nav = document.querySelector<HTMLDetailsElement>('.m-navigation');
  if (nav) {
    const summary = nav.querySelector('summary')!;
    const close = () => { nav.open = false; summary.focus(); };
    nav.querySelector('.m-nav-close')?.addEventListener('click', close, {signal});
    nav.addEventListener('toggle', () => {
      summary.setAttribute('aria-expanded', String(nav.open));
      if (nav.open) nav.querySelector<HTMLButtonElement>('button')?.focus();
    }, {signal});
    document.addEventListener('click', e => {
      const target = e.target as HTMLElement;
      if (nav.open && (!nav.contains(target) || target === nav || target.closest('a'))) nav.open = false;
    }, {signal});
    document.addEventListener('keydown', e => {
      if (!nav.open) return;
      if (e.key === 'Escape') close();
      if (e.key === 'Tab') {
        const items = Array.from(nav.querySelectorAll<HTMLElement>('summary,button,a[href]'));
        const first = items[0], last = items[items.length-1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }, {signal});
  }
  const header = document.querySelector<HTMLElement>('.m-header');
  pageObserver = new ResizeObserver(() => {
    if (header) root.style.setProperty('--m-header-height', `${header.getBoundingClientRect().height}px`);
    measureObstruction();
  });
  if (header) pageObserver.observe(header);
  const toc = document.getElementById('TableOfContents');
  const widget = toc?.closest('.widget');
  if (widget && !widget.closest('.m-toc')) {
    const details = document.createElement('details'); details.className = 'm-toc';
    const summary = document.createElement('summary'); summary.textContent = '文章目录';
    widget.before(details); details.append(summary,widget);
  }
  toc?.addEventListener('click', e => {
    const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a) return;
    const target = document.getElementById(decodeURIComponent(a.hash.slice(1)));
    if (!target) return;
    e.preventDefault(); e.stopImmediatePropagation();
    toc.closest<HTMLDetailsElement>('.m-toc')!.open = false;
    history.replaceState(history.state, '', a.hash);
    requestAnimationFrame(() => target.scrollIntoView({block:'start',behavior:'smooth'}));
  }, {signal,capture:true});
  document.querySelectorAll<HTMLElement>('#local-pagination a').forEach(a => { a.tabIndex = 0; a.setAttribute('role','button'); });
  document.getElementById('local-pagination')?.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (e.target as HTMLElement).click(); }
  }, {signal});
  const keyboard = () => {
    const active = document.activeElement as HTMLElement;
    const editing = !!active?.matches('input:not([type="range"]),textarea,[contenteditable="true"]');
    root.classList.toggle('m-keyboard', editing && !!window.visualViewport && window.visualViewport.height < window.innerHeight * .8);
    measureObstruction();
  };
  window.visualViewport?.addEventListener('resize',keyboard,{signal});
  document.addEventListener('focusin',keyboard,{signal});
  document.addEventListener('focusout',keyboard,{signal});
  if (!initPlayer()) {
    let attempts = 0;
    playerTimer = window.setInterval(() => { if (initPlayer() || ++attempts >= 100) clearInterval(playerTimer); },100);
  }
  if (document.getElementById('novel-reader-root') && !document.getElementById('novel-reader-root')!.dataset.readerInit) w.__initNovelReader?.();
}

if (isMobile()) {
  w.__createMobilePagination = createMobilePagination;
  initMobileBackground();
  w.initMobilePage = initMobilePage; w.destroyMobilePage = destroyMobilePage;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',initMobilePage,{once:true});
  else initMobilePage();
  window.addEventListener('pageshow',e=>{ if(e.persisted) initMobilePage(); });
}
