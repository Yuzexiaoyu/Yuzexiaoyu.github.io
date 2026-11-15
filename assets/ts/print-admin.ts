import {api, abortError, escapeHTML as e, quote, weightAt, grams, money, setStatus, Entry, Color, Asset} from './workshop-shared';

export function initAdmin(root: HTMLElement, signal: AbortSignal): ()=>void {
  let token='';let entries:Entry[]=[];let colors:Color[]=[];
  let editing:Entry|null=null;let dirty=false;let pending=0;let saving=false;let editorSerial=0;
  const dialog=root.querySelector<HTMLDialogElement>('[data-entry-editor]')!;
  const form=root.querySelector<HTMLFormElement>('[data-entry-form]')!;
  const notice=root.querySelector<HTMLElement>('[data-admin-notice]')!;
  const editorNotice=root.querySelector<HTMLElement>('[data-editor-notice]')!;
  const pageSize=6;
  const pages={images:0,videos:0,colors:0};
  const closeIcon='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  const getField=(name:string)=>form.elements.namedItem(name) as HTMLInputElement;
  const blank=():Entry=>({name:'',description:'',material:'',kind:'work',status:'draft',min_price:0,max_price:0,fixed_price:null,weight_g:null,min_weight_g:null,max_weight_g:null,color_ids:[],image_ids:[],video_ids:[],model_id:null,source_id:null,images:[],videos:[],model:null,source:null,colors:[],is_demo:false});
  const statuses={draft:'草稿',published:'已上架',archived:'已下架'};
  const write=<T>(path:string,method:string,data:unknown)=>api<T>(path,signal,{method,headers:{'Content-Type':'application/json','X-Workshop-Token':token},body:JSON.stringify(data)});
  const upload=(file:File)=>api<Asset>('/api/admin/assets',signal,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Filename':encodeURIComponent(file.name),'X-Workshop-Token':token},body:file});
  function renderList(){
    const query=root.querySelector<HTMLInputElement>('[data-admin-search]')!.value.trim().toLowerCase();
    const status=root.querySelector<HTMLSelectElement>('[data-admin-filter]')!.value;
    const selected=entries.filter(p=>p.name.toLowerCase().includes(query)&&(status==='all'||p.status===status));
    root.querySelector<HTMLElement>('[data-admin-list]')!.innerHTML=selected.length?`<div class="wk-table-head"><span>作品 / 商品</span><span>栏目</span><span>报价</span><span>状态</span><span>操作</span></div>`+selected.map(p=>`<div class="wk-admin-row"><div class="wk-admin-title">${p.images[0]?`<img src="${e(p.images[0].url)}" alt="">`:'<span class="wk-admin-no-image">◇</span>'}<div><strong>${e(p.name)}</strong><small>${p.is_demo?'演示内容 · ':''}${p.model?'3D 预览已就绪':p.source?'3MF 已保存 · 待补 GLB':'图片内容'}</small></div></div><span class="wk-row-kind">${p.kind==='work'?'可选':'现货'}</span><span class="wk-row-price">${p.kind==='work'?`${money(p.min_price)}–${money(p.max_price)}`:money(p.fixed_price??0)}</span><span class="wk-state is-${p.status}">${statuses[p.status]}</span><div class="wk-row-actions"><button type="button" data-edit="${e(p.id)}">编辑</button><button type="button" data-toggle-entry="${e(p.id)}">${p.status==='published'?'下架':'上架'}</button><button type="button" data-delete-entry="${e(p.id)}" class="wk-danger">删除</button></div></div>`).join(''):'<div class="wk-empty"><span class="wk-empty-mark">◇</span><h2>给新的想法留个位置</h2><p>点击“新建内容”，添加一件作品或商品。</p></div>';
  }
  function renderColors(){
    root.querySelector<HTMLElement>('[data-color-list]')!.innerHTML=colors.length?colors.map(c=>`<form data-edit-color="${e(c.id)}" class="wk-color-card"><input type="color" name="hex" value="${e(c.hex)}" aria-label="${e(c.name)}的颜色"><input name="name" value="${e(c.name)}" required maxlength="30" aria-label="颜色名称"><label class="wk-field wk-color-material">材质<input name="material" value="${e(c.material)}" maxlength="80" placeholder="如 PLA、PETG"></label><label class="wk-check"><input name="active" type="checkbox" ${c.active?'checked':''}>启用</label><button type="submit" class="wk-button wk-secondary">保存</button></form>`).join(''):'<p class="wk-empty">还没有色卡，先添加几种实际可提供的颜色。</p>';
  }
  async function refresh(){
    const [catalog,palette]=await Promise.all([api<{entries:Entry[]}>('/api/admin/entries',signal),api<Color[]>('/api/admin/colors',signal)]);
    if(signal.aborted)return;entries=catalog.entries;colors=palette;renderList();renderColors();
  }
  function markDirty(){dirty=true;}
  function updateSaveButton(){const button=form.querySelector<HTMLButtonElement>('[data-save-entry]')!;button.disabled=pending>0||saving;button.textContent=saving?'正在保存…':pending?'素材上传中…':'保存内容';}
  function paginate(role:keyof typeof pages,total:number){
    const count=Math.max(1,Math.ceil(total/pageSize));pages[role]=Math.max(0,Math.min(pages[role],count-1));
    const pager=root.querySelector<HTMLElement>(`[data-${role}-pager]`)!;
    pager.hidden=count===1;
    pager.querySelector('output')!.textContent=`${pages[role]+1} / ${count}`;
    pager.querySelector<HTMLButtonElement>('[data-page-step="-1"]')!.disabled=pages[role]===0;
    pager.querySelector<HTMLButtonElement>('[data-page-step="1"]')!.disabled=pages[role]===count-1;
    return pages[role]*pageSize;
  }
  function renderAssets(){
    if(!editing)return;
    const imageStart=paginate('images',editing.images.length),videoStart=paginate('videos',editing.videos.length);
    root.querySelector<HTMLElement>('[data-editor-images]')!.innerHTML=editing.images.slice(imageStart,imageStart+pageSize).map((a,index)=>{const i=imageStart+index;return `<div><img src="${e(a.url)}" alt="${e(a.name)}"><span>${i===0?'封面':i+1}</span><button type="button" data-image-remove="${i}" aria-label="移除图片 ${i+1}">${closeIcon}</button>${i>0?`<button type="button" data-image-cover="${i}" class="wk-set-cover">设为封面</button>`:''}</div>`;}).join('')||'<p class="wk-editor-empty">还没有图片</p>';
    root.querySelector<HTMLElement>('[data-editor-videos]')!.innerHTML=editing.videos.slice(videoStart,videoStart+pageSize).map((a,index)=>{const i=videoStart+index;return `<div><video src="${e(a.url)}" preload="metadata" muted playsinline aria-label="${e(a.name)}"></video><span>视频 ${i+1}</span><button type="button" data-video-remove="${i}" aria-label="移除视频 ${i+1}">${closeIcon}</button></div>`;}).join('')||'<p class="wk-editor-empty">还没有视频</p>';
    root.querySelector<HTMLElement>('[data-model-name]')!.textContent=editing.model?.name||'尚未添加 GLB';
    root.querySelector<HTMLElement>('[data-source-name]')!.textContent=editing.source?`${editing.source.name} · 原件已保存，未执行转换`:'尚未保存 3MF';
    root.querySelectorAll<HTMLElement>('[data-model-name],[data-source-name]').forEach(name=>name.title=name.textContent||'');
  }
  function renderEditorColors(){const available=colors.filter(c=>c.active),start=paginate('colors',available.length);root.querySelector<HTMLElement>('[data-editor-colors]')!.innerHTML=available.slice(start,start+pageSize).map(c=>`<label class="wk-color-choice" title="${e(c.name)}${c.material?` · ${e(c.material)}`:''}"><input type="checkbox" data-editor-color="${e(c.id)}" ${editing?.color_ids.includes(c.id)?'checked':''}><span style="background:${e(c.hex)}"></span><span class="wk-color-choice-name">${e(c.name)}${c.material?` · ${e(c.material)}`:''}</span></label>`).join('')||'<p class="wk-muted">还没有公共色卡，请先保存草稿，再到“公共色卡”添加。</p>';}
  dialog.addEventListener('click',event=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('[data-page-role]');if(!button)return;
    const role=button.dataset.pageRole as keyof typeof pages;pages[role]+=Number(button.dataset.pageStep);
    if(role==='colors')renderEditorColors();else renderAssets();
  },{signal});
  root.querySelector('[data-editor-colors]')!.addEventListener('change',event=>{
    const input=event.target as HTMLInputElement;if(!editing||!input.matches('[data-editor-color]'))return;
    const selected=new Set(editing.color_ids);if(input.checked)selected.add(input.dataset.editorColor!);else selected.delete(input.dataset.editorColor!);editing.color_ids=[...selected];
  },{signal});
  function editorType(){
    const configurable=getField('kind').value==='work';
    const options=root.querySelector<HTMLFieldSetElement>('[data-configurable-fields]')!;
    const stock=root.querySelector<HTMLFieldSetElement>('[data-stock-fields]')!;
    options.hidden=!configurable;options.disabled=!configurable;
    stock.hidden=configurable;stock.disabled=configurable;
    stock.querySelectorAll<HTMLInputElement>('input[name=fixed_price],input[name=weight_g]').forEach(input=>input.required=!configurable&&getField('status').value==='published');
  }
  function samplePrice(){
    const low=Number(getField('min_price').value),high=Number(getField('max_price').value);
    root.querySelector<HTMLElement>('[data-price-example]')!.textContent=Number.isInteger(low)&&Number.isInteger(high)&&high>=low&&low>=0?`50% 填充：${money(quote(low,high,50))}`:'最高价应不低于最低价，请填写非负整数元。';
    const rawLow=getField('min_weight_g').value,rawHigh=getField('max_weight_g').value;
    const light=Number(rawLow),solid=Number(rawHigh);
    root.querySelector<HTMLElement>('[data-weight-example]')!.textContent=rawLow===''&&rawHigh===''?'':rawLow!==''&&rawHigh!==''&&light>0&&solid>=light?`50% 填充重量 ${grams(weightAt(light,solid,50))}。`:'请填写两端重量，100% 重量应不低于 15% 重量。';
  }
  function openEditor(entry?:Entry){
    editing=entry?JSON.parse(JSON.stringify(entry)):blank();editorSerial++;dirty=false;saving=false;
    pages.images=pages.videos=pages.colors=0;
    if(editing){editing.video_ids=editing.video_ids||[];editing.videos=editing.videos||[];}
    form.reset();for(const name of ['name','kind','status','description','material','min_price','max_price','fixed_price','weight_g','min_weight_g','max_weight_g'])getField(name).value=String((editing as any)[name]??'');
    getField('is_demo').checked=editing!.is_demo;
    root.querySelector<HTMLElement>('#entry-editor-title')!.textContent=entry?'编辑内容':'新建内容';
    setStatus(editorNotice,'');renderAssets();renderEditorColors();editorType();samplePrice();updateSaveButton();dialog.showModal();
  }
  function closeEditor(){if(pending||saving){setStatus(editorNotice,'请等待上传或保存完成。');return;}if(dirty&&!window.confirm('尚有未保存的修改，确定关闭编辑器？'))return;dirty=false;editing=null;editorSerial++;dialog.close();}
  root.querySelectorAll<HTMLElement>('[data-editor-close]').forEach(n=>n.addEventListener('click',closeEditor,{signal}));
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeEditor();},{signal});
  root.querySelector('[data-new-entry]')!.addEventListener('click',()=>{if(token)openEditor();},{signal});
  form.addEventListener('input',()=>{markDirty();editorType();samplePrice();},{signal});
  form.addEventListener('change',markDirty,{signal});
  const beforeUnload=(event:BeforeUnloadEvent)=>{if(dirty||pending||saving){event.preventDefault();event.returnValue='';}};
  window.addEventListener('beforeunload',beforeUnload);
  root.querySelectorAll<HTMLElement>('[data-admin-tab]').forEach(n=>n.addEventListener('click',()=>{root.querySelectorAll<HTMLElement>('[data-admin-tab]').forEach(b=>b.classList.toggle('is-active',b===n));root.querySelectorAll<HTMLElement>('[data-admin-panel]').forEach(panel=>panel.hidden=panel.dataset.adminPanel!==n.dataset.adminTab);setStatus(notice,'');},{signal}));
  root.querySelector('[data-admin-search]')!.addEventListener('input',renderList,{signal});
  root.querySelector('[data-admin-filter]')!.addEventListener('change',renderList,{signal});
  root.querySelector('[data-admin-list]')!.addEventListener('click',async event=>{
    const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button)return;
    const id=button.dataset.edit||button.dataset.toggleEntry||button.dataset.deleteEntry;
    const entry=entries.find(p=>p.id===id);if(!entry)return;
    if(button.dataset.edit){openEditor(entry);return;}
    if(button.dataset.deleteEntry&&!window.confirm(`删除“${entry.name}”？内容将从工坊移除，已上传文件保留在本机。`))return;
    button.disabled=true;setStatus(notice,'');
    try{if(button.dataset.deleteEntry)await write(`/api/admin/entries/${entry.id}`,'DELETE',{revision:entry.revision});else await write(`/api/admin/entries/${entry.id}`,'PUT',{...entry,status:entry.status==='published'?'archived':'published'});await refresh();setStatus(notice,button.dataset.deleteEntry?'内容已删除。':'展示状态已更新。');}catch(error){if(!abortError(error))setStatus(notice,(error as Error).message,true);}finally{button.disabled=false;}
  },{signal});
  async function handleUpload(input:HTMLInputElement,role:'images'|'videos'|'model'|'source'){
    const files=Array.from(input.files||[]);input.value='';if(!editing||!files.length)return;
    if(role==='images'&&editing.images.length+files.length>12){setStatus(editorNotice,'每条内容最多 12 张图片。',true);return;}
    if(role==='videos'&&editing.videos.length+files.length>6){setStatus(editorNotice,'每条内容最多 6 个视频。',true);return;}
    const serial=editorSerial;pending++;updateSaveButton();setStatus(editorNotice,'正在保存素材…');
    try{for(const file of files){const asset=await upload(file);if(signal.aborted||serial!==editorSerial||!editing)return;
      if(role==='images'){if(asset.kind!=='image')throw new Error('请选择图片');if(!editing.image_ids.includes(asset.id)){editing.images.push(asset);editing.image_ids.push(asset.id);}}
      else if(role==='videos'){if(asset.kind!=='video')throw new Error('请选择 MP4、WebM 或 MOV 视频');if(!editing.video_ids.includes(asset.id)){editing.videos.push(asset);editing.video_ids.push(asset.id);}}
      else if(role==='model'){if(asset.kind!=='model')throw new Error('请选择 GLB 预览文件');editing.model=asset;editing.model_id=asset.id;}
      else{if(asset.kind!=='source')throw new Error('请选择 3MF 原件');editing.source=asset;editing.source_id=asset.id;}
      markDirty();renderAssets();
    }setStatus(editorNotice,role==='source'?'3MF 原件已保存。请另传 GLB 预览模型，再保存内容。':'素材上传完成，点击“保存内容”写入这条内容。发布网站时将自动同步到 R2 CDN。');}
    catch(error){if(!abortError(error))setStatus(editorNotice,(error as Error).message,true);}
    finally{pending--;updateSaveButton();}
  }
  for(const [selector,role] of [['[data-image-upload]','images'],['[data-video-upload]','videos'],['[data-model-upload]','model'],['[data-source-upload]','source']] as const){const input=root.querySelector<HTMLInputElement>(selector)!;input.addEventListener('change',()=>void handleUpload(input,role),{signal});}
  root.querySelector('[data-editor-images]')!.addEventListener('click',event=>{if(!editing)return;const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button)return;if(button.dataset.imageRemove!==undefined)editing.images.splice(Number(button.dataset.imageRemove),1);if(button.dataset.imageCover!==undefined){const item=editing.images.splice(Number(button.dataset.imageCover),1)[0];editing.images.unshift(item);pages.images=0;}editing.image_ids=editing.images.map(a=>a.id);markDirty();renderAssets();},{signal});
  root.querySelector('[data-editor-videos]')!.addEventListener('click',event=>{if(!editing)return;const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button||button.dataset.videoRemove===undefined)return;editing.videos.splice(Number(button.dataset.videoRemove),1);editing.video_ids=editing.videos.map(a=>a.id);markDirty();renderAssets();},{signal});
  root.querySelector('[data-remove-model]')!.addEventListener('click',()=>{if(editing){editing.model=null;editing.model_id=null;markDirty();renderAssets();}},{signal});
  root.querySelector('[data-remove-source]')!.addEventListener('click',()=>{if(editing){editing.source=null;editing.source_id=null;markDirty();renderAssets();}},{signal});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!editing||pending||saving)return;
    const data={...editing,name:getField('name').value,description:getField('description').value,material:getField('material').value.trim(),kind:getField('kind').value,status:getField('status').value,min_price:Number(getField('min_price').value),max_price:Number(getField('max_price').value),fixed_price:getField('fixed_price').value.trim()===''?null:Number(getField('fixed_price').value),weight_g:getField('weight_g').value.trim()===''?null:Number(getField('weight_g').value),min_weight_g:getField('min_weight_g').value.trim()===''?null:Number(getField('min_weight_g').value),max_weight_g:getField('max_weight_g').value.trim()===''?null:Number(getField('max_weight_g').value),is_demo:getField('is_demo').checked,color_ids:editing.color_ids.filter(id=>colors.some(color=>color.id===id&&color.active))};
    if(data.kind==='product'){data.color_ids=[];data.min_price=0;data.max_price=0;data.min_weight_g=null;data.max_weight_g=null;}else{data.fixed_price=null;data.weight_g=null;data.material='';}
    saving=true;updateSaveButton();setStatus(editorNotice,'正在保存…');
    try{const saved=await write<Entry>(editing.id?`/api/admin/entries/${editing.id}`:'/api/admin/entries',editing.id?'PUT':'POST',data);if(signal.aborted)return;editing=saved;dirty=false;dialog.close();await refresh();setStatus(notice,`“${saved.name}”已保存到本机${saved.status==='published'?'，本地工坊中可见':''}。发布网站后，图片与视频将通过 R2 CDN 加载。`);}
    catch(error){if(!abortError(error))setStatus(editorNotice,(error as Error).message,true);}
    finally{saving=false;updateSaveButton();}
  },{signal});
  root.querySelector('[data-color-form]')!.addEventListener('submit',async event=>{
    event.preventDefault();const f=event.currentTarget as HTMLFormElement;const button=f.querySelector<HTMLButtonElement>('button')!;button.disabled=true;
    try{const data=new FormData(f);await write('/api/admin/colors','POST',{name:data.get('name'),hex:data.get('hex'),material:data.get('material'),active:true});f.reset();await refresh();setStatus(notice,'色卡已添加，可在可选条目编辑器中勾选。');}catch(error){if(!abortError(error))setStatus(notice,(error as Error).message,true);}finally{button.disabled=false;}
  },{signal});
  root.querySelector('[data-color-list]')!.addEventListener('submit',async event=>{
    event.preventDefault();const f=event.target as HTMLFormElement;if(!f.matches('[data-edit-color]'))return;const button=f.querySelector<HTMLButtonElement>('button')!;button.disabled=true;
    try{const data=new FormData(f);await write(`/api/admin/colors/${f.dataset.editColor}`,'PUT',{name:data.get('name'),hex:data.get('hex'),material:data.get('material'),active:data.get('active')==='on'});await refresh();setStatus(notice,'色卡已更新。');}catch(error){if(!abortError(error))setStatus(notice,(error as Error).message,true);}finally{button.disabled=false;}
  },{signal});
  void(async()=>{try{const session=await api<{token:string}>('/api/admin/session',signal);token=session.token;await refresh();}catch(error){if(!abortError(error))setStatus(notice,(error as Error).message,true);}})();
  return ()=>{window.removeEventListener('beforeunload',beforeUnload);};
}
