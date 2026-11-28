import {abortError, escapeHTML as e, firstVideoIndexForColor, workPriceAt, workPriceRange, workWeightAt, grams, money, replaceQuery, setStatus, CONTACT_QQ, Entry, Color} from './workshop-shared';
import {publicApi as api, catalogEntries, preloadPublicCatalog} from './workshop-public';
import {initAdmin} from './print-admin';
import {initMobileGallerySwipe} from './mobile-workshop-gallery';
import {bindMobileVideoBar, mobileVideoBar} from './mobile-workshop-video';
import {bindGalleryPhotos} from './workshop-gallery-photos';
import {preloadCatalogEntries, takePreloadedVideo} from './workshop-preload';
import {bindWorkshopContact} from './workshop-contact';
import {bindWorkshopCart} from './workshop-cart';

const w = window as any;
type AddToCart = ReturnType<typeof bindWorkshopCart>;
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

function stockWeightLabel(entry: Entry): string {
  return entry.weight_g == null ? '' : `${entry.weight_approximate ? '约 ' : ''}${entry.weight_g} g`;
}

function entryCardPrice(entry: Entry): string {
  const configurable = entry.kind === 'work';
  const [price, high] = configurable ? workPriceRange(entry) : [entry.fixed_price, entry.fixed_price];
  const isRange = price !== high || (!entry.color_prices && entry.fixed_infill == null);
  const suffix = configurable ? (isRange ? '起' : '') : entry.topic === 'expedition-33' ? '' : stockWeightLabel(entry);
  return `${money(price)}${suffix ? `<small>${e(suffix)}</small>` : ''}`;
}

function entryCard(entry: Entry, index: number, inTopic = false): string {
  const query = new URLSearchParams({id: entry.id!});
  if (inTopic && entry.topic) query.set('from', entry.topic);
  const badge = entry.is_demo ? '演示内容' : '';
  const heading = inTopic ? 'h3' : 'h2';
  const mobile = document.documentElement.dataset.ui === 'mobile';
  const topicControl = mobile
    ? 'aria-controls="topic-detail-inline" aria-expanded="false"'
    : 'aria-haspopup="dialog" aria-controls="topic-detail"';
  const price = `<span class="wk-card-price">${entryCardPrice(entry)}</span>`;
  const priceLine = inTopic && entry.topic === 'expedition-33'
    ? `<div class="exp33-price-line"><span>售价</span>${price}</div>` : price;
  return `<a class="wk-card" data-workshop-item ${inTopic ? `data-topic-item="${e(entry.id)}" data-entry-kind="${e(entry.kind)}" data-no-swup ${topicControl}` : ''} href="/prints/detail/?${e(query.toString())}" style="--card-index:${index}">
    <div class="wk-card-image"><img src="${e(entry.images[0]?.url)}" alt="${e(entry.name)}" loading="${index < 2 ? 'eager' : 'lazy'}" fetchpriority="${index === 0 ? 'high' : 'auto'}" decoding="async">${badge ? `<span class="wk-badge">${badge}</span>` : ''}</div>
    <div class="wk-card-info"><div><${heading}>${e(entry.name)}</${heading}></div>${priceLine}</div>
  </a>`;
}

function hydrateCatalogLead(card: HTMLAnchorElement | undefined, entry: Entry) {
  if (!card || entry.is_demo) return;
  const cover = entry.images[0]?.url;
  const image = card.querySelector('img');
  if (image?.src !== (cover ? new URL(cover, document.baseURI).href : undefined)) return;

  card.querySelector('h2')!.textContent = entry.name;
  card.querySelector('.wk-card-price')!.innerHTML = entryCardPrice(entry);
  card.setAttribute('data-workshop-item', '');
  delete card.dataset.catalogLead;
  delete card.dataset.catalogId;
  return card;
}

