// Browser checks use isolated API fixtures; no real catalog or uploads are modified.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.argv[2]||'http://127.0.0.1:13135';
const out=process.argv[3]||'.local/print-workshop/qa/editor-screen';
const catalog=JSON.parse(fs.readFileSync('static/workshop/catalog.json','utf8'));
fs.mkdirSync(out,{recursive:true});

function fixture(){
  const entries=structuredClone(catalog.entries),work=entries.find(e=>e.kind==='work');
  // Match the local admin API; the public snapshot omits these editable ID lists.
  for(const entry of entries){entry.color_ids=entry.colors.map(c=>c.id);entry.image_ids=entry.images.map(a=>a.id);entry.video_ids=(entry.videos||[]).map(a=>a.id);}
  const colors=Array.from({length:17},(_,i)=>({id:`color-${i}`,name:`测试颜色 ${i+1}`,hex:'#87b89e',material:'PLA',active:1}));
  work.images=Array.from({length:12},(_,i)=>({...work.images[0],id:`image-${i}`,name:`图片 ${i+1}`}));
  work.image_ids=work.images.map(a=>a.id);
  work.videos=Array.from({length:6},(_,i)=>({...work.videos[0],id:`video-${i}`,name:`视频 ${i+1}`}));
  work.video_ids=work.videos.map(a=>a.id);work.color_ids=['color-0','color-6','color-12'];work.colors=colors.filter(c=>work.color_ids.includes(c.id));
  return{entries,colors,work,saved:[]};
}

