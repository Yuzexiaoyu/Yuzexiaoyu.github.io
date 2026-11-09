/* Run against a mobile-preview Hugo build. Uses an isolated browser profile and fixture uploads. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:13132';
const out = process.argv[3] || '.mobile-validation/checks';
fs.mkdirSync(out, {recursive:true});
const results = [];
async function check(name, run) {
  if (process.env.MOBILE_TEST_FILTER && !name.includes(process.env.MOBILE_TEST_FILTER)) return;
  const start=Date.now();
  try { const detail=await run(); results.push({name,status:'passed',ms:Date.now()-start,detail}); }
  catch(e) { results.push({name,status:'failed',ms:Date.now()-start,error:e.stack}); }
  console.log(`${results.at(-1).status}: ${name}`);
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
}
const routeList=['/','/archives/','/search/?keyword=数据','/关于/','/更新日志/','/tags/','/categories/','/404.html','/p/markdown基本语法/','/p/数据结构之线性表/','/p/数据结构之栈与队列/','/p/数据结构之串与数组/','/p/数据结构之树与二叉树/','/p/数据结构之图/','/post/','/page/','/novel/'];
(async()=>{
  await check('T01 device and feature-switch matrix',async()=>{
    const code=fs.readFileSync('static/js/mobile-mode.js','utf8');
    const samples=[['Windows NT 10.0; Win64; x64',0,false],['Windows NT 10.0; Win64; x64',10,false],['Macintosh; Intel Mac OS X',0,false],['X11; Linux x86_64',0,false],['iPhone; CPU iPhone OS 18_0 like Mac OS X',5,true],['Linux; Android 15; Pixel 9',5,true],['Linux; Android 15; Tablet',5,true],['Macintosh; Intel Mac OS X',5,true],['Unknown',0,false]];
    for(const [ua,touch,mobile] of samples)for(const enabled of [false,true]){
      const classes=new Set();const html={dataset:{},classList:{add:s=>classes.add(s)}};
      const viewport={content:''};const context={navigator:{userAgent:ua,maxTouchPoints:touch},document:{documentElement:html,querySelector:()=>viewport},window:{__mobileEnabled:enabled}};
      vm.runInNewContext(code,context);
      assert.equal(html.dataset.ui==='mobile',mobile&&enabled);
      assert.equal(classes.has('is-mobile-blocked'),false);
    }
    const fallback={dataset:{},classList:{add:()=>{}}};
    vm.runInNewContext(code,{navigator:{userAgent:'iPhone',maxTouchPoints:5},document:{documentElement:fallback,querySelector:()=>null},window:{}});
    assert.equal(fallback.dataset.ui,'mobile');
    return {cases:samples.length*2};
  });
  const browser=await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL || 'chrome'});
  const context=await browser.newContext({...devices['iPhone 13'],viewport:{width:390,height:844},deviceScaleFactor:1});
  // Third party network is excluded from deterministic checks, and recorded explicitly.
  await context.route('https://**',r=>r.abort());
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const goto=async route=>{await page.goto(base+route,{waitUntil:'load'});await page.waitForTimeout(300);};
  const readyReader=async()=>{await page.waitForFunction(()=>document.querySelector('#reader-loading')?.style.display==='none',null,{timeout:60000});await page.waitForTimeout(400);};
  await check('M01-M06 route content and overflow',async()=>{
    const routes=[];
    for(const route of routeList){
      await goto(route);
      const measurement=await page.evaluate(()=>({mode:document.documentElement.dataset.ui,width:document.documentElement.scrollWidth,viewport:innerWidth,body:document.body.className}));
      assert.equal(measurement.mode,'mobile',route);assert.ok(measurement.width<=391,`${route} overflows: ${measurement.width}`);
      routes.push({route,...measurement});
    }
    return {routes,thirdParty:'blocked for deterministic checks'};
  });
  await check('M01 mobile CSS is fully scoped',async()=>{
    await goto('/');
    const selectors=await page.evaluate(()=>{
      const sheet=Array.from(document.styleSheets).find(s=>s.href?.includes('mobile.min.'));
      const out=[];function walk(rules){for(const r of rules){if(r.selectorText)out.push(r.selectorText);if(r.cssRules)walk(r.cssRules);}}walk(sheet.cssRules);return out;
    });
    assert.ok(selectors.length>50);
    for(const selector of selectors)for(const part of selector.split(','))assert.ok(part.trim().startsWith('html[data-ui="mobile"]'),part);
    return {selectors:selectors.length};
  });
  await check('T03 navigation open, close, keyboard',async()=>{
    await page.locator('.m-navigation summary').click();assert.equal(await page.locator('.m-navigation').getAttribute('open'),'');
    await page.keyboard.press('Escape');assert.equal(await page.locator('.m-navigation').getAttribute('open'),null);
    await page.locator('.m-navigation summary').click();await page.locator('.m-nav-close').click();
    assert.ok(await page.locator('.m-navigation nav a[href$="/search/"]').count());
  });
  await check('T04 pagination and Swup return',async()=>{
    await page.waitForFunction(()=>window.swupReady);
    await page.locator('#local-pagination a[data-goto="2"]').click();assert.ok(page.url().includes('page=2'));
    await page.locator('section.article-list[data-page="2"] article a').first().click();await page.waitForURL(/\/p\//);
    await page.waitForTimeout(300);await page.goBack();
    await page.waitForFunction(()=>document.querySelector('section.article-list[data-page="2"]')?.style.display!=='none');
    assert.equal(await page.locator('#aplayer').count(),0);
  });
  await check('T06 Chinese composition, search, empty, clear',async()=>{
    await goto('/search/');const input=page.locator('input[name="keyword"]');
    await input.evaluate(el=>{el.value='数据';el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));});
    assert.ok(!page.url().includes('keyword='));
    await input.dispatchEvent('compositionend');await page.waitForFunction(()=>document.querySelectorAll('.search-result--list article').length>0);
    const matches=await page.locator('.search-result--list article').count();assert.ok(matches>0);
    await input.fill('没有这个结果zzzzzz');await page.waitForFunction(()=>document.querySelectorAll('.search-result--list article').length===0);
    await input.fill('');assert.ok(!page.url().includes('keyword='));return {matches};
  });
  await check('T07 article TOC and local scroll areas',async()=>{
    await goto('/p/markdown基本语法/');
    await page.locator('.m-toc summary').click();await page.locator('#TableOfContents a').last().click();
    assert.equal(await page.locator('.m-toc').getAttribute('open'),null);
    assert.ok(await page.locator('.article-content pre').count());
    assert.ok(await page.locator('.copyCodeButton').first().isVisible());
  });
  await check('T08-T09 compact home and mobile music removal',async()=>{
    await goto('/');
    const detail=await page.evaluate(()=>({
      cards:Array.from(document.querySelectorAll('section.article-list[data-page="1"] > article')).map(el=>{const r=el.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),height:Math.round(r.height)};}),
      player:!!document.querySelector('#aplayer'),audio:!!document.querySelector('audio'),
      resources:performance.getEntriesByType('resource').filter(entry=>/aplayer|music-uploads/i.test(entry.name)).map(entry=>entry.name),
      width:document.documentElement.scrollWidth,viewport:innerWidth,
      heading:!!document.querySelector('.home-feed-heading')
    }));
    assert.equal(detail.heading,false);assert.equal(detail.cards.length,4);
    assert.equal(detail.cards[0].y,detail.cards[1].y);
    assert.ok(detail.cards[1].x>detail.cards[0].x && detail.cards[2].y>detail.cards[0].y);
    assert.ok(detail.cards.every(card=>card.height<=260),JSON.stringify(detail.cards));
    assert.equal(detail.player,false);assert.equal(detail.audio,false);
    assert.deepEqual(detail.resources,[]);assert.ok(detail.width<=detail.viewport);
    return detail;
  });
  await check('T11-T14 single-page fixtures, text integrity, IDs, semantic reflow',async()=>{
    await goto('/');
    return await page.evaluate(async()=>{
      const viewport=document.createElement('div');viewport.className='reader-viewport';viewport.style.cssText='position:fixed;left:-10000px;top:0;width:390px;height:300px;flex:none';
      const content=document.createElement('div');content.className='reader-content';content.style.cssText='font-size:18px;line-height:1.8';viewport.appendChild(content);document.body.appendChild(viewport);
      const engine=window.__createMobilePagination(content,viewport);const counts=[];
      for(const n of [1,2,3,31,32]){
        const chapters=Array.from({length:n},(_,idx)=>{const anchor=document.createElement('section');anchor.className='reader-chapter';anchor.innerHTML=`<p id="chapter-${idx}">第${idx}章</p>`;return {idx,anchor};});
        content.replaceChildren(...chapters.map(ch=>ch.anchor));const book={chapters};await engine.paginate(book);
        if(book.totalPagesCount!==n)throw new Error(`fixture ${n}: ${book.totalPagesCount}`);counts.push(book.totalPagesCount);
      }
      const anchor=document.createElement('section');anchor.className='reader-chapter';anchor.innerHTML='<div id="container"><p id="long">'+('长段落测试<em>强调</em><a href="#note">注</a>'.repeat(500))+'</p><p id="note">注释终点</p></div>';
      const expected=anchor.textContent;content.replaceChildren(anchor);const book={chapters:[{idx:0,anchor}]};await engine.paginate(book);
      if(content.textContent!==expected)throw new Error('Text lost or duplicated during split');
      if(content.querySelectorAll('#long').length!==1||content.querySelectorAll('#note').length!==1||content.querySelectorAll('#container').length!==1)throw new Error('EPUB id lost/duplicated');
      const saved=engine.capture(Math.floor(book.totalPagesCount/2));viewport.style.width='320px';await engine.paginate(book);const restored=engine.restore(saved);
      if(restored===null)throw new Error('Semantic reflow lost the anchor');
      if(content.textContent!==expected)throw new Error('Text lost on repeated reflow');
      const details={counts,longPages:book.totalPagesCount,characters:expected.length,restored};engine.cancel();viewport.remove();return details;
    });
  });
  await check('T12-T13 actual EPUB tail, TOC, notes, font, orientation, refresh',async()=>{
    await goto('/novel/reader/#vol=01');await readyReader();
    const start=await page.evaluate(()=>({pages:document.querySelectorAll('.reader-page').length,text:document.querySelector('#reader-content').textContent.length}));
    assert.ok(start.pages>10);
    const integrity=await page.evaluate(async()=>{
      const zip=await JSZip.loadAsync(await (await fetch('/novel/01.epub')).arrayBuffer());
      const parse=(text)=>{let doc=new DOMParser().parseFromString(text,'application/xhtml+xml');return doc.querySelector('parsererror')?new DOMParser().parseFromString(text,'text/html'):doc;};
      const container=new DOMParser().parseFromString(await zip.file('META-INF/container.xml').async('string'),'application/xml');
      const opfPath=container.querySelector('rootfile').getAttribute('full-path'),dir=opfPath.slice(0,opfPath.lastIndexOf('/')+1);
      const opf=new DOMParser().parseFromString(await zip.file(opfPath).async('string'),'application/xml');const manifest={};
      opf.querySelectorAll('manifest item').forEach(el=>manifest[el.getAttribute('id')]=el.getAttribute('href'));
      let expected='';for(const ref of opf.querySelectorAll('spine itemref')){const href=manifest[ref.getAttribute('idref')];if(!href)continue;const file=zip.file(dir+href);if(!file)continue;const doc=parse(await file.async('string')),body=doc.body||doc.querySelector('body');body?.querySelectorAll('script,style,link,meta').forEach(el=>el.remove());expected+=body?.textContent||'';}
      const actual=document.querySelector('#reader-content').textContent;
      if(actual.replace(/\s/g,'')!==expected.replace(/\s/g,''))throw new Error('Actual EPUB source text differs from paginated text');
      const pages=Array.from(document.querySelectorAll('.reader-page'));let checked=0;
      for(const link of document.querySelectorAll('#reader-content a.cyu[href^="#"]')){
        const source=link.closest('.reader-page'),chapter=source.dataset.mChapter,id=decodeURIComponent(link.getAttribute('href').slice(1));
        const target=pages.find(p=>p.dataset.mChapter===chapter&&p.querySelector(`#${CSS.escape(id)}`));if(!target)continue;
        link.click();const index=Math.round(-new DOMMatrix(getComputedStyle(document.getElementById('reader-content')).transform).m41/document.getElementById('reader-viewport').clientWidth);
        if(index!==pages.indexOf(target))throw new Error('Actual note jumped to the wrong single page');checked++;if(checked===10)break;
      }
      if(!checked)throw new Error('No actual EPUB note fixture was exercised');
      return {normalizedCharacters:expected.replace(/\s/g,'').length,notes:checked};
    });
    await page.keyboard.press('End');await page.waitForTimeout(100);
    assert.equal(await page.locator('.m-reader-pager button').last().isDisabled(),true);
    assert.equal(await page.locator('#reader-progress-text').textContent(),'100%');
    await page.locator('#toc-toggle-btn').click();await page.locator('.toc-item').last().click();
    const bookmark=await page.evaluate(()=>JSON.parse(localStorage.getItem('novel-reader-state')).progress['01'].mobileAnchor);
    assert.ok(bookmark?.block);
    await page.setViewportSize({width:844,height:390});await page.waitForTimeout(900);
    const rotated=await page.evaluate(()=>JSON.parse(localStorage.getItem('novel-reader-state')).progress['01'].mobileAnchor);
    assert.equal(rotated.block,bookmark.block);
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(900);
    await page.locator('.reader-toolbar button').filter({hasText:'设置'}).click();
    await page.locator('#font-trigger').click();await page.locator('#font-menu [data-font="2"]').click();await page.waitForTimeout(700);
    for(const theme of ['light','sepia','eye','dark']){await page.locator(`#theme-dots [data-theme="${theme}"]`).click();assert.equal(await page.locator('#novel-reader-root').getAttribute('data-theme'),theme);}
    await page.reload({waitUntil:'load'});await readyReader();
    const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('novel-reader-state')).progress['01'].mobileAnchor);
    assert.equal(restored.block,bookmark.block);
    return {...start,integrity};
  });
  await check('T15 twenty Swup navigation rounds and reader cleanup',async()=>{
    await goto('/');await page.waitForFunction(()=>window.swupReady);
    const cdp=await context.newCDPSession(page);
    async function listeners(expression){const {result}=await cdp.send('Runtime.evaluate',{expression});const {listeners}=await cdp.send('DOMDebugger.getEventListeners',{objectId:result.objectId});return listeners.reduce((out,l)=>(out[l.type]=(out[l.type]||0)+1,out),{});}
    const before={document:await listeners('document'),window:await listeners('window')};
    for(let i=0;i<20;i++){
      for(const route of ['/p/数据结构之线性表/','/search/','/novel/','/novel/reader/#vol=01','/']){
        await page.evaluate(route=>window.swup.navigate(route),base+route);
        await page.waitForFunction(route=>decodeURI(location.pathname)===route.split('#')[0],route);
        if(route.includes('/reader/'))await readyReader();
        else await page.waitForTimeout(30);
      }
      assert.equal(await page.locator('#aplayer').count(),0);assert.equal(await page.locator('#warp-canvas').count(),1);
    }
    const after={document:await listeners('document'),window:await listeners('window')};
    assert.ok((after.window.message||0)<=(before.window.message||0)+1);
    delete before.window.message;delete after.window.message;
    assert.deepEqual(after,before);await cdp.detach();
    return {rounds:20,navigations:100,listeners:{before,after},pageErrors:errors};
  });
  await check('T19 mobile viewport widths',async()=>{
    const measurements=[];
    for(const width of [320,360,375,390,412,430,768,820,1024,1180,1366]){
      await page.setViewportSize({width,height:844});await goto('/');
      const measurement=await page.evaluate(()=>({w:innerWidth,scroll:document.documentElement.scrollWidth,brand:document.querySelector('.m-brand span').textContent}));
      assert.ok(measurement.scroll<=width+1);assert.equal(measurement.brand,'雨泽小鱼的个人博客');measurements.push(measurement);
    }
    return measurements;
  });
  await check('No uncaught page errors',async()=>assert.deepEqual(errors,[]));
  fs.writeFileSync(path.join(out,'environment.json'),JSON.stringify({browser:browser.version(),device:'Playwright iPhone 13 configuration in Chromium',date:new Date().toISOString(),base,thirdParty:'blocked',realDevices:'not executed'},null,2));
  await browser.close();
  process.exitCode=results.some(r=>r.status==='failed')?1:0;
})();