async function catalog(root: HTMLElement, signal: AbortSignal) {
  const list = root.querySelector<HTMLElement>('[data-catalog-entries]')!;
  const topicCard = root.querySelector<HTMLAnchorElement>('a[data-catalog-topic]');
  const contact = root.querySelector<HTMLElement>('[data-catalog-contact]');
  if (contact) {
    contact.querySelector('strong')!.textContent = `QQ ${CONTACT_QQ}`;
    contact.hidden = false;
  }
  const seeds = new Map(Array.from(list.querySelectorAll<HTMLAnchorElement>('[data-catalog-lead]'))
    .map(card => [card.dataset.catalogId, card]));
  try {
    const {entries} = await api<{entries: Entry[]}>('/api/catalog', signal);
    if (signal.aborted) return;
    const items = catalogEntries(entries, root.dataset.catalogHidden?.split(' ') ?? []);
    let next = list.firstChild;
    const template = document.createElement('template');
    items.forEach((entry, index) => {
      const seed = hydrateCatalogLead(seeds.get(entry.id), entry);
      if (seed) seed.style.setProperty('--card-index', String(index));
      else template.innerHTML = entryCard(entry, index);
      const card = seed ?? template.content.firstElementChild!;
      if (card === next) next = card.nextSibling;
      else list.insertBefore(card, next);
    });
    while (next) {
      const stale = next;
      next = next.nextSibling;
      stale.remove();
    }
    if (!items.length && !topicCard) list.innerHTML = empty('新的创作，正在路上','<p>首批内容整理中，稍后再来看看。</p>');
    w.WorkshopIntro?.refresh?.(root);
    preloadCatalogEntries(root, items, signal);
  } catch (error) {
    if (signal.aborted || abortError(error)) return;
    const status = empty('工坊暂时没有打开',`<p>${e((error as Error).message)}</p><a class="wk-button wk-secondary" href="${e(location.href)}" data-no-swup>重新连接</a>`);
    list.querySelector('.wk-catalog-loading')?.remove();
    list.insertAdjacentHTML('beforeend', status);
    w.WorkshopIntro?.refresh?.(root);
  }
}

async function topic(root: HTMLElement, signal: AbortSignal, addToCart: AddToCart) {
  const grid = root.querySelector<HTMLElement>('[data-topic-grid]');
  if (!grid) return;
  const topicId = root.dataset.topic;
  try {
    const {entries} = await api<{entries: Entry[]}>('/api/catalog', signal);
    if (signal.aborted) return;
    const items = entries.filter(entry => topicId && entry.topic === topicId && entry.status === 'published');
    grid.innerHTML = items.length
      ? items.map((entry, index) => entryCard(entry, index, true)).join('')
      : '<p class="wk-topic-status">暂无上架物品</p>';
    if (topicId === 'expedition-33') {
      grid.querySelectorAll('[data-topic-item]').forEach((card, index) => {
        card.animate?.([
          {opacity: 0, transform: 'translateY(8px)'},
          {opacity: 1, transform: 'none'},
        ], {
          duration: 420,
          delay: Math.min(index, 4) * 72,
          easing: 'cubic-bezier(.2,.7,.35,1)',
          fill: 'backwards',
        });
      });
    }
    bindTopicDetails(root, grid, items, signal, addToCart);
  } catch (error) {
    if (!signal.aborted && !abortError(error)) grid.innerHTML = '<p class="wk-topic-status">物品暂未加载，请刷新重试。</p>';
  }
}

