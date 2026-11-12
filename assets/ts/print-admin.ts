import {api, abortError, escapeHTML as e, quote, money, setStatus, Entry, Color, Asset, Settings} from './workshop-shared';

export function initAdmin(root: HTMLElement, signal: AbortSignal): ()=>void {
  let token='';let entries:Entry[]=[];let colors:Color[]=[];let settings:Settings;
  let editing:Entry|null=null;let dirty=false;let pending=0;let saving=false;let editorSerial=0;
  const dialog=root.querySelector<HTMLDialogElement>('[data-entry-editor]')!;
  const form=root.querySelector<HTMLFormElement>('[data-entry-form]')!;
  const notice=root.querySelector<HTMLElement>('[data-admin-notice]')!;
  const editorNotice=root.querySelector<HTMLElement>('[data-editor-notice]')!;
  const getField=(name:string)=>form.elements.namedItem(name) as HTMLInputElement;
  const blank=():Entry=>({name:'',description:'',kind:'work',status:'draft',min_price:0,max_price:0,color_ids:[],image_ids:[],model_id:null,source_id:null,images:[],model:null,source:null,colors:[],is_demo:false});
  const statuses={draft:'草稿',published:'已上架',archived:'已下架'};
  const write=<T>(path:string,method:string,data:unknown)=>api<T>(path,signal,{method,headers:{'Content-Type':'application/json','X-Workshop-Token':token},body:JSON.stringify(data)});
  const upload=(file:File)=>api<Asset>('/api/admin/assets',signal,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Filename':encodeURIComponent(file.name),'X-Workshop-Token':token},body:file});
  function renderList(){
    const query=root.querySelector<HTMLInputElement>('[data-admin-search]')!.value.trim().toLowerCase();
    const status=root.querySelector<HTMLSelectElement>('[data-admin-filter]')!.value;
    const selected=entries.filter(p=>p.name.toLowerCase().includes(query)&&(status==='all'||p.status===status));
    root.querySelector<HTMLElement>('[data-admin-stats]')!.innerHTML=[['工坊内容',entries.length],['已上架',entries.filter(p=>p.status==='published').length],['草稿',entries.filter(p=>p.status==='draft').length],['可用颜色',colors.filter(c=>c.active).length]].map(([label,value])=>`<div><span>${label}</span><strong>${String(value).padStart(2,'0')}</strong></div>`).join('');
    root.querySelector<HTMLElement>('[data-admin-list]')!.innerHTML=selected.length?`<div class="wk-table-head"><span>作品 / 商品</span><span>栏目</span><span>报价</span><span>状态</span><span>操作</span></div>`+selected.map(p=>`<div class="wk-admin-row"><div class="wk-admin-title">${p.images[0]?`<img src="${e(p.images[0].url)}" alt="">`:'<span class="wk-admin-no-image">◇</span>'}<div><strong>${e(p.name)}</strong><small>${p.is_demo?'演示内容 · ':''}${p.model?'3D 预览已就绪':p.source?'3MF 已保存 · 待补 GLB':'图片内容'}</small></div></div><span class="wk-row-kind">${p.kind==='work'?'作品展示':'可选购商品'}</span><span class="wk-row-price">${p.kind==='product'?`${money(p.min_price)}–${money(p.max_price)}`:'—'}</span><span class="wk-state is-${p.status}">${statuses[p.status]}</span><div class="wk-row-actions"><button type="button" data-edit="${e(p.id)}">编辑</button><button type="button" data-toggle-entry="${e(p.id)}">${p.status==='published'?'下架':'上架'}</button><button type="button" data-delete-entry="${e(p.id)}" class="wk-danger">删除</button></div></div>`).join(''):'<div class="wk-empty"><span class="wk-empty-mark">◇</span><h2>给新的想法留个位置</h2><p>点击“新建内容”，添加一件作品或商品。</p></div>';
  }
  function renderColors(){
    root.querySelector<HTMLElement>('[data-color-list]')!.innerHTML=colors.length?colors.map(c=>`<form data-edit-color="${e(c.id)}" class="wk-color-card"><input type="color" name="hex" value="${e(c.hex)}" aria-label="${e(c.name)}的颜色"><input name="name" value="${e(c.name)}" required maxlength="30" aria-label="颜色名称"><label class="wk-check"><input name="active" type="checkbox" ${c.active?'checked':''}>启用</label><button type="submit" class="wk-button wk-secondary">保存</button></form>`).join(''):'<p class="wk-empty">还没有色卡，先添加几种实际可提供的颜色。</p>';
  }
  function renderQQ(){root.querySelector<HTMLElement>('[data-qq-preview]')!.innerHTML=settings.qq_image?`<img src="${e(settings.qq_image.url)}" alt="当前 QQ 二维码">`:'<div class="wk-qr-placeholder"><span>▦</span><p>还没有联系二维码</p></div>';}
  async function refresh(){
    const [catalog,palette,config]=await Promise.all([api<{entries:Entry[]}>('/api/admin/entries',signal),api<Color[]>('/api/admin/colors',signal),api<Settings>('/api/admin/settings',signal)]);
    if(signal.aborted)return;entries=catalog.entries;colors=palette;settings=config;renderList();renderColors();renderQQ();
  }
  function markDirty(){dirty=true;}
  function updateSaveButton(){const button=form.querySelector<HTMLButtonElement>('[data-save-entry]')!;button.disabled=pending>0||saving;button.textContent=saving?'正在保存…':pending?'素材上传中…':'保存内容';}
  function renderAssets(){
    if(!editing)return;
    root.querySelector<HTMLElement>('[data-editor-images]')!.innerHTML=editing.images.map((a,i)=>`<div><img src="${e(a.url)}" alt="${e(a.name)}"><span>${i===0?'封面':i+1}</span><button type="button" data-image-remove="${i}" aria-label="移除图片 ${i+1}">×</button>${i>0?`<button type="button" data-image-cover="${i}" class="wk-set-cover">设为封面</button>`:''}</div>`).join('');
    root.querySelector<HTMLElement>('[data-model-name]')!.textContent=editing.model?.name||'尚未添加 GLB';
    root.querySelector<HTMLElement>('[data-source-name]')!.textContent=editing.source?`${editing.source.name} · 原件已保存，未执行转换`:'尚未保存 3MF';
  }
  function renderEditorColors(){root.querySelector<HTMLElement>('[data-editor-colors]')!.innerHTML=colors.filter(c=>c.active).map(c=>`<label class="wk-color-choice"><input type="checkbox" data-product-color="${e(c.id)}" ${editing?.color_ids.includes(c.id)?'checked':''}><span style="background:${e(c.hex)}"></span>${e(c.name)}</label>`).join('')||'<p class="wk-muted">还没有公共色卡，请先保存草稿，再到“公共色卡”添加。</p>';}
  function editorType(){const product=getField('kind').value==='product';const fields=root.querySelector<HTMLFieldSetElement>('[data-product-fields]')!;fields.hidden=!product;fields.disabled=!product;}
  function samplePrice(){const low=Number(getField('min_price').value),high=Number(getField('max_price').value);root.querySelector<HTMLElement>('[data-price-example]')!.textContent=Number.isInteger(low)&&Number.isInteger(high)&&high>=low&&low>=0?`50% 填充显示 ${money(quote(low,high,50))}，顾客可按 1% 调整。`:'最高价应不低于最低价，请填写非负整数元。';}
  function openEditor(entry?:Entry){
    editing=entry?JSON.parse(JSON.stringify(entry)):blank();editorSerial++;dirty=false;saving=false;
    form.reset();for(const name of ['name','kind','status','description','min_price','max_price'])getField(name).value=String((editing as any)[name]);
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
  async function handleUpload(input:HTMLInputElement,role:'images'|'model'|'source'){
    const files=Array.from(input.files||[]);input.value='';if(!editing||!files.length)return;
    if(role==='images'&&editing.images.length+files.length>12){setStatus(editorNotice,'每条内容最多 12 张图片。',true);return;}
    const serial=editorSerial;pending++;updateSaveButton();setStatus(editorNotice,'正在保存素材…');
    try{for(const file of files){const asset=await upload(file);if(signal.aborted||serial!==editorSerial||!editing)return;
      if(role==='images'){if(asset.kind!=='image')throw new Error('请选择图片');if(!editing.image_ids.includes(asset.id)){editing.images.push(asset);editing.image_ids.push(asset.id);}}
      else if(role==='model'){if(asset.kind!=='model')throw new Error('请选择 GLB 预览文件');editing.model=asset;editing.model_id=asset.id;}
      else{if(asset.kind!=='source')throw new Error('请选择 3MF 原件');editing.source=asset;editing.source_id=asset.id;}
      markDirty();renderAssets();
    }setStatus(editorNotice,role==='source'?'3MF 原件已保存。请另传 GLB 预览模型，再保存内容。':'素材上传完成，点击“保存内容”写入这条内容。');}
    catch(error){if(!abortError(error))setStatus(editorNotice,(error as Error).message,true);}
    finally{pending--;updateSaveButton();}
  }
  for(const [selector,role] of [['[data-image-upload]','images'],['[data-model-upload]','model'],['[data-source-upload]','source']] as const){const input=root.querySelector<HTMLInputElement>(selector)!;input.addEventListener('change',()=>void handleUpload(input,role),{signal});}
  root.querySelector('[data-editor-images]')!.addEventListener('click',event=>{if(!editing)return;const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button)return;if(button.dataset.imageRemove!==undefined)editing.images.splice(Number(button.dataset.imageRemove),1);if(button.dataset.imageCover!==undefined){const item=editing.images.splice(Number(button.dataset.imageCover),1)[0];editing.images.unshift(item);}editing.image_ids=editing.images.map(a=>a.id);markDirty();renderAssets();},{signal});
  root.querySelector('[data-remove-model]')!.addEventListener('click',()=>{if(editing){editing.model=null;editing.model_id=null;markDirty();renderAssets();}},{signal});
  root.querySelector('[data-remove-source]')!.addEventListener('click',()=>{if(editing){editing.source=null;editing.source_id=null;markDirty();renderAssets();}},{signal});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!editing||pending||saving)return;
    const data={...editing,name:getField('name').value,description:getField('description').value,kind:getField('kind').value,status:getField('status').value,min_price:Number(getField('min_price').value),max_price:Number(getField('max_price').value),is_demo:getField('is_demo').checked,color_ids:Array.from(root.querySelectorAll<HTMLInputElement>('[data-product-color]:checked')).map(n=>n.dataset.productColor!)};
    if(data.kind==='work'){data.color_ids=[];data.min_price=0;data.max_price=0;}
    saving=true;updateSaveButton();setStatus(editorNotice,'正在保存…');
    try{const saved=await write<Entry>(editing.id?`/api/admin/entries/${editing.id}`:'/api/admin/entries',editing.id?'PUT':'POST',data);if(signal.aborted)return;editing=saved;dirty=false;dialog.close();await refresh();setStatus(notice,`“${saved.name}”已保存到本机${saved.status==='published'?'，工坊中可见':''}。`);}
    catch(error){if(!abortError(error))setStatus(editorNotice,(error as Error).message,true);}
    finally{saving=false;updateSaveButton();}
  },{signal});
  root.querySelector('[data-color-form]')!.addEventListener('submit',async event=>{
    event.preventDefault();const f=event.currentTarget as HTMLFormElement;const button=f.querySelector<HTMLButtonElement>('button')!;button.disabled=true;
    try{const data=new FormData(f);await write('/api/admin/colors','POST',{name:data.get('name'),hex:data.get('hex'),active:true});f.reset();await refresh();setStatus(notice,'色卡已添加，可在商品编辑器中勾选。');}catch(error){if(!abortError(error))setStatus(notice,(error as Error).message,true);}finally{button.disabled=false;}
  },{signal});
  root.querySelector('[data-color-list]')!.addEventListener('submit',async event=>{
    event.preventDefault();const f=event.target as HTMLFormElement;if(!f.matches('[data-edit-color]'))return;const button=f.querySelector<HTMLButtonElement>('button')!;button.disabled=true;
    try{const data=new FormData(f);await write(`/api/admin/colors/${f.dataset.editColor}`,'PUT',{name:data.get('name'),hex:data.get('hex'),active:data.get('active')==='on'});await refresh();setStatus(notice,'色卡已更新。');}catch(error){if(!abortError(error))setStatus(notice,(error as Error).message,true);}finally{button.disabled=false;}
  },{signal});
  const qqInput=root.querySelector<HTMLInputElement>('[data-qq-upload]')!;
  qqInput.addEventListener('change',async()=>{const file=qqInput.files?.[0];qqInput.value='';if(!file)return;qqInput.disabled=true;try{const asset=await upload(file);settings=await write<Settings>('/api/admin/settings','PUT',{qq_asset:asset.id});renderQQ();setStatus(notice,'QQ 二维码已保存。');}catch(error){if(!abortError(error))setStatus(notice,(error as Error).message,true);}finally{qqInput.disabled=false;}},{signal});
  root.querySelector('[data-qq-remove]')!.addEventListener('click',async()=>{if(!settings?.qq_asset)return;if(!window.confirm('移除工坊当前的 QQ 二维码？'))return;try{settings=await write<Settings>('/api/admin/settings','PUT',{qq_asset:null});renderQQ();setStatus(notice,'二维码已移除。');}catch(error){if(!abortError(error))setStatus(notice,(error as Error).message,true);}},{signal});
  void(async()=>{try{const session=await api<{token:string}>('/api/admin/session',signal);token=session.token;await refresh();}catch(error){if(!abortError(error))setStatus(notice,(error as Error).message,true);}})();
  return ()=>{window.removeEventListener('beforeunload',beforeUnload);};
}
