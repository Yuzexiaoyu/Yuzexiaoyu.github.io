import {abortError, escapeHTML as e, firstVideoIndexForColor, workPriceAt, workPriceRange, workWeightAt, grams, money, replaceQuery, setStatus, CONTACT_QQ, Entry, Color, Settings} from './workshop-shared';
import {publicApi as api, preloadPublicCatalog} from './workshop-public';
import {initAdmin} from './print-admin';
import {initMobileGallerySwipe} from './mobile-workshop-gallery';
import {bindMobileVideoBar, mobileVideoBar} from './mobile-workshop-video';
import {bindGalleryPhotos} from './workshop-gallery-photos';
import {preloadCatalogEntries, takePreloadedVideo} from './workshop-preload';
import {bindTopicMusic, primeTopicMusic} from './workshop-topic-music';

const w = window as any;
let currentRoot: HTMLElement|null = null;
let controller: AbortController|null = null;
let cleanup: (()=>void)|null = null;
let viewerPromise: Promise<void>|null = null;
const DEFAULT_CAMERA_ORBIT = '30deg 75deg 150%';

function loadViewer(): Promise<void> {
  if(customElements.get('model-viewer')) return Promise.resolve();
  if(!viewerPromise) viewerPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.type = 'module'; script.src = '/lib/model-viewer/model-viewer-4.4.0.min.js';
    script.onload = () => {customElements.whenDefined('model-viewer').then(()=>resolve());};
    script.onerror = () => {script.remove(); viewerPromise = null; reject(new Error('3D 查看器加载失败，请重试'));};
    document.head.append(script);
  });
  return viewerPromise;
}

function empty(message: string, extra = '') {return `<div class="wk-empty"><span class="wk-empty-mark" aria-hidden="true">◇</span><h2>${e(message)}</h2>${extra}</div>`;}

function entryCard(entry: Entry, index: number, topic?: string): string {
  const configurable = entry.kind === 'work';
  const [price, high] = configurable ? workPriceRange(entry) : [entry.fixed_price, entry.fixed_price];
  const isRange = price !== high || (!entry.color_prices && entry.fixed_infill == null);
  const suffix = configurable ? (isRange ? '起' : '') : entry.weight_g ? `${e(entry.weight_g)} g` : '';
  const query = new URLSearchParams({id: entry.id!});
  if (topic) query.set('from', topic);
  const badge = entry.is_demo ? '演示内容' : topic ? (configurable ? '可选' : '现货') : '';
  const heading = topic ? 'h3' : 'h2';
  return `<a class="wk-card" data-workshop-item href="/prints/detail/?${e(query.toString())}" style="--card-index:${index}">
    <div class="wk-card-image"><img src="${e(entry.images[0]?.url)}" alt="${e(entry.name)}" loading="${index < 2 ? 'eager' : 'lazy'}" fetchpriority="${index === 0 ? 'high' : 'auto'}" decoding="async">${badge ? `<span class="wk-badge">${badge}</span>` : ''}</div>
    <div class="wk-card-info"><div><${heading}>${e(entry.name)}</${heading}></div><span class="wk-card-price">${money(price)}${suffix ? `<small>${suffix}</small>` : ''}</span></div>
  </a>`;
}

