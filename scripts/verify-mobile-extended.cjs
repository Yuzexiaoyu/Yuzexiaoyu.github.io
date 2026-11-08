const {chromium,devices}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs=require('fs'),path=require('node:path'),assert=require('node:assert/strict');
const base=process.argv[2]||'http://127.0.0.1:13132';
const out=process.argv[3]||'.mobile-validation/extended';
fs.mkdirSync(out,{recursive:true});
(async()=>{
 const b=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL||'chrome'});const results=[];
 const run=async(name,fn)=>{if(process.env.MOBILE_TEST_FILTER&&!name.includes(process.env.MOBILE_TEST_FILTER))return;const start=Date.now();try{const detail=await fn();results.push({name,status:'passed',ms:Date.now()-start,detail});}catch(e){results.push({name,status:'failed',error:e.stack});}console.log(JSON.stringify(results.at(-1)));fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));};
 const c=await b.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},deviceScaleFactor:1});const p=await c.newPage();
 await c.route('https://**',r=>r.abort());
 await run('largest actual EPUB if: load and last page',async()=>{
  const start=Date.now();await p.goto(base+'/novel/reader/#vol=if',{waitUntil:'load'});await p.waitForFunction(()=>document.querySelector('#reader-loading')?.style.display==='none',null,{timeout:60000});
  const ready=Date.now()-start;await p.keyboard.press('End');await p.waitForTimeout(100);
  const details=await p.evaluate(()=>({pages:document.querySelectorAll('.reader-page').length,text:document.querySelector('#reader-content').textContent.length,progress:document.querySelector('#reader-progress-text').textContent,lastPage:document.querySelector('.reader-page:last-child').textContent.slice(-100)}));assert.equal(details.progress,'100%');return {loadAndPaginateMs:ready,bytes:78523189,...details};
 });
 await run('rapid volume changes cancel old work',async()=>{
  await p.goto(base+'/novel/reader/#vol=01');await p.locator('#vol-next').click();await p.locator('#vol-next').click();await p.waitForFunction(()=>document.querySelector('#reader-loading')?.style.display==='none',null,{timeout:60000});
  assert.equal(await p.locator('#volume-label').textContent(),'第三卷');assert.ok(p.url().endsWith('#vol=03'));return {label:await p.locator('#volume-label').textContent()};
 });
 await run('EPUB failure has retry and bookshelf actions',async()=>{
  await p.route('**/novel/01.epub',r=>r.abort());await p.goto(base+'/novel/reader/#vol=01');await p.locator('#reader-loading button').waitFor();assert.ok(await p.locator('#reader-loading a[href="/novel/"]').count());await p.unroute('**/novel/01.epub');await p.locator('#reader-loading button').click();await p.waitForFunction(()=>document.querySelector('#reader-loading')?.style.display==='none');
 });
 await run('mobile background actually stops drawing while hidden',async()=>{
  const hidden=await c.newPage();await hidden.addInitScript(()=>{window.__draws=0;const fill=CanvasRenderingContext2D.prototype.fillRect;CanvasRenderingContext2D.prototype.fillRect=function(...args){if(this.canvas.id==='warp-canvas')window.__draws++;return fill.apply(this,args);};window.__testHidden=false;Object.defineProperty(document,'hidden',{get:()=>window.__testHidden,configurable:true});});
  await hidden.goto(base+'/');await hidden.waitForTimeout(250);
  await hidden.evaluate(()=>{window.__testHidden=true;document.dispatchEvent(new Event('visibilitychange'));});const start=await hidden.evaluate(()=>window.__draws);await hidden.waitForTimeout(350);assert.equal(await hidden.evaluate(()=>window.__draws),start);
  await hidden.evaluate(()=>{window.__testHidden=false;for(let i=0;i<5;i++)document.dispatchEvent(new Event('visibilitychange'));});await hidden.waitForTimeout(350);const resumed=await hidden.evaluate(()=>window.__draws)-start;assert.ok(resumed>3&&resumed<25);await hidden.close();return {hiddenDraws:0,resumedDrawsIn350ms:resumed,visibility:'synthetic visibility event'};
 });
 await run('iPadOS desktop UA and touchscreen Windows decision in browser',async()=>{
  const modes=[];for(const [ua,touch,width,mobile] of [['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',5,1180,true],['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/142.0.0.0 Safari/537.36',10,375,false]]){
   const x=await b.newContext({userAgent:ua,viewport:{width,height:820},hasTouch:true});const q=await x.newPage();await q.addInitScript(t=>Object.defineProperty(navigator,'maxTouchPoints',{get:()=>t}),touch);await q.route('https://**',r=>r.abort());await q.goto(base+'/');const mode=await q.getAttribute('html','data-ui');assert.equal(mode==='mobile',mobile);modes.push({ua,touch,width,mode});await x.close();
  }return modes;
 });
 await run('online Mermaid expand, panzoom and close',async()=>{
  const x=await b.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},deviceScaleFactor:1});const q=await x.newPage();const failures=[];q.on('pageerror',e=>failures.push(e.message));
  await q.goto(base+'/p/markdown基本语法/',{waitUntil:'domcontentloaded'});const figure=q.locator('.mermaid-wrapper').first();await figure.scrollIntoViewIfNeeded();await figure.locator('svg').waitFor({timeout:30000});await figure.locator('.mermaid-toolbar button').click();await q.locator('.mermaid-panzoom-container.ready').waitFor({timeout:30000});await q.locator('.mermaid-modal-close').click();assert.equal(await q.evaluate(()=>document.body.style.overflow),'');assert.deepEqual(failures,[]);await q.screenshot({path:path.join(out,'online-mermaid.png')});await x.close();return {pageErrors:failures};
 });
 await run('legacy reading settings and proportional bookmark migration',async()=>{
  const x=await b.newContext({...devices['iPhone 13'],viewport:{width:390,height:844}});const q=await x.newPage();await q.route('https://**',r=>r.abort());
  await q.addInitScript(()=>localStorage.setItem('novel-reader-state',JSON.stringify({theme:'sepia',fontSizeIndex:0,lineHeightIndex:2,currentVolIndex:0,lastVolKey:'01',progress:{'01':{p:5,t:11}}})));
  await q.goto(base+'/novel/reader/#vol=01');await q.waitForFunction(()=>document.querySelector('#reader-loading')?.style.display==='none');
  const state=await q.evaluate(()=>JSON.parse(localStorage.getItem('novel-reader-state')));assert.equal(state.theme,'sepia');assert.equal(state.fontSizeIndex,0);assert.equal(state.lineHeightIndex,2);assert.ok(state.progress['01'].mobileAnchor);assert.ok(Math.abs(state.progress['01'].p/(state.progress['01'].t-1)-.5)<.01);await x.close();return {legacyFieldsPreserved:true,semanticAnchorAdded:true};
 });
 await run('mobile music resources stay absent across routes',async()=>{
  const states=[];
  for(const route of ['/','/p/markdown基本语法/','/novel/reader/#vol=01']){
   await p.goto(base+route,{waitUntil:'load'});
   const state=await p.evaluate(()=>({player:!!document.querySelector('#aplayer'),audio:!!document.querySelector('audio'),instance:!!window.aplayerInstance,resources:performance.getEntriesByType('resource').filter(e=>/aplayer|music-uploads/i.test(e.name)).map(e=>e.name)}));
   assert.equal(state.player,false);assert.equal(state.audio,false);assert.equal(state.instance,false);assert.deepEqual(state.resources,[]);
   states.push({route,...state});
  }
  return states;
 });
 await run('mobile module and ZIP script failures remain recoverable',async()=>{
  const x=await b.newContext({...devices['iPhone 13'],viewport:{width:390,height:844}});const q=await x.newPage();await q.route('https://**',r=>r.abort());await q.route('**/ts/mobile.*.js',r=>r.abort());
  await q.goto(base+'/p/markdown基本语法/');assert.ok(await q.locator('.article-content').isVisible());await q.locator('.m-navigation summary').click();assert.ok(await q.locator('.m-navigation nav a[href$="/search/"]').isVisible());
  await q.goto(base+'/novel/reader/#vol=01');await q.locator('#reader-loading button').waitFor();assert.ok((await q.locator('#reader-loading').textContent()).includes('移动阅读组件加载失败'));
  await q.unroute('**/ts/mobile.*.js');await q.route('**/lib/jszip.min.js',r=>r.abort());await q.reload();await q.locator('#reader-loading button').waitFor();assert.ok((await q.locator('#reader-loading').textContent()).includes('电子书解析组件加载失败'));await x.close();return {articleReadable:true,nativeNavigation:true,readerRetryAndBack:true};
 });
 await b.close();
 process.exitCode=results.some(r=>r.status==='failed')?1:0;
})();