function bindTopicDetails(root: HTMLElement, grid: HTMLElement, items: Entry[], signal: AbortSignal, addToCart: AddToCart) {
  const mobile = document.documentElement.dataset.ui === 'mobile';
  const dialog = mobile ? null : root.querySelector<HTMLDialogElement>('[data-topic-detail]')!;
  const panel = dialog ?? root.querySelector<HTMLElement>('[data-topic-inline]')!;
  const content = panel.querySelector<HTMLElement>('[data-detail-content]')!;
  const title = panel.querySelector<HTMLElement>('[data-topic-detail-title]')!;
  const backToWorkshop = root.querySelector<HTMLAnchorElement>('[data-topic-back-workshop]')!;
  const list = root.querySelector<HTMLElement>('#topic-items')!;
  const cartTrigger = root.querySelector<HTMLButtonElement>('[data-open-cart]')!;
  const entries = new Map(items.map(entry => [entry.id, entry]));
  const topicUrl = location.href;
  let active: AbortController | undefined;
  let trigger: HTMLAnchorElement | undefined;
  let listScrollTop = 0;

  function releaseDetail() {
    active?.abort();
    active = undefined;
    if (dialog && cartTrigger.parentElement === dialog) root.append(cartTrigger);
    content.querySelectorAll('video').forEach(video => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    });
    content.querySelector('model-viewer')?.removeAttribute('src');
    content.replaceChildren();
    delete panel.dataset.expeditionDetail;
  }

  function showInline(open: boolean) {
    panel.hidden = !open;
    list.hidden = backToWorkshop.hidden = open;
    trigger?.setAttribute('aria-expanded', String(open));
    window.scrollTo({top: open ? 0 : listScrollTop, behavior: 'instant'});
    if (open) title.focus({preventScroll:true});
  }

  function restoreList() {
    releaseDetail();
    trigger?.focus({preventScroll:true});
    trigger = undefined;
  }

  function openDetail(card: HTMLAnchorElement, entry: Entry) {
    trigger = card;
    title.textContent = entry.name;
    active = new AbortController();
    if (dialog) {
      dialog.setAttribute('aria-label', entry.name);
      // A modal makes its siblings inert, so keep the same floating control inside it.
      dialog.append(cartTrigger);
      dialog.showModal();
      dialog.scrollTop = 0;
    } else {
      showInline(true);
    }
    void detail(panel, active.signal, addToCart, entry);
  }

  grid.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const card = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('[data-topic-item]') : null;
    const entry = entries.get(card?.dataset.topicItem);
    if (!card || !entry) return;
    event.preventDefault();
    if (active) return;
    if (!dialog) {
      listScrollTop = window.scrollY;
      // Keep the same URL and video while giving browser Back and Forward an entry to visit.
      history.pushState({...history.state, workshopTopicDetail: {id: entry.id, listScrollTop}}, '');
    }
    openDetail(card, entry);
  }, {signal});

  if (dialog) {
    dialog.querySelector('[data-close-topic-detail]')!.addEventListener('click', () => dialog.close(), {signal});
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
        dialog.close();
      }
    }, {signal});
    dialog.addEventListener('close', () => { if (!dialog.open) restoreList(); }, {signal});
  } else {
    function syncInlineHistory() {
      if (location.href !== topicUrl) return;
      const selection = history.state?.workshopTopicDetail;
      const entry = entries.get(selection?.id);
      if (!entry) {
        if (active) {
          showInline(false);
          restoreList();
        }
        return;
      }
      if (trigger?.dataset.topicItem === entry.id) return;
      const card = grid.querySelector<HTMLAnchorElement>(`[data-topic-item="${CSS.escape(entry.id!)}"]`);
      if (!card) return;
      releaseDetail();
      listScrollTop = selection.listScrollTop;
      openDetail(card, entry);
    }
    window.addEventListener('popstate', syncInlineHistory, {signal});
    syncInlineHistory();
    root.addEventListener('keydown', event => {
      if (event.key === 'Escape' && active && !event.defaultPrevented && !root.querySelector('dialog[open]')) history.back();
    }, {signal});
  }
  signal.addEventListener('abort', () => {
    releaseDetail();
    if (dialog?.open) dialog.close();
  }, {once:true});
}