async function catalog(root: HTMLElement, signal: AbortSignal) {
  const grid = root.querySelector<HTMLElement>('[data-catalog-grid]')!;
  const topic = root.querySelector<HTMLTemplateElement>('[data-catalog-topic]')?.innerHTML ?? '';
  const contact = root.querySelector<HTMLElement>('[data-catalog-contact]');
  if (contact) {
    contact.querySelector('strong')!.textContent = `QQ ${CONTACT_QQ}`;
    contact.hidden = false;
  }
  primeTopicMusic(root, signal);
  let tab = new URLSearchParams(location.search).get('tab') === 'product' ? 'product' : 'work';
  try {
    const {entries} = await api<{entries: Entry[]}>('/api/catalog', signal);
    if(signal.aborted) return;
    let stopPreload: (()=>void)|undefined;
    const render = () => {
      stopPreload?.();
      const items = entries.filter(p=>p.kind === tab);
      root.querySelectorAll<HTMLElement>('[data-count]').forEach(n=>n.textContent = String(entries.filter(p=>p.kind === n.dataset.count).length).padStart(2,'0'));
      root.querySelectorAll<HTMLElement>('[data-catalog-tab]').forEach(n=>{const active = n.dataset.catalogTab === tab; n.classList.toggle('is-active',active); n.setAttribute('aria-selected',String(active));});
      root.querySelectorAll<HTMLElement>('[data-wk-tab]').forEach(n=>n.classList.toggle('is-active',n.dataset.wkTab === tab));
      const cards = items.map((entry, index) => entryCard(entry, index)).join('');
      grid.innerHTML = (cards + (tab==='work' ? topic : '')) || empty('新的创作，正在路上','<p>首批内容整理中，稍后再来看看。</p>');
      w.WorkshopIntro?.refresh?.(root);
      stopPreload = preloadCatalogEntries(root, items, signal);
    };
    root.querySelectorAll<HTMLButtonElement>('[data-catalog-tab]').forEach(button=>button.addEventListener('click',()=>{tab=button.dataset.catalogTab!;const params=new URLSearchParams(location.search);params.set('tab',tab);replaceQuery(params);render();},{signal}));
    render();
  } catch(error) {
    if(signal.aborted || abortError(error)) return;
    grid.innerHTML = (tab==='work' ? topic : '') + empty('工坊暂时没有打开',`<p>${e((error as Error).message)}</p><a class="wk-button wk-secondary" href="${e(location.href)}" data-no-swup>重新连接</a>`);
    w.WorkshopIntro?.refresh?.(root);
  }
}

function playTopicWallpaper(root: HTMLElement, signal: AbortSignal, startMusic?: () => void) {
  const video = root.querySelector<HTMLVideoElement>('[data-topic-video]');
  const sources = root.querySelector<HTMLTemplateElement>('[data-topic-video-sources]');
  if (!video || !sources) {
    startMusic?.();
    return;
  }
  const poster = root.querySelector<HTMLImageElement>('[data-topic-poster]');
  const desktopPoster = poster?.src;
  const portraitPoster = root.querySelector<HTMLTemplateElement>('[data-topic-portrait-poster]')
    ?.content.querySelector('img')?.getAttribute('src');
  const variants = Array.from(sources.content.querySelectorAll('source'));
  const portraitView = matchMedia(variants.find(source => source.media)?.media ?? '(max-aspect-ratio: 4/5)');
  let activePortrait: boolean | undefined;
  const updatePoster = () => {
    if (poster && desktopPoster) poster.src = (activePortrait && portraitPoster) || desktopPoster;
  };
  const showPoster = () => {
    video.classList.remove('is-playing');
    if (poster) {
      updatePoster();
      poster.hidden = false;
    }
    startMusic?.();
  };
  const start = () => {
    video.muted = true;
    void video.play().catch((error: DOMException) => {
      if (signal.aborted || error.name === 'AbortError') return;
      showPoster();
      if (error.name === 'NotAllowedError') {
        root.addEventListener('click', start, {once: true, signal});
      }
    });
  };
  const update = () => {
    const portrait = document.documentElement.dataset.ui === 'mobile' && portraitView.matches;
    if (activePortrait !== portrait) {
      activePortrait = portrait;
      if (poster && !poster.hidden) updatePoster();
      video.classList.remove('is-playing');
      const candidates = variants.filter(source => Boolean(source.media) === portrait);
      video.replaceChildren(...candidates.map(source => source.cloneNode(true)));
      video.load();
    }
    start();
  };
  video.addEventListener('playing', () => {
    video.classList.add('is-playing');
    root.removeEventListener('click', start);
    startMusic?.();
  }, {signal});
  video.addEventListener('error', event => {
    if (event.target === video || event.target === video.lastElementChild) showPoster();
  }, {capture: true, signal});
  portraitView.addEventListener('change', update, {signal});
  signal.addEventListener('abort', () => {
    video.replaceChildren();
    video.load();
  }, {once: true});
  update();
}

