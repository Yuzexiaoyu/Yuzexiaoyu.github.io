import {canPreload} from './preload-policy';
import type {Asset} from './workshop-shared';

const MAX_PRELOAD_PHOTO_BYTES = 1024 * 1024;

export function bindGalleryPhotos(stage: HTMLImageElement, status: HTMLElement, photos: Asset[], signal: AbortSignal) {
  const loaded = new Map<string,HTMLImageElement>();
  const loading = new Map<string,{photo: HTMLImageElement; ready: Promise<void>}>();
  let queue: string[] = [];
  let timer: number | undefined;
  let selected = stage.getAttribute('src');
  let pending = false;
  let failed = false;

  function request(url: string, priority: 'high'|'low') {
    const active = loading.get(url);
    if (active) {
      if (priority === 'high') active.photo.fetchPriority = priority;
      return active.ready;
    }
    const photo = new Image();
    photo.fetchPriority = priority;
    photo.decoding = 'async';
    photo.src = url;
    const ready = photo.decode().then(()=>{
      if (signal.aborted) return;
      loaded.set(url,photo);
      if (loaded.size > 6) loaded.delete(loaded.keys().next().value!);
    }).finally(()=>{
      loading.delete(url);
      pump();
    });
    loading.set(url,{photo,ready});
    return ready;
  }

  function pump() {
    while (!signal.aborted && canPreload() && loading.size < 2 && queue.length) {
      const url = queue.shift()!;
      if (loaded.has(url) || loading.has(url) || stage.getAttribute('src') === url) continue;
      void request(url,'low').catch(()=>{});
    }
  }

  function warm(index: number) {
    queue = [];
    for (const offset of [1,-1,2,-2,3,-3,4,-4]) {
      const photo = photos[index+offset];
      const url = photo && photo.size<=MAX_PRELOAD_PHOTO_BYTES ? photo.url : null;
      if (url && !loaded.has(url) && !loading.has(url) && !queue.includes(url)) queue.push(url);
      if (queue.length >= 4) break;
    }
    pump();
  }

  function updateStatus() {
    window.clearTimeout(timer);
    status.hidden = true;
    if (stage.hidden) return;
    if (failed || (!pending && stage.complete && !stage.naturalWidth)) {
      status.textContent = '图片加载失败，点图片按钮重试';
      status.hidden = false;
    } else if (pending || !stage.complete) {
      timer = window.setTimeout(()=>{
        status.textContent = '正在加载图片…';
        status.hidden = false;
      },150);
    }
  }
  stage.addEventListener('load',updateStatus,{signal});
  stage.addEventListener('error',updateStatus,{signal});
  signal.addEventListener('abort',()=>{
    window.clearTimeout(timer);
    queue = [];
    loading.forEach(({photo})=>photo.removeAttribute('src'));
    loading.clear();
    loaded.clear();
  },{once:true});

  return {
    updateStatus,
    select(index: number) {
      const url = photos[index]?.url;
      if (!url || (url === selected && pending)) return;
      selected = url;
      pending = false;
      failed = false;
      if (stage.getAttribute('src') === url && stage.complete && !stage.naturalWidth) {
        stage.removeAttribute('src');
        stage.src = url;
      } else if (loaded.has(url)) {
        stage.src = url;
      } else if (stage.getAttribute('src') !== url) {
        pending = true;
        void request(url,'high').then(()=>{
          if (signal.aborted || selected !== url) return;
          pending = false;
          stage.src = url;
          updateStatus();
        },()=>{
          if (signal.aborted || selected !== url) return;
          pending = false;
          failed = true;
          updateStatus();
        });
      }
      warm(index);
    },
    warm
  };
}
