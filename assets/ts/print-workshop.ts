import {abortError, escapeHTML as e, quote, weightAt, grams, money, replaceQuery, setStatus, CONTACT_QQ, Entry, Color, Settings} from './workshop-shared';
import {publicApi as api, preloadPublicCatalog} from './workshop-public';
import {initAdmin} from './print-admin';
import {initMobileGallerySwipe} from './mobile-workshop-gallery';
import {preloadCatalogEntries, takePreloadedVideo} from './workshop-preload';

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

async function catalog(root: HTMLElement, signal: AbortSignal) {
  const grid = root.querySelector<HTMLElement>('[data-catalog-grid]')!;
  try {
    const {entries} = await api<{entries: Entry[]}>('/api/catalog', signal);
    if(signal.aborted) return;
    let tab = new URLSearchParams(location.search).get('tab') === 'product' ? 'product' : 'work';
    let stopPreload: (()=>void)|undefined;
    const render = () => {
      stopPreload?.();
      const items = entries.filter(p=>p.kind === tab);
      root.querySelectorAll<HTMLElement>('[data-count]').forEach(n=>n.textContent = String(entries.filter(p=>p.kind === n.dataset.count).length).padStart(2,'0'));
      root.querySelectorAll<HTMLElement>('[data-catalog-tab]').forEach(n=>{const active = n.dataset.catalogTab === tab; n.classList.toggle('is-active',active); n.setAttribute('aria-selected',String(active));});
      root.querySelectorAll<HTMLElement>('[data-wk-tab]').forEach(n=>n.classList.toggle('is-active',n.dataset.wkTab === tab));
      grid.innerHTML = items.length ? items.map((p,i)=>`<a class="wk-card" href="/prints/detail/?id=${encodeURIComponent(p.id!)}" style="--card-index:${i}"><div class="wk-card-image"><img src="${e(p.images[0]?.url)}" alt="${e(p.name)}" loading="lazy" decoding="async">${p.is_demo?'<span class="wk-badge">演示内容</span>':''}</div><div class="wk-card-info"><div><h2>${e(p.name)}</h2></div><span class="wk-card-price">${money(tab==='work'?p.min_price:(p.fixed_price??0))}<small>${tab==='work'?'起':p.weight_g?`${e(p.weight_g)} g`:''}</small></span></div></a>`).join('') : empty('新的创作，正在路上','<p>首批内容整理中，稍后再来看看。</p>');
      w.WorkshopIntro?.refresh?.(root);
      stopPreload = preloadCatalogEntries(root, items, signal);
    };
    root.querySelectorAll<HTMLButtonElement>('[data-catalog-tab]').forEach(button=>button.addEventListener('click',()=>{tab=button.dataset.catalogTab!;const params=new URLSearchParams(location.search);params.set('tab',tab);replaceQuery(params);render();},{signal}));
    render();
  } catch(error) {if(!abortError(error)) grid.innerHTML=empty('工坊暂时没有打开',`<p>${e((error as Error).message)}</p><a class="wk-button wk-secondary" href="${e(location.href)}" data-no-swup>重新连接</a>`);}
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
    const mobile=document.documentElement.dataset.ui==='mobile';
    const videos=entry.videos||[];
    const preloadedVideo=takePreloadedVideo(videos[0]?.url);
    document.title=`${entry.name} · 雨泽小鱼的工坊`;
    root.querySelector<HTMLElement>('[data-detail-breadcrumb]')!.textContent=`${configurable?'可选':'现货'} / ${entry.name}`;
    root.querySelector<HTMLAnchorElement>('[data-detail-back]')!.href=`/prints/?tab=${entry.kind}`;
    root.querySelectorAll<HTMLElement>('[data-wk-tab]').forEach(n=>n.classList.toggle('is-active',n.dataset.wkTab===entry.kind));
    let color: Color|undefined=entry.colors.find(c=>c.id===params.get('color'))||entry.colors[0];
    let infill = Number(params.get('infill')||15);
    if(!Number.isInteger(infill)||infill<15||infill>100)infill=15;
    container.innerHTML=`<div class="wk-detail-grid"><div class="wk-gallery">
      <div class="wk-stage">
        ${videos.length?`<video class="wk-stage-video" data-stage-video ${preloadedVideo?'':`src="${e(videos[0].url)}"`} poster="${e(entry.images[0]?.url)}" ${mobile?'disablepictureinpicture disableremoteplayback':'controls'} autoplay muted playsinline preload="auto"></video>`:''}
        ${mobile&&videos.length?'<div class="wk-video-replay" data-video-replay-layer hidden><button type="button" data-video-replay aria-label="重新播放视频"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5 19 12 9 19Z" fill="currentColor"/></svg></button></div>':''}
        <img class="wk-stage-image" data-stage-image src="${e(entry.images[0]?.url)}" alt="${e(entry.name)}" ${videos.length?'hidden':''}>
        ${entry.model?`<model-viewer data-viewer alt="${e(entry.name)}的三维预览" camera-controls touch-action="pan-y" zoom-sensitivity="0.1" camera-orbit="${DEFAULT_CAMERA_ORBIT}" max-camera-orbit="auto auto 400%" environment-image="neutral" shadow-intensity="0.7" exposure="1" interaction-prompt="none" loading="eager" reveal="auto" hidden></model-viewer><div class="wk-viewer-loading" data-viewer-loading hidden><span></span>正在打开 3D 预览</div><div class="wk-viewer-failed" data-viewer-failed hidden><p>3D 预览暂未加载，仍可浏览图片。</p><button type="button" class="wk-button wk-secondary" data-retry-viewer>重试 3D</button></div>`:''}
      </div>
      <div class="wk-gallery-tools">
        <div class="wk-view-switch" role="group" aria-label="媒体选择">
          ${videos.map((a,i)=>`<button type="button" data-view="video" data-media-index="${i}">▷ 视频${videos.length>1?i+1:''}</button>`).join('')}
          ${entry.images.map((a,i)=>`<button type="button" data-view="photo" data-media-index="${i}">▧ 图片${entry.images.length>1?i+1:''}</button>`).join('')}
          ${entry.model?'<button type="button" data-view="model">◇ 3D 预览</button>':''}
        </div>
        ${entry.model?'<button type="button" class="wk-text-link" data-reset-view hidden>↺ 重置视角</button>':''}
      </div>
    </div><aside class="wk-config">
      <h1>${e(entry.name)}</h1>
      <p class="wk-description">${e(entry.description).replace(/\n/g,'<br>')}</p>
      ${configurable?`
        <div class="wk-config-section">
          <div class="wk-label-row"><h2>选择颜色</h2><span data-color-name>${e(color?.name)}</span></div>
          <div class="wk-swatches" role="group" aria-label="可选颜色">${entry.colors.map(c=>`<button type="button" class="wk-swatch" data-color-id="${e(c.id)}" style="--swatch:${e(c.hex)}" aria-label="${e(c.name)}${c.material?` · ${e(c.material)}`:''}" title="${e(c.name)}${c.material?` · ${e(c.material)}`:''}" aria-pressed="${c.id===color?.id}"><span></span></button>`).join('')}</div>
          <div class="wk-material"><span>材质</span><span data-material>${e(color?.material||'—')}</span></div>
        </div>
        <div class="wk-config-section">
          <div class="wk-label-row"><h2>填充比例</h2><output class="wk-infill-value" data-infill-value>${infill}%</output></div>
          <input class="wk-range" type="range" min="15" max="100" step="1" value="${infill}" data-infill-range aria-label="调整填充比例">
        </div>
        <div class="wk-price-box"><div><span>当前报价</span><strong data-price></strong></div><span class="wk-unit">重量 <span data-weight>—</span></span></div>
      `:`
        <p class="wk-stock-facts" aria-label="售价、重量与材质"><span data-price>${money(entry.fixed_price??0)}</span><span aria-hidden="true">·</span><span data-weight>${e(entry.weight_g)} g</span><span aria-hidden="true">·</span><span>材质 <span data-material>${e(entry.material||'—')}</span></span></p>
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
    const replayLayer=container.querySelector<HTMLElement>('[data-video-replay-layer]');
    const replayButton=container.querySelector<HTMLButtonElement>('[data-video-replay]');
    const loading=container.querySelector<HTMLElement>('[data-viewer-loading]');
    const failed=container.querySelector<HTMLElement>('[data-viewer-failed]');
    let viewerReady=false;let viewerFailed=false;
    let imageIndex=0;let videoIndex=0;
    let videoNeedsPlay=false,videoPlayAttempt=0;
    let revealMediaButton: (()=>void)|undefined;
    const syncVideoReplay=()=>{
      if(!stageVideo||!replayLayer)return;
      replayLayer.hidden=stageVideo.hidden||(!stageVideo.ended&&!videoNeedsPlay);
      replayButton!.setAttribute('aria-label',stageVideo.ended?'重新播放视频':'播放视频');
    };
    const playVideo=(restart=true)=>{
      if(!stageVideo)return;
      const attempt=++videoPlayAttempt;videoNeedsPlay=false;
      if(restart)stageVideo.currentTime=0;
      syncVideoReplay();
      void stageVideo.play().catch(()=>{
        if(signal.aborted||attempt!==videoPlayAttempt||stageVideo.hidden)return;
        videoNeedsPlay=true;syncVideoReplay();
      });
    };
    if(stageVideo&&replayLayer){
      stageVideo.addEventListener('ended',syncVideoReplay,{signal});
      stageVideo.addEventListener('playing',()=>{videoNeedsPlay=false;syncVideoReplay();},{signal});
      stageVideo.addEventListener('pause',()=>{
        videoNeedsPlay=stageVideo.paused&&!stageVideo.hidden&&stageVideo.readyState>=2;
        syncVideoReplay();
      },{signal});
      replayButton!.addEventListener('click',()=>playVideo(stageVideo.ended),{signal});
    }
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
    const selectView=(view:'model'|'photo'|'video')=>{
      const model=view==='model'&&!!viewer;
      if(viewer)viewer.hidden=!model;
      stageImage.hidden=view!=='photo';
      if(stageVideo){stageVideo.hidden=view!=='video';if(view!=='video'){videoPlayAttempt++;stageVideo.pause();}}
      syncVideoReplay();
      container.querySelectorAll<HTMLElement>('[data-view]').forEach(n=>{
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
    container.querySelectorAll<HTMLElement>('[data-view]').forEach(n=>n.addEventListener('click',()=>{
      const view=n.dataset.view as 'model'|'photo'|'video';
      const index=Number(n.dataset.mediaIndex);
      if(view==='photo'){imageIndex=index;stageImage.src=entry.images[index].url!;}
      if(view==='video'&&stageVideo&&videoIndex!==index){videoIndex=index;stageVideo.src=videos[index].url!;}
      selectView(view);
      if(view==='video')playVideo();
    },{signal}));
    if(mobile){
      const mediaButtons=Array.from(container.querySelectorAll<HTMLButtonElement>('[data-view]'));
      const posters=mediaButtons.map(button=>button.dataset.view==='model'?null:entry.images[button.dataset.view==='photo'?Number(button.dataset.mediaIndex):0]?.url);
      revealMediaButton=initMobileGallerySwipe(container.querySelector<HTMLElement>('.wk-stage')!,mediaButtons,posters,signal);
    }
    if(viewer){
      viewer.addEventListener('load',()=>{if(signal.aborted)return;viewerReady=true;viewerFailed=false;loading!.hidden=true;failed!.hidden=true;paint();},{signal});
      viewer.addEventListener('error',viewerError,{signal});
      container.querySelector('[data-reset-view]')!.addEventListener('click',()=>{selectView('model');viewer.cameraOrbit=DEFAULT_CAMERA_ORBIT;viewer.cameraTarget='auto auto auto';viewer.fieldOfView='auto';viewer.jumpCameraToGoal?.();},{signal});
      container.querySelector('[data-retry-viewer]')!.addEventListener('click',()=>{viewerFailed=false;failed!.hidden=true;loading!.hidden=false;openModel(true);},{signal});
    }
    selectView(videos.length?'video':'photo');
    if(stageVideo){
      stageVideo.muted=true;
      playVideo(false);
    }
    const range=container.querySelector<HTMLInputElement>('[data-infill-range]');
    const contact=container.querySelector<HTMLButtonElement>('[data-contact]')!;
    const update=()=>{
      let displayPrice:string;
      if(configurable){
        const value=range!.valueAsNumber;
        const valid=Number.isInteger(value)&&value>=15&&value<=100&&!!color;
        contact.disabled=!valid;
        range!.setAttribute('aria-invalid',String(!valid));
        setStatus(container.querySelector('[data-contact-error]'),valid?'':'请选择颜色与填充比例',!valid);
        displayPrice=valid?money(quote(entry.min_price,entry.max_price,value)):'—';
        container.querySelector<HTMLElement>('[data-weight]')!.textContent=valid?grams(weightAt(entry.min_weight_g,entry.max_weight_g,value)):'—';
        if(valid){
          infill=value;range!.style.setProperty('--fill',`${(infill-15)/85*100}%`);
          range!.setAttribute('aria-valuetext',`${infill}%`);
          container.querySelector<HTMLOutputElement>('[data-infill-value]')!.value=`${infill}%`;
          container.querySelector<HTMLElement>('[data-color-name]')!.textContent=color!.name;
          container.querySelectorAll<HTMLElement>('[data-color-id]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.colorId===color!.id)));
          const current=new URLSearchParams(location.search);current.set('color',color!.id);current.set('infill',String(infill));replaceQuery(current);paint();
        }
      }else{
        displayPrice=entry.fixed_price===null?'—':money(entry.fixed_price);
        contact.disabled=entry.fixed_price===null;
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
      if(viewer)selectView('model');
    },{signal}));
    update();
    const dialog=root.querySelector<HTMLDialogElement>('[data-contact-dialog]')!;
    const text=root.querySelector<HTMLTextAreaElement>('[data-contact-text]')!;
    const feedback=root.querySelector<HTMLElement>('[data-copy-feedback]')!;
    root.querySelector('[data-close-dialog]')!.addEventListener('click',()=>dialog.close(),{signal});
    dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}},{signal});
    root.querySelector('[data-copy-again]')!.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(text.value);if(!signal.aborted)setStatus(feedback,'清单已复制，可以粘贴到 QQ。');}catch{if(signal.aborted)return;text.focus();text.select();setStatus(feedback,'自动复制未成功，已选中清单，请手动复制。');}},{signal});
    contact.addEventListener('click',async()=>{
      contact.disabled=true;
      const controls=[range,...Array.from(container.querySelectorAll<HTMLButtonElement>('[data-color-id]'))].filter((control):control is HTMLInputElement|HTMLButtonElement=>!!control);
      controls.forEach(control=>control.disabled=true);
      try{
        const query=new URLSearchParams({id});
        if(configurable){query.set('color',color!.id);query.set('infill',String(infill));}
        const [q,settings]=await Promise.all([api<{entry:Entry;color?:Color;infill?:number;price:number;weight_g:number|null;material:string}>(`/api/quote?${query}`,signal),api<Settings>('/api/settings',signal)]);
        if(signal.aborted)return;
        if(q.entry.kind!==entry.kind)throw new Error('内容栏目已更新，请刷新页面后重新选择。');
        const changed=entry.revision!==q.entry.revision;entry=q.entry;color=q.color;update();
        text.value=[`商品：${entry.name}`,`材质：${q.material||'—'}`,
          ...(configurable?[`颜色：${color!.name}`,`填充比例：${infill}%`]:[]),
          `报价：${money(q.price)}`].join('\n');
        root.querySelector<HTMLElement>('[data-contact-qr]')!.innerHTML=(settings.qq_image?`<img class="wk-contact-qr" src="${e(settings.qq_image.url)}" alt="店主 QQ 联系二维码">`:'<p class="wk-qr-empty">店主还没有设置 QQ 二维码。清单可以先复制保存。</p>')+`<p class="wk-contact-number">QQ：<strong>${CONTACT_QQ}</strong></p>`;
        setStatus(feedback,changed?'商品信息已更新，清单已使用最新报价。':'');dialog.showModal();
      }catch(error){if(!abortError(error))setStatus(container.querySelector('[data-contact-error]'),(error as Error).message,true);}
      finally{if(!signal.aborted){controls.forEach(control=>control.disabled=false);contact.disabled=configurable?(range!.getAttribute('aria-invalid')==='true'||!color):entry.fixed_price===null;}}
    },{signal});
  }catch(error){if(!abortError(error))container.innerHTML=empty('暂时找不到这件作品',`<p>${e((error as Error).message)}</p><a class="wk-button wk-secondary" href="/prints/">返回工坊</a>`);}
}

function destroy(){controller?.abort();cleanup?.();cleanup=null;currentRoot?.querySelectorAll<HTMLVideoElement>('video').forEach(v=>{v.pause();v.removeAttribute('src');});currentRoot?.querySelectorAll<any>('model-viewer').forEach(v=>{v.pause?.();v.removeAttribute('src');v.remove();});currentRoot?.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(d=>d.close());controller=null;currentRoot=null;}
function init(){const root=document.querySelector<HTMLElement>('[data-workshop]');if(root===currentRoot)return;destroy();if(!root)return;currentRoot=root;controller=new AbortController();const signal=controller.signal;if(root.dataset.workshop==='catalog')void catalog(root,signal);else if(root.dataset.workshop==='detail')void detail(root,signal);else cleanup=initAdmin(root,signal);}
w.WorkshopApp={init,destroy,preload:preloadPublicCatalog};