async function detail(root: HTMLElement, signal: AbortSignal, addToCart: AddToCart, topicItem?: Entry) {
  const container = root.querySelector<HTMLElement>('[data-detail-content]')!;
  const params = new URLSearchParams(topicItem ? '' : location.search);
  const id = topicItem?.id ?? params.get('id');
  if(!id){container.innerHTML=empty('先挑一个喜欢的形状','<a class="wk-button wk-primary" href="/prints/">浏览工坊</a>');return;}
  try {
    const entry = topicItem ?? await api<Entry>(`/api/entry/${encodeURIComponent(id)}`,signal);
    if(signal.aborted)return;
    const configurable=entry.kind==='work';
    const expeditionItem=entry.topic==='expedition-33';
    const cameraOrbit=expeditionItem?'8deg 86deg 135%':DEFAULT_CAMERA_ORBIT;
    const mobile=document.documentElement.dataset.ui==='mobile';
    const description=mobile&&!expeditionItem
      ? entry.description.split(/\r\n?|\n/).filter(line=>line.trim()).map(e).join('<br>')
      : e(entry.description).replace(/\r\n?|\n/g,'<br>');
    const videos=entry.videos||[];
    const photos=entry.images;
    const previews=configurable?entry.color_previews:undefined;
    if (!topicItem) {
      document.title=`${entry.name} · 雨泽小鱼的工坊`;
      root.querySelector<HTMLElement>('[data-detail-breadcrumb]')!.textContent=entry.name;
      const back = root.querySelector<HTMLAnchorElement>('[data-detail-back]')!;
      if (entry.topic && params.get('from') === entry.topic) {
        back.href = `/prints/${encodeURIComponent(entry.topic)}/`;
        back.textContent = '← 返回专题';
      } else back.href = '/prints/';
    }
    let color: Color|undefined=entry.colors.find(c=>c.id===params.get('color'))||entry.colors[0];
    const activePreview=()=>color?previews?.[color.id]:undefined;
    const initialPreview=activePreview();
    const initialVideoIndex=firstVideoIndexForColor(entry,color?.id);
    const initialVideo=videos[initialVideoIndex];
    const preloadedVideo=takePreloadedVideo(initialVideo?.url);
    const cover=initialPreview?photos.find(image=>initialPreview.image_ids.includes(image.id)):photos[0];
    const fixedInfill=entry.fixed_infill;
    let infill = fixedInfill??Number(params.get('infill')||15);
    if(!Number.isInteger(infill)||infill<15||infill>100)infill=15;
    const material=e((configurable?color?.material:entry.material)||'—');
    const materialRow=`<div class="wk-material"><span>材质</span><span data-material>${material}</span></div>`;
    const infillSection=configurable||fixedInfill!=null?`
      <div class="wk-config-section${fixedInfill==null?'':' wk-config-section--fixed-infill'}">
        <div class="wk-label-row"><h2>${fixedInfill==null?'填充比例':'固定填充比例'}</h2><output class="wk-infill-value" data-infill-value>${fixedInfill??infill}%</output></div>
        ${fixedInfill==null?`<input class="wk-range" type="range" min="15" max="100" step="1" value="${infill}" data-infill-range aria-label="调整填充比例">`:''}
      </div>`:'';
    const stockWeight=stockWeightLabel(entry);
    const stockInfill=fixedInfill==null?'':`<span aria-hidden="true">·</span><span>填充比例 <span data-infill-value>${e(fixedInfill)}%</span></span>`;
    container.innerHTML=`<div class="wk-detail-grid"><div class="wk-gallery">
      <div class="wk-stage">
        ${videos.length?`<video class="wk-stage-video" data-stage-video ${!preloadedVideo&&initialVideo?.url?`src="${e(initialVideo.url)}"`:''} ${cover?.url?`poster="${e(cover.url)}"`:''} ${mobile?'disablepictureinpicture disableremoteplayback':'controls'} ${initialVideo?'autoplay':'hidden'} playsinline preload="auto"></video>`:''}
        ${mobile&&videos.length?'<div class="wk-video-replay" data-video-replay-layer hidden><button type="button" data-video-replay aria-label="重新播放视频"><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5 19 12 9 19Z" fill="currentColor"/></svg></button></div>':''}
        <img class="wk-stage-image" data-stage-image ${cover?.url?`src="${e(cover.url)}"`:''} alt="${e(entry.name)}" ${videos.length||!cover?'hidden':''}>
        <span class="wk-photo-status" data-photo-status role="status" hidden></span>
        ${previews?'<p class="wk-color-placeholder" data-color-placeholder role="status" hidden></p>':''}
        ${entry.model?`<model-viewer data-viewer ${expeditionItem?'data-topic-model':''} alt="${e(entry.name)}的三维预览" camera-controls touch-action="${mobile?'none':'pan-y'}" zoom-sensitivity="0.1" camera-orbit="${cameraOrbit}" max-camera-orbit="auto auto 400%" environment-image="neutral" shadow-intensity="0.7" exposure="1" interaction-prompt="none" loading="eager" reveal="auto" hidden></model-viewer><div class="wk-viewer-loading" data-viewer-loading hidden><span></span>正在打开 3D 预览</div><div class="wk-viewer-failed" data-viewer-failed hidden><p>3D 预览暂未加载，仍可浏览图片。</p><button type="button" class="wk-button wk-secondary" data-retry-viewer>重试 3D</button></div>`:''}
        ${mobile&&videos.length?mobileVideoBar:''}
        ${expeditionItem?'<span class="exp33-stage-frame" aria-hidden="true"></span>':''}
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
      ${topicItem && mobile ? '' : `<h1>${e(entry.name)}</h1>`}
      <p class="wk-description">${description}</p>
      ${configurable?`
        <div class="wk-config-section">
          <div class="wk-label-row"><h2>选择颜色</h2><span data-color-name>${e(color?.name)}</span></div>
          <div class="wk-swatches" role="group" aria-label="可选颜色">${entry.colors.map(c=>{
            const accent=previews?.[c.id]?.accent;
            const swatch=accent?`linear-gradient(135deg,${c.hex} 50%,${accent} 50%)`:c.hex;
            return `<button type="button" class="wk-swatch" data-color-id="${e(c.id)}" style="--swatch:${e(swatch)}" aria-label="${e(c.name)}${c.material?` · ${e(c.material)}`:''}" title="${e(c.name)}${c.material?` · ${e(c.material)}`:''}" aria-pressed="${c.id===color?.id}"><span></span></button>`;
          }).join('')}</div>
          ${materialRow}
        </div>
        ${infillSection}
        <div class="wk-price-box"><div><span>当前报价</span><strong data-price></strong></div><span class="wk-unit">重量 <span data-weight>—</span></span></div>
      `:expeditionItem?`
        <div class="wk-stock-specs">${materialRow}${infillSection}</div>
        <div class="wk-price-box"><div><span>售价</span><strong data-price>${money(entry.fixed_price)}</strong></div>
          ${stockWeight?`<span class="wk-unit">重量 <span data-weight>${e(stockWeight)}</span></span>`:''}
        </div>
      `:`
        <p class="wk-stock-facts" aria-label="物品信息">
          <span data-price>${money(entry.fixed_price)}</span>${stockWeight?`<span aria-hidden="true">·</span><span data-weight>${e(stockWeight)}</span>`:''}
          <span aria-hidden="true">·</span><span>材质 <span data-material>${material}</span></span>${stockInfill}
        </p>
      `}
      <button type="button" class="wk-button wk-primary wk-add-cart" data-add-cart>加入购物车</button>
      <p class="wk-feedback" data-detail-feedback role="status"></p>
    </aside></div>`;
    if (expeditionItem) root.dataset.expeditionDetail = entry.kind;
    if(preloadedVideo){
      const placeholder=container.querySelector<HTMLVideoElement>('[data-stage-video]')!;
      for(const attribute of Array.from(placeholder.attributes))preloadedVideo.setAttribute(attribute.name,attribute.value);
      placeholder.replaceWith(preloadedVideo);
    }
    if(!topicItem)w.WorkshopIntro?.refresh?.(root);
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
    const originalModelUrl = entry.model?.url;
    const brotliUrl = entry.model?.brotli_url;
    let modelUrl = originalModelUrl && brotliUrl?.startsWith('https://') ? brotliUrl : originalModelUrl;
    let modelRequested = false;
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
      modelRequested=false;
      viewerFailed=true;
      if(loading)loading.hidden=true;
      if(failed)failed.hidden=viewer.hidden;
    };
    const openModel=(retry=false)=>{
      const source = modelUrl;
      if (!source || modelRequested || signal.aborted) return;
      modelRequested = true;
      loadViewer().then(()=>{
        if (signal.aborted) return;
        if (retry) {
          const url = new URL(source, document.baseURI);
          url.searchParams.set('retry', String(Date.now()));
          viewer.src = url.href;
        } else viewer.src = source;
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
    function showColorMedia(preferVideo=false, keepModel=false) {
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
      const modelButton=mediaButtons.find(button=>button.dataset.view==='model');
      const defaultButton=keepModel&&modelButton?modelButton:firstMedia||modelButton;
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
      viewer.addEventListener('error', (event: CustomEvent) => {
        if (signal.aborted) return;
        if (event.detail?.type === 'loadfailure' && modelRequested && originalModelUrl && modelUrl !== originalModelUrl) {
          modelUrl = originalModelUrl;
          viewer.src = originalModelUrl;
          return;
        }
        viewerError();
      }, {signal});
      container.querySelector('[data-reset-view]')!.addEventListener('click',()=>{selectView('model');viewer.cameraOrbit=cameraOrbit;viewer.cameraTarget='auto auto auto';viewer.fieldOfView='auto';viewer.jumpCameraToGoal?.();},{signal});
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
    const add=container.querySelector<HTMLButtonElement>('[data-add-cart]')!;
    const feedback=container.querySelector<HTMLElement>('[data-detail-feedback]');
    const update=()=>{
      let displayPrice:string;
      if(configurable){
        const value=range?.valueAsNumber??infill;
        const valid=Number.isInteger(value)&&value>=15&&value<=100&&!!color;
        add.disabled=!valid;
        range?.setAttribute('aria-invalid',String(!valid));
        setStatus(feedback,valid?'':'请选择颜色与填充比例',!valid);
        displayPrice=valid?money(workPriceAt(entry,color!.id,value)):'—';
        const approximate=fixedInfill!=null&&entry.weight_g!=null;
        container.querySelector<HTMLElement>('[data-weight]')!.textContent=valid?`${approximate?'约 ':''}${grams(workWeightAt(entry,value))}`:'—';
        if(valid){
          infill=value;range?.style.setProperty('--fill',`${(infill-15)/85*100}%`);
          range?.setAttribute('aria-valuetext',`${infill}%`);
          container.querySelector<HTMLOutputElement>('[data-infill-value]')!.value=`${infill}%`;
          container.querySelector<HTMLElement>('[data-color-name]')!.textContent=color!.name;
          container.querySelectorAll<HTMLElement>('[data-color-id]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.colorId===color!.id)));
          if(!topicItem){const current=new URLSearchParams(location.search);current.set('color',color!.id);current.set('infill',String(infill));replaceQuery(current);}
          paint();
        }
      }else{
        displayPrice=money(entry.fixed_price);
        add.hidden=add.disabled=entry.fixed_price==null;
        if(!topicItem){const current=new URLSearchParams(location.search);current.delete('color');current.delete('infill');replaceQuery(current);}
      }
      container.querySelector<HTMLElement>('[data-price]')!.textContent=displayPrice;
      container.querySelector<HTMLElement>('[data-material]')!.textContent=(configurable?color?.material:entry.material)||'—';
    };
    range?.addEventListener('input',update,{signal});
    container.querySelectorAll<HTMLElement>('[data-color-id]').forEach(n=>n.addEventListener('click',()=>{
      color=entry.colors.find(c=>c.id===n.dataset.colorId);
      update();
      if(previews)showColorMedia(false,expeditionItem&&!!viewer&&!viewer.hidden);
      else if(viewer)selectView('model');
    },{signal}));
    update();
    add.addEventListener('click',event=>{
      if (!addToCart({id,name:entry.name,...(configurable?{colorId:color!.id,infill}:{})},entry,event,signal)) {
        setStatus(feedback,'此规格已达到 99 件。',true);
      }
    },{signal});
  } catch (error) {
    if (abortError(error)) return;
    delete root.dataset.expeditionDetail;
    container.innerHTML=empty('暂时找不到这件作品',`<p>${e((error as Error).message)}</p>${topicItem?'':'<a class="wk-button wk-secondary" href="/prints/">返回工坊</a>'}`);
  }
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
  if (root.dataset.workshop === 'admin') {
    cleanup = initAdmin(root, signal);
    return;
  }
  const addToCart = bindWorkshopCart(root, signal, bindWorkshopContact(root, signal));
  if (root.dataset.workshop === 'catalog') void catalog(root, signal);
  else if (root.dataset.workshop === 'detail') void detail(root, signal, addToCart);
  else if (root.dataset.workshop === 'topic') void topic(root, signal, addToCart);
}
w.WorkshopApp={init,destroy,preload:preloadPublicCatalog};