async function topic(root: HTMLElement, signal: AbortSignal) {
  playTopicWallpaper(root, signal, bindTopicMusic(root, signal));
  const grid = root.querySelector<HTMLElement>('[data-topic-grid]');
  if (!grid) return;
  const topicId = root.dataset.topic;
  try {
    const {entries} = await api<{entries: Entry[]}>('/api/catalog', signal);
    if (signal.aborted) return;
    const items = entries.filter(entry => topicId && entry.topic === topicId && entry.status === 'published');
    grid.innerHTML = items.length
      ? items.map((entry, index) => entryCard(entry, index, topicId)).join('')
      : '<p class="wk-topic-status">暂无上架物品</p>';
    preloadCatalogEntries(root, items, signal);
  } catch (error) {
    if (!signal.aborted && !abortError(error)) grid.innerHTML = '<p class="wk-topic-status">相关物品暂未加载，请刷新重试。</p>';
  }
}

async function detail(root: HTMLElement, signal: AbortSignal) {
  const container = root.querySelector<HTMLElement>('[data-detail-content]')!;
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if(!id){container.innerHTML=empty('先挑一个喜欢的形状','<a class="wk-button wk-primary" href="/prints/">浏览工坊</a>');return;}
  try {
    let entry = await api<Entry>(`/api/entry/${encodeURIComponent(id)}`,signal);
    if(signal.aborted)return;
    const configurable=entry.kind==='work';
    const stockLink=root.querySelector<HTMLAnchorElement>('[data-stock-link]');
    if(configurable&&stockLink) {
      void api<{entries: Entry[]}>('/api/catalog',signal).then(({entries})=>{
        if(signal.aborted) return;
        const matches=entries.filter(item=>item.kind==='product'&&item.status==='published'&&item.name===entry.name&&item.id);
        if(matches.length!==1) return;
        stockLink.href=`/prints/detail/?id=${encodeURIComponent(matches[0].id!)}`;
        stockLink.hidden=false;
      }).catch(()=>{});
    }
    const mobile=document.documentElement.dataset.ui==='mobile';
    const description=mobile
      ? entry.description.split(/\r\n?|\n/).filter(line=>line.trim()).map(e).join('<br>')
      : e(entry.description).replace(/\n/g,'<br>');
    const videos=entry.videos||[];
    const photos=entry.images;
    const previews=configurable?entry.color_previews:undefined;
    document.title=`${entry.name} · 雨泽小鱼的工坊`;
    root.querySelector<HTMLElement>('[data-detail-breadcrumb]')!.textContent=`${configurable?'可选':'现货'} / ${entry.name}`;
    const back = root.querySelector<HTMLAnchorElement>('[data-detail-back]')!;
    if (entry.topic && params.get('from') === entry.topic) {
      back.href = `/prints/${encodeURIComponent(entry.topic)}/`;
      back.textContent = '← 返回专题';
    } else back.href = `/prints/?tab=${entry.kind}`;
    root.querySelectorAll<HTMLElement>('[data-wk-tab]').forEach(n=>n.classList.toggle('is-active',n.dataset.wkTab===entry.kind));
    let color: Color|undefined=entry.colors.find(c=>c.id===params.get('color'))||entry.colors[0];
    const activePreview=()=>color?previews?.[color.id]:undefined;
    const initialPreview=activePreview();
    const initialVideoIndex=firstVideoIndexForColor(entry,color?.id);
    const initialVideo=videos[initialVideoIndex];
    const preloadedVideo=takePreloadedVideo(initialVideo?.url);
    const cover=initialPreview?photos.find(image=>initialPreview.image_ids.includes(image.id)):photos[0];
    const fixedInfill=configurable?entry.fixed_infill:null;
    let infill = fixedInfill??Number(params.get('infill')||15);
    if(!Number.isInteger(infill)||infill<15||infill>100)infill=15;
    container.innerHTML=`<div class="wk-detail-grid"><div class="wk-gallery">
      <div class="wk-stage">
        ${videos.length?`<video class="wk-stage-video" data-stage-video ${!preloadedVideo&&initialVideo?.url?`src="${e(initialVideo.url)}"`:''} ${cover?.url?`poster="${e(cover.url)}"`:''} ${mobile?'disablepictureinpicture disableremoteplayback':'controls'} ${initialVideo?'autoplay':'hidden'} playsinline preload="auto"></video>`:''}
        ${mobile&&videos.length?'<div class="wk-video-replay" data-video-replay-layer hidden><button type="button" data-video-replay aria-label="重新播放视频"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5 19 12 9 19Z" fill="currentColor"/></svg></button></div>':''}
        <img class="wk-stage-image" data-stage-image ${cover?.url?`src="${e(cover.url)}"`:''} alt="${e(entry.name)}" ${videos.length||!cover?'hidden':''}>
        <span class="wk-photo-status" data-photo-status role="status" hidden></span>
        ${previews?'<p class="wk-color-placeholder" data-color-placeholder role="status" hidden></p>':''}
        ${entry.model?`<model-viewer data-viewer alt="${e(entry.name)}的三维预览" camera-controls touch-action="pan-y" zoom-sensitivity="0.1" camera-orbit="${DEFAULT_CAMERA_ORBIT}" max-camera-orbit="auto auto 400%" environment-image="neutral" shadow-intensity="0.7" exposure="1" interaction-prompt="none" loading="eager" reveal="auto" hidden></model-viewer><div class="wk-viewer-loading" data-viewer-loading hidden><span></span>正在打开 3D 预览</div><div class="wk-viewer-failed" data-viewer-failed hidden><p>3D 预览暂未加载，仍可浏览图片。</p><button type="button" class="wk-button wk-secondary" data-retry-viewer>重试 3D</button></div>`:''}
        ${mobile&&videos.length?mobileVideoBar:''}
      </div>
      <div class="wk-gallery-tools">
        <div class="wk-view-switch" role="group" aria-label="媒体选择">
          ${videos.map((a,i)=>`<button type="button" data-view="video" data-media-index="${i}">▷ 视频${videos.length>1?i+1:''}</button>`).join('')}
          ${photos.map((a,i)=>`<button type="button" data-view="photo" data-media-index="${i}">▧ 图片${photos.length>1?i+1:''}</button>`).join('')}
          ${entry.model?'<button type="button" data-view="model">◇ 3D 预览</button>':''}
        </div>
        ${entry.model?'<button type="button" class="wk-text-link" data-reset-view hidden>↺ 重置视角</button>':''}
      </div>
    </div><aside class="wk-config">
      <h1>${e(entry.name)}</h1>
      <p class="wk-description">${description}</p>
      ${configurable?`
        <div class="wk-config-section">
          <div class="wk-label-row"><h2>选择颜色</h2><span data-color-name>${e(color?.name)}</span></div>
          <div class="wk-swatches" role="group" aria-label="可选颜色">${entry.colors.map(c=>{
            const accent=previews?.[c.id]?.accent;
            const swatch=accent?`linear-gradient(135deg,${c.hex} 50%,${accent} 50%)`:c.hex;
            return `<button type="button" class="wk-swatch" data-color-id="${e(c.id)}" style="--swatch:${e(swatch)}" aria-label="${e(c.name)}${c.material?` · ${e(c.material)}`:''}" title="${e(c.name)}${c.material?` · ${e(c.material)}`:''}" aria-pressed="${c.id===color?.id}"><span></span></button>`;
          }).join('')}</div>
          <div class="wk-material"><span>材质</span><span data-material>${e(color?.material||'—')}</span></div>
        </div>
        <div class="wk-config-section${fixedInfill==null?'':' wk-config-section--fixed-infill'}">
          <div class="wk-label-row"><h2>${fixedInfill==null?'填充比例':'固定填充比例'}</h2><output class="wk-infill-value" data-infill-value>${infill}%</output></div>
          ${fixedInfill==null?`<input class="wk-range" type="range" min="15" max="100" step="1" value="${infill}" data-infill-range aria-label="调整填充比例">`:''}
        </div>
        <div class="wk-price-box"><div><span>当前报价</span><strong data-price></strong></div><span class="wk-unit">重量 <span data-weight>—</span></span></div>
      `:`
        <p class="wk-stock-facts" aria-label="售价、重量与材质"><span data-price>${money(entry.fixed_price)}</span><span aria-hidden="true">·</span><span data-weight>${e(entry.weight_g)} g</span><span aria-hidden="true">·</span><span>材质 <span data-material>${e(entry.material||'—')}</span></span></p>
      `}
      <button type="button" class="wk-button wk-primary wk-contact-button" data-contact><strong class="wk-mobile-price" data-mobile-price></strong><span>${configurable?'生成清单 · QQ 联系':'联系购买 · QQ'}</span><span>↗</span></button>
      <p class="wk-feedback" data-contact-error role="status"></p>
    </aside></div>`;
    if(preloadedVideo){
      const placeholder=container.querySelector<HTMLVideoElement>('[data-stage-video]')!;
      for(const attribute of Array.from(placeholder.attributes))preloadedVideo.setAttribute(attribute.name,attribute.value);
      placeholder.replaceWith(preloadedVideo);
    }
    w.WorkshopIntro?.refresh?.(root);
    const viewer=container.querySelector<any>('[data-viewer]');
    const stageImage=container.querySelector<HTMLImageElement>('[data-stage-image]')!;
    const stageVideo=container.querySelector<HTMLVideoElement>('[data-stage-video]');
    const videoBar=container.querySelector<HTMLElement>('[data-video-bar]');
    const colorPlaceholder=container.querySelector<HTMLElement>('[data-color-placeholder]');
    const galleryTools=container.querySelector<HTMLElement>('.wk-gallery-tools')!;
    const mediaButtons=Array.from(container.querySelectorAll<HTMLButtonElement>('[data-view]'));
    const photoButtons=mediaButtons.filter(button=>button.dataset.view==='photo');
    const videoButtons=mediaButtons.filter(button=>button.dataset.view==='video');
    const galleryPhotos=bindGalleryPhotos(stageImage,container.querySelector('[data-photo-status]')!,photos,signal);
    const replayLayer=container.querySelector<HTMLElement>('[data-video-replay-layer]');
    const replayButton=container.querySelector<HTMLButtonElement>('[data-video-replay]');
    const loading=container.querySelector<HTMLElement>('[data-viewer-loading]');
    const failed=container.querySelector<HTMLElement>('[data-viewer-failed]');
    let viewerReady=false;let viewerFailed=false;
    let imageIndex=0;let videoIndex=Math.max(0,initialVideoIndex);
    let videoNeedsPlay=false,videoPlayAttempt=0;
    let soundWasBlocked=false;
    let revealMediaButton: (()=>void)|undefined;
    const syncVideoReplay=()=>{
      if(!stageVideo||!replayLayer)return;
      replayLayer.hidden=stageVideo.hidden||(!stageVideo.ended&&!videoNeedsPlay);
      replayButton!.setAttribute('aria-label',stageVideo.ended?'重新播放视频':'播放视频');
    };
    const playVideo=(restart=true, fromUser=false)=>{
      if(!stageVideo)return;
      const attempt=++videoPlayAttempt;videoNeedsPlay=false;
      if(fromUser&&soundWasBlocked){
        soundWasBlocked=false;
        stageVideo.muted=false;
      }
      if(restart)stageVideo.currentTime=0;
      syncVideoReplay();
      const stillActive=()=>!signal.aborted&&attempt===videoPlayAttempt&&!stageVideo.hidden;
      void stageVideo.play().catch(async(error: DOMException)=>{
        if(!stillActive())return;
        if(error.name==='NotAllowedError'&&!stageVideo.muted){
          soundWasBlocked=true;
          stageVideo.muted=true;
          const started=await stageVideo.play().then(()=>true,()=>false);
          if(started||!stillActive())return;
        }
        videoNeedsPlay=true;syncVideoReplay();
      });
    };
    if(stageVideo)stageVideo.addEventListener('volumechange',()=>{if(!stageVideo.muted)soundWasBlocked=false;},{signal});
    if(stageVideo&&replayLayer){
      stageVideo.addEventListener('ended',syncVideoReplay,{signal});
      stageVideo.addEventListener('playing',()=>{videoNeedsPlay=false;syncVideoReplay();},{signal});
      stageVideo.addEventListener('pause',()=>{
        videoNeedsPlay=stageVideo.paused&&!stageVideo.hidden&&stageVideo.readyState>=2;
        syncVideoReplay();
      },{signal});
      replayButton!.addEventListener('click',()=>playVideo(stageVideo.ended,true),{signal});
    }
    if(stageVideo&&videoBar)bindMobileVideoBar(videoBar,stageVideo,restart=>playVideo(restart,true),signal);
    const paint=()=>{if(configurable&&viewer?.model&&color) for(const material of viewer.model.materials){const pbr=material.pbrMetallicRoughness;pbr.baseColorTexture?.setTexture(null);pbr.setBaseColorFactor(color.hex);}};
    const viewerError=()=>{
      if(signal.aborted)return;
      viewerFailed=true;
      if(loading)loading.hidden=true;
      if(failed)failed.hidden=viewer.hidden;
    };
    const openModel=(retry=false)=>{
      loadViewer().then(()=>{
        if(!signal.aborted)viewer.src=entry.model!.url+(retry?'?retry='+Date.now():'');
      }).catch(viewerError);
    };
    const selectView=(view:'model'|'photo'|'video'|'empty')=>{
      const model=view==='model'&&!!viewer;
      if(viewer)viewer.hidden=!model;
      stageImage.hidden=view!=='photo';
      if(colorPlaceholder)colorPlaceholder.hidden=view!=='empty';
      galleryPhotos.updateStatus();
      if(stageVideo){stageVideo.hidden=view!=='video';if(view!=='video'){videoPlayAttempt++;stageVideo.pause();}}
      if(videoBar)videoBar.hidden=view!=='video';
      syncVideoReplay();
      mediaButtons.forEach(n=>{
        const active=n.dataset.view===view&&(view==='model'||Number(n.dataset.mediaIndex)===(view==='photo'?imageIndex:videoIndex));
        n.classList.toggle('is-active',active);
        n.setAttribute('aria-pressed',String(active));
      });
      revealMediaButton?.();
      if(loading)loading.hidden=!model||viewerReady||viewerFailed;
      if(failed)failed.hidden=!model||!viewerFailed;
      const reset=container.querySelector<HTMLElement>('[data-reset-view]');
      if(reset)reset.hidden=!model;
      // Images and videos stay immediately usable; load 3D only on request.
      if(model&&!viewer.hasAttribute('src')&&!viewerFailed)openModel();
    };
    mediaButtons.forEach(n=>n.addEventListener('click',event=>{
      if(n.hidden)return;
      const view=n.dataset.view as 'model'|'photo'|'video';
      const index=Number(n.dataset.mediaIndex);
      if(view==='photo'){imageIndex=index;galleryPhotos.select(index);}
      if(view==='video'&&stageVideo&&(videoIndex!==index||!stageVideo.getAttribute('src'))){videoIndex=index;stageVideo.src=videos[index].url!;}
      selectView(view);
      if(view==='video')playVideo(true,event.isTrusted);
    },{signal}));
    function showColorMedia(preferVideo=false) {
      const preview=activePreview();
      const filter=(buttons: HTMLButtonElement[], ids: string[]|undefined, assets: Entry['images'], label: string) => {
        buttons.forEach((button,index)=>{button.hidden=!!ids&&!ids.includes(assets[index].id);});
        const available=buttons.filter(button=>!button.hidden);
        available.forEach((button,index)=>{button.textContent=label+(available.length>1?String(index+1):'');});
        return available[0];
      };
      const firstPhoto=filter(photoButtons,preview?.image_ids,photos,'▧ 图片');
      const firstVideo=filter(videoButtons,preview?.video_ids,videos,'▷ 视频');
      const firstMedia=preferVideo?(firstVideo||firstPhoto):(firstPhoto||firstVideo);
      const defaultButton=firstMedia||mediaButtons.find(button=>button.dataset.view==='model');
      const posterIndex=firstPhoto?Number(firstPhoto.dataset.mediaIndex):null;
      const poster=posterIndex==null?null:photos[posterIndex].url;
      if(stageVideo&&poster)stageVideo.poster=poster;
      if(stageVideo&&!poster)stageVideo.removeAttribute('poster');
      galleryTools.hidden=!defaultButton;
      if(defaultButton) defaultButton.click();
      else {
        colorPlaceholder!.textContent=`${color?.name||'该配色'}实拍待补`;
        selectView('empty');
      }
      if(firstMedia && firstMedia===firstVideo && posterIndex!=null)galleryPhotos.warm(posterIndex);
    }
    if(mobile){
      const posters=mediaButtons.map(button=>button.dataset.view==='photo'?photos[Number(button.dataset.mediaIndex)]?.url:null);
      revealMediaButton=initMobileGallerySwipe(container.querySelector<HTMLElement>('.wk-stage')!,mediaButtons,posters,signal);
    }
    if(viewer){
      viewer.addEventListener('load',()=>{if(signal.aborted)return;viewerReady=true;viewerFailed=false;loading!.hidden=true;failed!.hidden=true;paint();},{signal});
      viewer.addEventListener('error',viewerError,{signal});
      container.querySelector('[data-reset-view]')!.addEventListener('click',()=>{selectView('model');viewer.cameraOrbit=DEFAULT_CAMERA_ORBIT;viewer.cameraTarget='auto auto auto';viewer.fieldOfView='auto';viewer.jumpCameraToGoal?.();},{signal});
      container.querySelector('[data-retry-viewer]')!.addEventListener('click',()=>{viewerFailed=false;failed!.hidden=true;loading!.hidden=false;openModel(true);},{signal});
    }
    if(stageVideo)stageVideo.muted=false;
    if(previews) showColorMedia(true);
    else {
      selectView(videos.length?'video':'photo');
      galleryPhotos.warm(0);
      if(stageVideo)playVideo(false);
    }
    const range=container.querySelector<HTMLInputElement>('[data-infill-range]');
    const contact=container.querySelector<HTMLButtonElement>('[data-contact]')!;
    const update=()=>{
      let displayPrice:string;
      if(configurable){
        const value=range?.valueAsNumber??infill;
        const valid=Number.isInteger(value)&&value>=15&&value<=100&&!!color;
        contact.disabled=!valid;
        range?.setAttribute('aria-invalid',String(!valid));
        setStatus(container.querySelector('[data-contact-error]'),valid?'':'请选择颜色与填充比例',!valid);
        displayPrice=valid?money(workPriceAt(entry,color!.id,value)):'—';
        const approximate=fixedInfill!=null&&entry.weight_g!=null;
        container.querySelector<HTMLElement>('[data-weight]')!.textContent=valid?`${approximate?'约 ':''}${grams(workWeightAt(entry,value))}`:'—';
        if(valid){
          infill=value;range?.style.setProperty('--fill',`${(infill-15)/85*100}%`);
          range?.setAttribute('aria-valuetext',`${infill}%`);
          container.querySelector<HTMLOutputElement>('[data-infill-value]')!.value=`${infill}%`;
          container.querySelector<HTMLElement>('[data-color-name]')!.textContent=color!.name;
          container.querySelectorAll<HTMLElement>('[data-color-id]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.colorId===color!.id)));
          const current=new URLSearchParams(location.search);current.set('color',color!.id);current.set('infill',String(infill));replaceQuery(current);paint();
        }
      }else{
        displayPrice=money(entry.fixed_price);
        contact.disabled=entry.fixed_price==null;
        contact.hidden=contact.disabled;
        container.querySelector<HTMLElement>('[data-weight]')!.textContent=`${entry.weight_g} g`;
        const current=new URLSearchParams(location.search);current.delete('color');current.delete('infill');replaceQuery(current);
      }
      container.querySelector<HTMLElement>('[data-price]')!.textContent=displayPrice;
      container.querySelector<HTMLElement>('[data-material]')!.textContent=(configurable?color?.material:entry.material)||'—';
      container.querySelector<HTMLElement>('[data-mobile-price]')!.textContent=displayPrice;
    };
    range?.addEventListener('input',update,{signal});
    container.querySelectorAll<HTMLElement>('[data-color-id]').forEach(n=>n.addEventListener('click',()=>{
      color=entry.colors.find(c=>c.id===n.dataset.colorId);
      update();
      if(previews)showColorMedia();
      else if(viewer)selectView('model');
    },{signal}));
    update();
    const dialog=root.querySelector<HTMLDialogElement>('[data-contact-dialog]')!;
    const dialogBody=dialog.querySelector<HTMLElement>('.wk-contact-body')!;
    const text=root.querySelector<HTMLTextAreaElement>('[data-contact-text]')!;
    const number=root.querySelector<HTMLElement>('[data-contact-number]')!;
    const feedback=root.querySelector<HTMLElement>('[data-copy-feedback]')!;
    number.textContent=CONTACT_QQ;
    root.querySelector('[data-close-dialog]')!.addEventListener('click',()=>dialog.close(),{signal});
    dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}},{signal});
    let copyAttempt=0;
    dialog.addEventListener('close',()=>{copyAttempt++;},{signal});
    async function copy(value:string, message:string, fallback:()=>string) {
      const attempt=++copyAttempt;
      const active=()=>!signal.aborted&&dialog.open&&attempt===copyAttempt;
      try {
        await navigator.clipboard.writeText(value);
      } catch {
        if(active())setStatus(feedback,fallback(),true);
        return;
      }
      if(active())setStatus(feedback,message);
    }
    root.querySelector('[data-copy-again]')!.addEventListener('click',()=>{
      void copy(text.value,'清单已复制，可以粘贴到 QQ。',()=>{
        text.focus();
        text.select();
        return '已选中清单，请手动复制。';
      });
    },{signal});
    root.querySelector('[data-copy-qq]')!.addEventListener('click',()=>{
      void copy(CONTACT_QQ,'QQ 号已复制。',()=>{
        number.scrollIntoView({block:'nearest'});
        const selection=window.getSelection();
        const selectionRange=document.createRange();
        selectionRange.selectNodeContents(number);
        selection?.removeAllRanges();
        selection?.addRange(selectionRange);
        return '请长按或选中上方 QQ 号手动复制。';
      });
    },{signal});
    contact.addEventListener('click',async()=>{
      contact.disabled=true;
      const controls=[range,...Array.from(container.querySelectorAll<HTMLButtonElement>('[data-color-id]'))].filter((control):control is HTMLInputElement|HTMLButtonElement=>!!control);
      controls.forEach(control=>control.disabled=true);
      try{
        const query=new URLSearchParams({id});
        if(configurable){query.set('color',color!.id);query.set('infill',String(infill));}
        const [q,settings]=await Promise.all([api<{entry:Entry;color?:Color;infill?:number;price:number|null;weight_g:number|null;material:string}>(`/api/quote?${query}`,signal),api<Settings>('/api/settings',signal)]);
        if(signal.aborted)return;
        if(q.entry.kind!==entry.kind)throw new Error('内容栏目已更新，请刷新页面后重新选择。');
        if((q.entry.fixed_infill??null)!==(entry.fixed_infill??null))throw new Error('填充比例已更新，请刷新详情后重新生成清单。');
        const changed=entry.revision!==q.entry.revision;entry=q.entry;color=q.color;update();
        if(q.price==null)return;
        text.value=[`商品：${entry.name}`,`材质：${q.material||'—'}`,
          ...(configurable?[`颜色：${color!.name}`,`填充比例：${q.infill??infill}%`]:[]),
          `报价：${money(q.price)}`].join('\n');
        root.querySelector<HTMLElement>('[data-contact-qr]')!.innerHTML=settings.qq_image?`<img class="wk-contact-qr" src="${e(settings.qq_image.url)}" alt="店主 QQ 联系二维码">`:'';
        setStatus(feedback,changed?'商品信息已更新，清单已使用最新报价。':'');
        dialog.showModal();
        dialogBody.scrollTop=0;
        text.setSelectionRange(0,0);
        text.scrollTop=0;
      }catch(error){if(!abortError(error))setStatus(container.querySelector('[data-contact-error]'),(error as Error).message,true);}
      finally{if(!signal.aborted){controls.forEach(control=>control.disabled=false);contact.disabled=configurable?(range?.getAttribute('aria-invalid')==='true'||!color):entry.fixed_price==null;}}
    },{signal});
  }catch(error){if(!abortError(error))container.innerHTML=empty('暂时找不到这件作品',`<p>${e((error as Error).message)}</p><a class="wk-button wk-secondary" href="/prints/">返回工坊</a>`);}
}

function destroy(){controller?.abort();cleanup?.();cleanup=null;currentRoot?.querySelectorAll<HTMLVideoElement>('video').forEach(v=>{v.pause();v.removeAttribute('src');});currentRoot?.querySelectorAll<any>('model-viewer').forEach(v=>{v.pause?.();v.removeAttribute('src');v.remove();});currentRoot?.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(d=>d.close());controller=null;currentRoot=null;}
function init() {
  const root = document.querySelector<HTMLElement>('[data-workshop]');
  if (root === currentRoot) return;
  destroy();
  if (!root) return;
  currentRoot = root;
  controller = new AbortController();
  const signal = controller.signal;
  if (root.dataset.workshop === 'catalog') void catalog(root, signal);
  else if (root.dataset.workshop === 'detail') void detail(root, signal);
  else if (root.dataset.workshop === 'topic') void topic(root, signal);
  else if (root.dataset.workshop === 'admin') cleanup = initAdmin(root, signal);
}
w.WorkshopApp={init,destroy,preload:preloadPublicCatalog};
