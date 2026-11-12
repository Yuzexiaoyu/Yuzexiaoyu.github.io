import {abortError, escapeHTML as e, quote, money, replaceQuery, setStatus, Entry, Color, Settings} from './workshop-shared';
import {publicApi as api} from './workshop-public';
import {initAdmin} from './print-admin';

const w = window as any;
let currentRoot: HTMLElement|null = null;
let controller: AbortController|null = null;
let cleanup: (()=>void)|null = null;
let viewerPromise: Promise<void>|null = null;

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
    const search = root.querySelector<HTMLInputElement>('[data-catalog-search]')!;
    const render = () => {
      const term = search.value.trim().toLocaleLowerCase();
      const items = entries.filter(p=>p.kind === tab && `${p.name} ${p.description}`.toLocaleLowerCase().includes(term));
      root.querySelectorAll<HTMLElement>('[data-count]').forEach(n=>n.textContent = String(entries.filter(p=>p.kind === n.dataset.count).length).padStart(2,'0'));
      root.querySelectorAll<HTMLElement>('[data-catalog-tab]').forEach(n=>{const active = n.dataset.catalogTab === tab; n.classList.toggle('is-active',active); n.setAttribute('aria-selected',String(active));});
      root.querySelectorAll<HTMLElement>('[data-wk-tab]').forEach(n=>n.classList.toggle('is-active',n.dataset.wkTab === tab));
      grid.innerHTML = items.length ? items.map((p,i)=>`<a class="wk-card" href="/prints/detail/?id=${encodeURIComponent(p.id!)}" style="--card-index:${i}"><div class="wk-card-image"><img src="${e(p.images[0]?.url)}" alt="${e(p.name)}" loading="lazy" decoding="async">${p.is_demo?'<span class="wk-badge">演示内容</span>':''}<span class="wk-card-open" aria-hidden="true">↗</span>${p.model?'<span class="wk-3d-label">◇ 可查看 3D</span>':''}</div><div class="wk-card-info"><div><span class="wk-card-kicker">${tab==='work'?'FORM & EXPLORATION':'MADE FOR YOUR EVERYDAY'}</span><h2>${e(p.name)}</h2></div>${tab==='product'?`<span class="wk-card-price">${money(p.min_price)}<small>起${p.is_demo?' · 示例价':''}</small></span>`:'<span class="wk-card-number">↗</span>'}</div></a>`).join('') : empty(term?'没有找到这个形状':'新的创作，正在路上',`<p>${term?'试试其他关键词，或清空搜索。':'首批内容整理中，稍后再来看看。'}</p>${term?'<button type="button" class="wk-button wk-secondary" data-clear-search>清空搜索</button>':''}`);
    };
    root.querySelectorAll<HTMLButtonElement>('[data-catalog-tab]').forEach(button=>button.addEventListener('click',()=>{tab=button.dataset.catalogTab!;const params=new URLSearchParams(location.search);params.set('tab',tab);replaceQuery(params);render();},{signal}));
    search.addEventListener('input',render,{signal});
    grid.addEventListener('click',event=>{if((event.target as HTMLElement).closest('[data-clear-search]')){search.value='';render();search.focus();}},{signal});
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
    const product=entry.kind==='product';
    document.title=`${entry.name} · 雨泽小鱼的工坊`;
    root.querySelector<HTMLElement>('[data-detail-breadcrumb]')!.textContent=`${product?'可选购商品':'作品展示'} / ${entry.name}`;
    root.querySelector<HTMLAnchorElement>('[data-detail-back]')!.href=`/prints/?tab=${entry.kind}`;
    root.querySelectorAll<HTMLElement>('[data-wk-tab]').forEach(n=>n.classList.toggle('is-active',n.dataset.wkTab===entry.kind));
    let color: Color|undefined=entry.colors.find(c=>c.id===params.get('color'))||entry.colors[0];
    let infill = Number(params.get('infill')||15);
    if(!Number.isInteger(infill)||infill<15||infill>100)infill=15;
    container.innerHTML=`<div class="wk-detail-grid"><div class="wk-gallery"><div class="wk-stage"><img class="wk-stage-image" data-stage-image src="${e(entry.images[0]?.url)}" alt="${e(entry.name)}">${entry.model?`<model-viewer data-viewer src="${e(entry.model.url)}" poster="${e(entry.images[0]?.url)}" alt="${e(entry.name)}的三维预览" camera-controls touch-action="pan-y" camera-orbit="30deg 75deg auto" environment-image="neutral" shadow-intensity="0.7" exposure="1" interaction-prompt="none" loading="eager" reveal="auto"></model-viewer><div class="wk-viewer-loading" data-viewer-loading><span></span>正在打开 3D 预览</div><div class="wk-viewer-failed" data-viewer-failed hidden><p>3D 预览暂未加载，仍可浏览图片。</p><button type="button" class="wk-button wk-secondary" data-retry-viewer>重试 3D</button></div>`:''}<span class="wk-stage-label">${entry.is_demo?'DEMO / 演示模型':'FORM STUDY / '+e(entry.id?.slice(0,8).toUpperCase())}</span></div><div class="wk-gallery-tools"><div class="wk-view-switch">${entry.model?'<button type="button" class="is-active" data-view="model">◇ 3D 预览</button>':''}<button type="button" data-view="photo" ${!entry.model?'class="is-active"':''}>▧ 图片</button></div>${entry.model?'<button type="button" class="wk-text-link" data-reset-view>↺ 重置视角</button>':''}</div><div class="wk-thumbnails">${entry.images.map((a,i)=>`<button type="button" data-thumbnail="${i}" aria-label="查看第 ${i+1} 张图片"><img src="${e(a.url)}" alt="${e(entry.name)}图片 ${i+1}"></button>`).join('')}</div><p class="wk-view-hint">${entry.model?'拖动旋转 · 滚轮或双指缩放':'每张图片，都是一次创作记录。'}</p></div><aside class="wk-config"><div class="wk-config-top"><span class="wk-eyebrow">${product?'MAKE IT YOURS':'A WORKSHOP JOURNAL'}</span>${entry.is_demo?'<span class="wk-demo-label">演示内容 · 非实际售卖</span>':''}</div><h1>${e(entry.name)}</h1><p class="wk-description">${e(entry.description).replace(/\n/g,'<br>')}</p>${product?`<div class="wk-config-section"><div class="wk-label-row"><h2>01 / 选择颜色</h2><span data-color-name>${e(color?.name)}</span></div><div class="wk-swatches" role="group" aria-label="可选颜色">${entry.colors.map(c=>`<button type="button" class="wk-swatch" data-color-id="${e(c.id)}" style="--swatch:${e(c.hex)}" aria-label="${e(c.name)}" title="${e(c.name)}" aria-pressed="${c.id===color?.id}"><span></span></button>`).join('')}</div><p class="wk-muted">屏幕预览与实物颜色可能存在差异。</p></div><div class="wk-config-section"><div class="wk-label-row"><h2>02 / 填充比例</h2><label class="wk-infill-number"><input type="number" min="15" max="100" step="1" value="${infill}" data-infill-number aria-label="填充比例百分数"><span>%</span></label></div><input class="wk-range" type="range" min="15" max="100" step="1" value="${infill}" data-infill-range aria-label="调整填充比例"><div class="wk-range-labels"><span>15% · 轻盈</span><span>100% · 充实</span></div><p class="wk-muted">按填充比例线性报价，四舍五入至整数元。</p><p class="wk-feedback" data-infill-error role="status"></p></div><div class="wk-price-box"><div><span>${entry.is_demo?'示例报价':'当前报价'}</span><strong data-price>${money(quote(entry.min_price,entry.max_price,infill))}</strong></div><span class="wk-unit">1 件 / 单件选购</span></div><p class="wk-selection-summary" data-selection-summary></p><button type="button" class="wk-button wk-primary wk-contact-button" data-contact><strong class="wk-mobile-price" data-mobile-price></strong><span>生成清单 · QQ 联系</span><span>↗</span></button><p class="wk-muted wk-price-note">复制清单后联系确认，尚未提交订单。</p>`:'<div class="wk-work-note"><span>关于这次创作</span><p>这是工坊的作品记录。更多可以带回家的形状，请到可选购商品看看。</p><a class="wk-text-link" href="/prints/?tab=product">去看看可选购商品 ↗</a></div>'}</aside></div>`;
    const viewer=container.querySelector<any>('[data-viewer]');
    const stageImage=container.querySelector<HTMLImageElement>('[data-stage-image]')!;
    const loading=container.querySelector<HTMLElement>('[data-viewer-loading]');
    const failed=container.querySelector<HTMLElement>('[data-viewer-failed]');
    let viewerReady=false;let viewerFailed=false;
    const paint=()=>{if(product&&viewer?.model&&color) for(const material of viewer.model.materials){const pbr=material.pbrMetallicRoughness;pbr.baseColorTexture?.setTexture(null);pbr.setBaseColorFactor(color.hex);}};
    const viewerError=()=>{if(signal.aborted)return;viewerFailed=true;if(loading)loading.hidden=true;if(failed)failed.hidden=false;};
    const selectView=(model: boolean)=>{if(viewer)viewer.hidden=!model;stageImage.hidden=model&&!!viewer;container.querySelectorAll<HTMLElement>('[data-view]').forEach(n=>n.classList.toggle('is-active',n.dataset.view===(model?'model':'photo')));if(loading)loading.hidden=!model||viewerReady||viewerFailed;if(failed)failed.hidden=!model||!viewerFailed;};
    container.querySelectorAll<HTMLElement>('[data-view]').forEach(n=>n.addEventListener('click',()=>selectView(n.dataset.view==='model'),{signal}));
    container.querySelectorAll<HTMLElement>('[data-thumbnail]').forEach(n=>n.addEventListener('click',()=>{stageImage.src=entry.images[Number(n.dataset.thumbnail)].url!;selectView(false);},{signal}));
    if(viewer){
      viewer.addEventListener('load',()=>{if(signal.aborted)return;viewerReady=true;viewerFailed=false;loading!.hidden=true;failed!.hidden=true;paint();},{signal});
      viewer.addEventListener('error',viewerError,{signal});
      container.querySelector('[data-reset-view]')!.addEventListener('click',()=>{selectView(true);viewer.cameraOrbit='30deg 75deg auto';viewer.cameraTarget='auto auto auto';viewer.fieldOfView='auto';viewer.jumpCameraToGoal?.();},{signal});
      container.querySelector('[data-retry-viewer]')!.addEventListener('click',()=>{viewerFailed=false;failed!.hidden=true;loading!.hidden=false;loadViewer().then(()=>{if(!signal.aborted)viewer.src=entry.model!.url+'?retry='+Date.now();}).catch(viewerError);},{signal});
      selectView(true);loadViewer().catch(viewerError);
    }
    if(!product)return;
    const number=container.querySelector<HTMLInputElement>('[data-infill-number]')!;
    const range=container.querySelector<HTMLInputElement>('[data-infill-range]')!;
    const contact=container.querySelector<HTMLButtonElement>('[data-contact]')!;
    const update=()=>{
      const raw=number.value;const value=Number(raw);
      const valid=raw.trim()!==''&&Number.isInteger(value)&&value>=15&&value<=100;
      contact.disabled=!valid||!color;
      number.setAttribute('aria-invalid',String(!valid));
      setStatus(container.querySelector('[data-infill-error]'),valid?'':'请输入 15～100 的整数百分比',!valid);
      const displayPrice=valid?money(quote(entry.min_price,entry.max_price,value)):'—';
      container.querySelector<HTMLElement>('[data-price]')!.textContent=displayPrice;
      container.querySelector<HTMLElement>('[data-mobile-price]')!.textContent=displayPrice;
      if(!valid)return;
      infill=value;range.value=String(infill);range.style.setProperty('--fill',`${(infill-15)/85*100}%`);
      container.querySelector<HTMLElement>('[data-color-name]')!.textContent=color?.name||'暂无可用颜色';
      container.querySelectorAll<HTMLElement>('[data-color-id]').forEach(n=>n.setAttribute('aria-pressed',String(n.dataset.colorId===color?.id)));
      container.querySelector<HTMLElement>('[data-selection-summary]')!.textContent=`${color?.name||'待选颜色'} / ${infill}% 填充 / 1 件`;
      const current=new URLSearchParams(location.search);current.set('color',color?.id||'');current.set('infill',String(infill));replaceQuery(current);paint();
    };
    number.addEventListener('input',update,{signal});
    range.addEventListener('input',()=>{number.value=range.value;update();},{signal});
    container.querySelectorAll<HTMLElement>('[data-color-id]').forEach(n=>n.addEventListener('click',()=>{color=entry.colors.find(c=>c.id===n.dataset.colorId);update();},{signal}));
    update();
    const dialog=root.querySelector<HTMLDialogElement>('[data-contact-dialog]')!;
    const text=root.querySelector<HTMLTextAreaElement>('[data-contact-text]')!;
    const feedback=root.querySelector<HTMLElement>('[data-copy-feedback]')!;
    root.querySelector('[data-close-dialog]')!.addEventListener('click',()=>dialog.close(),{signal});
    dialog.addEventListener('click',event=>{if(event.target===dialog){const r=dialog.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();}},{signal});
    root.querySelector('[data-copy-again]')!.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(text.value);if(!signal.aborted)setStatus(feedback,'清单已复制，可以粘贴到 QQ。');}catch{if(signal.aborted)return;text.focus();text.select();setStatus(feedback,'自动复制未成功，已选中清单，请手动复制。');}},{signal});
    contact.addEventListener('click',async()=>{
      contact.disabled=true;
      const controls=[number,range,...Array.from(container.querySelectorAll<HTMLButtonElement>('[data-color-id]'))];
      controls.forEach(control=>control.disabled=true);
      try{
        const [q,settings]=await Promise.all([api<{entry:Entry;color:Color;infill:number;price:number}>(`/api/quote?id=${encodeURIComponent(id)}&color=${encodeURIComponent(color!.id)}&infill=${infill}`,signal),api<Settings>('/api/settings',signal)]);
        if(signal.aborted)return;
        const changed=entry.revision!==q.entry.revision;entry=q.entry;color=q.color;update();
        const link=new URL('/prints/detail/',location.origin);link.searchParams.set('id',entry.id!);link.searchParams.set('color',color.id);link.searchParams.set('infill',String(infill));
        const local = root.dataset.workshopSource === 'local';
        text.value=`雨泽小鱼的工坊｜${entry.is_demo?'演示选购清单':'选购清单'}\n商品：${entry.name}\n编号：${entry.id}\n颜色：${color.name}\n填充比例：${infill}%\n数量：1\n${entry.is_demo?'示例报价':'报价'}：¥${q.price}\n${local?'本地预览地址':'商品地址'}：${link.href}\n${entry.is_demo?'演示内容，不用于实际交易。':'页面报价，最终以 QQ 确认为准。'}\n${local?'此地址仅供本机预览，':''}复制清单不代表已提交订单。`;
        root.querySelector<HTMLElement>('[data-contact-qr]')!.innerHTML=settings.qq_image?`<img class="wk-contact-qr" src="${e(settings.qq_image.url)}" alt="店主 QQ 联系二维码"><a class="wk-text-link" href="${e(settings.qq_image.url)}" download="工坊-QQ二维码">保存 QQ 二维码 ↓</a>`:'<p class="wk-qr-empty">店主还没有设置 QQ 二维码。清单可以先复制保存。</p>';
        setStatus(feedback,changed?'商品信息已更新，清单已使用最新报价。':'');dialog.showModal();
      }catch(error){if(!abortError(error))setStatus(container.querySelector('[data-infill-error]'),(error as Error).message,true);}
      finally{if(!signal.aborted){controls.forEach(control=>control.disabled=false);contact.disabled=number.getAttribute('aria-invalid')==='true'||!color;}}
    },{signal});
  }catch(error){if(!abortError(error))container.innerHTML=empty('暂时找不到这件作品',`<p>${e((error as Error).message)}</p><a class="wk-button wk-secondary" href="/prints/">返回工坊</a>`);}
}

function destroy(){controller?.abort();cleanup?.();cleanup=null;currentRoot?.querySelectorAll<any>('model-viewer').forEach(v=>{v.pause?.();v.removeAttribute('src');v.remove();});currentRoot?.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach(d=>d.close());controller=null;currentRoot=null;}
function init(){const root=document.querySelector<HTMLElement>('[data-workshop]');if(root===currentRoot)return;destroy();if(!root)return;currentRoot=root;controller=new AbortController();const signal=controller.signal;if(root.dataset.workshop==='catalog')void catalog(root,signal);else if(root.dataset.workshop==='detail')void detail(root,signal);else cleanup=initAdmin(root,signal);}
w.WorkshopApp={init,destroy};