async function mount(browser,profile){
  const page=await browser.newPage({viewport:{width:profile.width,height:profile.height}});
  const data=fixture(),errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});
  await page.route('https://**',route=>route.abort());
  await page.route('**/api/admin/**',async route=>{
    const req=route.request(),url=new URL(req.url());let body;
    if(url.pathname==='/api/admin/session')body={token:'TEST_TOKEN'};
    else if(url.pathname==='/api/admin/colors')body=data.colors;
    else if(url.pathname==='/api/admin/settings')body=catalog.settings;
    else if(req.method()==='PUT'&&url.pathname.startsWith('/api/admin/entries/')){
      body=req.postDataJSON();data.saved.push(structuredClone(body));data.entries=data.entries.map(entry=>entry.id===body.id?body:entry);
    }else if(url.pathname==='/api/admin/entries')body={entries:data.entries};
    else throw new Error('Unexpected fixture request: '+req.method()+' '+url.pathname);
    await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto(base+'/admin/prints/');await page.locator(`[data-edit="${data.work.id}"]`).click();
  return{page,data,errors};
}

async function dimensions(page){return page.locator('[data-entry-editor]').evaluate(d=>{
  const rect=d.getBoundingClientRect(),pages=d.querySelector('.wk-editor-grid').getBoundingClientRect(),close=d.querySelector('.wk-editor-close').getBoundingClientRect(),svg=d.querySelector('.wk-editor-close svg').getBoundingClientRect();
  const outside=Array.from(d.querySelectorAll('.wk-editor-grid input,.wk-editor-grid textarea,.wk-editor-grid button,.wk-editor-grid .wk-field,.wk-editor-grid .wk-muted,.wk-editor-grid .wk-color-choice')).filter(n=>n.getClientRects().length).map(n=>({name:n.getAttribute('name')||n.className||n.tagName,r:n.getBoundingClientRect()})).filter(({r})=>r.top<pages.top-1||r.bottom>pages.bottom+1||r.left<pages.left-1||r.right>pages.right+1).map(({name,r})=>({name,top:r.top,bottom:r.bottom}));
  const footer=d.querySelector('.wk-editor-footer').getBoundingClientRect();
  return{height:rect.height,top:rect.top,bottom:rect.bottom,viewport:innerHeight,scrollHeight:d.scrollHeight,clientHeight:d.clientHeight,overflow:document.documentElement.scrollWidth>innerWidth,outside,footerVisible:footer.bottom<=rect.bottom&&footer.top>=rect.top,iconOffsetX:(svg.left+svg.width/2)-(close.left+close.width/2),iconOffsetY:(svg.top+svg.height/2)-(close.top+close.height/2)};
});}

(async()=>{const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||undefined});const results=[];
try{
  for(const profile of [{name:'large',width:1920,height:1080},{name:'desktop',width:1440,height:900},{name:'laptop',width:1366,height:768},{name:'short',width:1280,height:600}]){
    const{page,data,errors}=await mount(browser,profile),layouts=[];
    for(const name of ['work','product']){
      if(name==='product')await page.locator(`[data-edit="${data.entries.find(e=>e.kind==='product').id}"]`).click();
      const size=await dimensions(page);
      await page.screenshot({path:path.join(out,profile.name+'-'+name+'.png')});
      assert.ok(size.height<=profile.height&&size.top>=0&&size.bottom<=profile.height+1,JSON.stringify(size));
      assert.ok(size.scrollHeight<=size.clientHeight+1,JSON.stringify(size));assert.deepEqual(size.outside,[],profile.name+' '+name+' '+JSON.stringify(size.outside));
      assert.equal(size.overflow,false);assert.equal(size.footerVisible,true);assert.equal(size.iconOffsetX,0);assert.equal(size.iconOffsetY,0);
      assert.equal(await page.locator('.wk-editor [role="tablist"]').count(),0);
      for(const selector of ['input[name="name"]','textarea[name="description"]','[data-image-upload]','[data-video-upload]','[data-model-upload]','[data-source-upload]'])assert.equal(await page.locator('[data-entry-form] '+selector).isVisible(),true);
      const before=await page.evaluate(()=>({page:scrollY,editor:document.querySelector('[data-entry-editor]').scrollTop}));
      await page.locator('.wk-editor-heading').hover();await page.mouse.wheel(0,900);await page.waitForTimeout(80);
      assert.deepEqual(await page.evaluate(()=>({page:scrollY,editor:document.querySelector('[data-entry-editor]').scrollTop})),before);
      layouts.push({name,...size});await page.locator('.wk-editor-close').click();assert.equal(await page.locator('[data-entry-editor]').evaluate(d=>d.open),false);
    }
    assert.deepEqual(errors,[]);results.push({profile:profile.name,layouts,errors});console.log(profile.name+' layout passed');await page.close();
  }
  const{page,data,errors}=await mount(browser,{width:1440,height:900});
  await page.locator('.wk-editor-close').focus();await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.name),'name');
  await page.locator('[data-editor-color="color-1"]').check();
  await page.locator('[data-colors-pager] [data-page-step="1"]').click();await page.locator('[data-editor-color="color-6"]').uncheck();
  await page.locator('[data-colors-pager] [data-page-step="1"]').click();await page.locator('[data-editor-color="color-13"]').check();
  await page.locator('[data-colors-pager] [data-page-step="-1"]').click();await page.locator('[data-colors-pager] [data-page-step="-1"]').click();assert.equal(await page.locator('[data-editor-color="color-1"]').isChecked(),true);
  await page.locator('[data-images-pager] [data-page-step="1"]').click();
  await page.locator('[data-image-cover="11"]').click();assert.equal(await page.locator('[data-editor-images] img').first().getAttribute('alt'),'图片 12');
  await page.locator('[data-images-pager] [data-page-step="1"]').click();await page.locator('[data-image-remove="11"]').click();
  assert.equal(await page.locator('[data-image-remove="10"]').count(),1);
  await page.locator('input[name="min_price"]').fill('');await page.locator('[data-save-entry]').click();
  assert.equal(await page.evaluate(()=>document.activeElement.name),'min_price');assert.equal(data.saved.length,0);
  await page.locator('input[name="min_price"]').fill('20');await page.locator('[data-save-entry]').click();
  await page.waitForFunction(()=>!document.querySelector('[data-entry-editor]').open);
  await page.waitForFunction(()=>document.querySelector('[data-admin-notice]').textContent.includes('已保存'));
  assert.equal(data.saved.length,1);assert.deepEqual(data.saved[0].color_ids.sort(),['color-0','color-1','color-12','color-13']);
  assert.equal(data.saved[0].image_ids[0],'image-11');assert.ok(!data.saved[0].image_ids.includes('image-10'));
  await page.locator(`[data-edit="${data.work.id}"]`).click();assert.equal(await page.locator('[data-images-pager] output').textContent(),'1 / 2');
  await page.locator('[data-entry-form] input[name="name"]').fill('未保存的标题');page.once('dialog',dialog=>dialog.dismiss());await page.locator('.wk-editor-close').click();assert.equal(await page.locator('[data-entry-editor]').evaluate(d=>d.open),true);
  page.once('dialog',dialog=>dialog.accept());await page.keyboard.press('Escape');assert.equal(await page.locator('[data-entry-editor]').evaluate(d=>d.open),false);
  const stock=data.entries.find(e=>e.kind==='product');await page.locator(`[data-edit="${stock.id}"]`).click();await page.locator('[data-entry-editor]').waitFor({state:'visible'});
  assert.equal(await page.locator('[data-stock-fields]').isVisible(),true);assert.equal(await page.locator('[data-configurable-fields]').isVisible(),false);
  await page.locator('[data-entry-form] input[name="material"]').fill('PETG');await page.locator('input[name="stock_fixed_infill"]').fill('100');await page.locator('[data-save-entry]').click();await page.waitForFunction(()=>!document.querySelector('[data-entry-editor]').open);
  assert.equal(data.saved[1].material,'PETG');assert.deepEqual(data.saved[1].color_ids,[]);assert.equal(data.saved[1].fixed_price,stock.fixed_price);assert.equal(data.saved[1].fixed_infill,100);assert.deepEqual(errors,[]);
  results.push({case:'single-page editing, keyboard focus, native validation, retained selection, cover, removal, save, dirty close and stock',saved: data.saved.map(entry=>({kind:entry.kind,colors:entry.color_ids,images:entry.image_ids.length})),errors});
  await page.close();fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({passed:results.length,evidence:path.resolve(out)}));
}finally{await browser.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
