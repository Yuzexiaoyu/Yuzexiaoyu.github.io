/* Run against a production Hugo build. Keep HTTP caching enabled when checking reuse. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const {chromium, devices} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:13147';
const out = process.argv[3] || '.local/mobile-preload-2026-11-18/checks';
fs.mkdirSync(out, {recursive:true});
const results = [];
let browser;
async function check(name, run) {
  try { results.push({name, status:'passed', detail:await run()}); }
  catch (error) { results.push({name, status:'failed', error:error.stack}); }
  console.log(JSON.stringify(results.at(-1)));
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({browser:browser.version(), conditions:'Local production build; Chrome device emulation; external HTTPS blocked; physical devices not tested', results}, null, 2));
}
async function create(device, mode = '4g') {
  const context = await browser.newContext(device ? {...devices[device], deviceScaleFactor:1} : {viewport:{width:1440,height:900}});
  const page = await context.newPage(), cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setBlockedURLs', {urls:['https://*']});
  const requests = [], errors = [];
  cdp.on('Network.requestWillBeSent', event => requests.push({url:event.request.url,type:event.type,priority:event.request.initialPriority}));
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(mode => {
    // Chrome's effectiveType can drop to 3g between localhost reloads. Exercise
    // each scheduling policy explicitly, independent of the test host's RTT.
    window.__restricted = true;
    if (mode==='hidden') Object.defineProperty(document,'hidden',{get:()=>window.__restricted});
    if (mode==='no-hints') {
      Object.defineProperty(navigator,'connection',{value:undefined});
      delete window.requestIdleCallback;
    } else Object.defineProperties(navigator.connection,{
      saveData:{get:()=>mode==='saveData' && window.__restricted},
      effectiveType:{get:()=>mode==='3g' && window.__restricted ? '3g' : '4g'}
    });
    const original = window.fetch;
    window.__preloadAudit = {requests:[],active:0,maxActive:0};
    window.fetch = function(input, options) {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      const audit = window.__preloadAudit;
      if (url.origin !== location.origin || !url.pathname.startsWith('/p/')) return original.call(this, input, options);
      const loader = document.querySelector('#page-loader');
      const cards = document.querySelectorAll('.m-home-track [aria-hidden="false"] .article-image img');
      audit.requests.push({url:url.pathname,ms:performance.now(),introReady:loader?.classList.contains('m-intro-ready'),introHidden:!loader || loader.classList.contains('hidden') || loader.style.display === 'none',documentState:document.readyState,
        coversReady:cards.length>0 && [...cards].every(img=>img.complete && img.naturalWidth>0),workshopReady:!!window.WorkshopApp});
      audit.maxActive = Math.max(audit.maxActive, ++audit.active);
      return original.call(this, input, options).finally(() => audit.active--);
    };
  },mode);
  return {context,page,requests,errors};
}
async function expected(page) {
  return page.evaluate(() => ({
    articles:[...new Set([...document.querySelectorAll('.m-home-track .home-article-list[aria-hidden="false"] article:not(.home-pinned-card) .article-title a')].map(a => a.pathname))],
    menu:[...document.querySelectorAll('.m-navigation nav a[href]')].filter(a => a.origin === location.origin && !a.target && a.pathname !== location.pathname).map(a => a.pathname+a.search),
    firstCover:document.querySelector('.m-home-track [aria-hidden="false"] article:not(.home-pinned-card) .article-image img')?.src
  }));
}
async function ready(page, targets) {
  await page.waitForFunction(urls => urls.every(url => !!window.swup?.cache.get(url)), [...targets.articles,...targets.menu], {timeout:15000});
}
(async () => {
  browser = await chromium.launch({headless:true,channel:process.env.BROWSER_CHANNEL || 'chrome',args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    for (const device of ['Pixel 7','iPhone 13']) await check(`${device}: preload after the covers and workshop, reuse article HTML/cover`, async () => {
      const {context,page,requests,errors} = await create(device);
      try {
        await page.goto(base+'/', {waitUntil:'domcontentloaded'});
        const targets = await expected(page);
        assert.equal(targets.articles.length,5);
        await ready(page,targets);
        await page.waitForFunction(() => performance.getEntriesByType('resource').filter(r=>r.name.includes('/novel/covers/')).length===4);
        const audit = await page.evaluate(() => window.__preloadAudit);
        assert.equal(audit.requests.length,targets.articles.length);
        assert.ok(audit.requests[0].coversReady && audit.requests[0].workshopReady,JSON.stringify(audit));
        assert.ok(audit.maxActive<=2,JSON.stringify(audit));
        assert.equal(requests.filter(r=>/\/novel\/covers\//.test(r.url)).length,4);
        assert.ok(!requests.some(r=>/\.epub|\/novel\/animations\/|aplayer|music-uploads|\/music\//i.test(r.url)));
        await page.evaluate(() => {window.initMobilePage();window.initMobilePage();});
        await page.waitForTimeout(100);
        assert.equal(await page.evaluate(() => window.__preloadAudit.requests.length),targets.articles.length);
        const first = targets.articles[0];
        const htmlCount = () => requests.filter(r=>new URL(r.url).pathname===first && r.type==='Fetch').length;
        const coverCount = () => requests.filter(r=>r.url===targets.firstCover).length;
        const before = {html:htmlCount(),cover:coverCount()};
        await page.locator('.m-home-track article:not(.home-pinned-card) .article-image a').first().tap();
        await page.waitForURL(url=>url.pathname===first);
        await page.locator('.article-content').waitFor();
        await page.waitForTimeout(100);
        assert.equal(htmlCount(),before.html);
        assert.equal(coverCount(),before.cover);
        assert.equal(before.html,1);
        const textLength = await page.locator('.article-content').evaluate(el=>el.textContent.length);
        assert.ok(textLength>1000);
        await page.evaluate(() => window.swup.navigate('/'));
        await page.waitForFunction(() => document.body.classList.contains('home-page'));
        await ready(page,targets);
        await page.reload({waitUntil:'domcontentloaded'});
        await ready(page,targets);
        const afterReload = await page.locator('#page-loader').evaluate(el=>el.classList.contains('hidden'));
        assert.equal(afterReload,true);
        assert.deepEqual(errors,[]);
        return {articleCount:targets.articles.length,menu:targets.menu,firstRequest:audit.requests[0],maxArticleConcurrency:audit.maxActive,novelCovers:4,articleNavigationRequests:before,textLength,reloadWithoutOpening:true,errors};
      } finally {await context.close();}
    });
    await check('local pagination warms the newly visible articles', async () => {
      const {context,page,errors} = await create('Pixel 7');
      try {
        await page.goto(base+'/', {waitUntil:'domcontentloaded'});
        const first = await expected(page);
        assert.equal(first.articles.length,5);
        await ready(page,first);
        assert.equal(await page.evaluate(() => window.__preloadAudit.requests.length),first.articles.length);
        await page.locator('#local-pagination [data-goto="2"]').click();
        await page.waitForFunction(() => document.querySelector('.m-home-track [data-mobile-page="2"]').getAttribute('aria-hidden')==='false');
        const second = await expected(page);
        assert.ok(second.articles.length && second.articles.every(url=>!first.articles.includes(url)));
        await ready(page,second);
        const articleRequests=first.articles.length+second.articles.length;
        assert.equal(await page.evaluate(() => window.__preloadAudit.requests.length),articleRequests);
        await page.reload({waitUntil:'domcontentloaded'});
        await ready(page,second);
        assert.deepEqual(await page.evaluate(() => window.__preloadAudit.requests.map(request=>request.url)),second.articles);
        assert.deepEqual(errors,[]);
        return {firstGroup:first.articles.length,secondGroup:second.articles.length,articleRequests,restoredGroupRequests:second.articles.length,errors};
      } finally {await context.close();}
    });
    await check('avatar still loading: article preloads start before load and opening completion', async () => {
      const {context,page,requests,errors} = await create('Pixel 7');
      try {
        await page.route('**/image/fish*', async route => {await new Promise(resolve=>setTimeout(resolve,4000));await route.continue().catch(()=>{});});
        await page.goto(base+'/', {waitUntil:'domcontentloaded'});
        const targets = await expected(page);
        await ready(page,targets);
        const state = await page.evaluate(() => ({audit:window.__preloadAudit,avatarComplete:document.querySelector('img[src*="fish"]').complete,state:document.readyState,loaderHidden:document.querySelector('#page-loader').classList.contains('hidden')}));
        assert.equal(state.avatarComplete,false);
        assert.equal(state.state,'interactive');
        assert.equal(state.loaderHidden,false);
        assert.ok(requests.some(r=>r.url.endsWith('/workshop/catalog.json')));
        assert.ok(!requests.some(r=>r.url.includes('/novel/covers/')));
        assert.ok(state.audit.requests[0].introReady&&!state.audit.requests[0].introHidden);
        assert.deepEqual(errors,[]);
        return state;
      } finally {await context.close();}
    });
    for (const device of [null,'Pixel 7']) await check((device || 'desktop')+': active covers precede the workshop and article HTML', async () => {
      const {context,page,requests,errors} = await create(device);
      let release;
      const held = new Promise(resolve=>{release=resolve;});
      let releaseCatalog;
      const catalogHeld = new Promise(resolve=>{releaseCatalog=resolve;});
      let releaseWorkshop;
      const workshopHeld = new Promise(resolve=>{releaseWorkshop=resolve;});
      try {
        await page.route('**/workshop/catalog.json', async route => { await catalogHeld; await route.continue(); });
        await page.route(base+'/prints/', async route => { await workshopHeld; await route.continue(); });
        await page.route('**/p/*/*.webp', async route => {
          await held;
          // An image error should release the queue just like a decoded cover.
          if (device && route.request().url().endsWith('/lighthouse.webp')) await route.abort();
          else await route.continue();
        });
        await page.goto(base+'/',{waitUntil:'domcontentloaded'});
        await page.waitForFunction(()=>window.swupReady && document.querySelector('.home-article-list .article-image img[loading="eager"]'));
        const workshopPage = r => r.type==='Fetch' && new URL(r.url).pathname==='/prints/';
        const workshop = r => r.url.endsWith('/workshop/catalog.json') || r.url.includes('/ts/print-workshop.') || workshopPage(r);
        const videoPath = '/prints/expedition-33/scene-loop-'+(device ? 'portrait' : 'wide')+'-stream-v1.mp4';
        const video = r => new URL(r.url).pathname===videoPath;
        const article = r => r.type==='Fetch' && new URL(r.url).pathname.startsWith('/p/');
        assert.ok(requests.some(r=>r.type==='Image' && r.url.includes('/p/')));
        assert.ok(!requests.some(r=>workshop(r) || article(r) || video(r)));
        const catalogRequest = page.waitForRequest(r=>r.url().endsWith('/workshop/catalog.json'));
        const videoRequest = page.waitForRequest(r=>new URL(r.url()).pathname===videoPath);
        release();
        await Promise.all([catalogRequest,videoRequest]);
        assert.ok(requests.findIndex(workshopPage)>=0 && requests.findIndex(workshopPage)<requests.findIndex(video));
        assert.equal(await page.evaluate(()=>window.swup.cache.has('/prints/')),false);
        releaseWorkshop();
        await page.waitForFunction(()=>window.swup.cache.has('/prints/'));
        assert.ok(!requests.some(article));
        releaseCatalog();
        await page.waitForFunction(()=>window.__preloadAudit.requests.length>0);
        const firstArticle = requests.findIndex(article);
        assert.ok(firstArticle>0);
        assert.equal(requests.slice(0,firstArticle).filter(workshop).length,3);
        assert.deepEqual(errors,[]);
        return {workshopBeforeArticles:true,videoWhileWorkshopPending:true,failedCover:!!device};
      } finally {release();releaseCatalog();releaseWorkshop();await context.close();}
    });
    await check('one stalled cover releases the queue, then loads; home is fetched once before navigation', async () => {
      const {context,page,requests,errors} = await create('Pixel 7');
      let releaseCover;
      const held = new Promise(resolve=>{releaseCover=resolve;});
      try {
        await page.route('**/lighthouse.webp', async route=>{await held;await route.continue().catch(()=>{});});
        await Promise.all([
          page.waitForRequest(request=>request.url().endsWith('/scene-loop-portrait-stream-v1.mp4')),
          page.goto(base+'/',{waitUntil:'domcontentloaded'})
        ]);
        const cover = '.m-home-track [aria-hidden="false"] img[src$="/lighthouse.webp"]';
        assert.equal(await page.locator(cover).evaluate(image=>image.complete),false);
        const homeRequests = requests.filter(request=>request.url===base+'/');
        assert.deepEqual(homeRequests.map(request=>request.type),['Document']);
        releaseCover();
        await page.waitForFunction(selector=>document.querySelector(selector)?.naturalWidth>0,cover);
        await page.evaluate(()=>{window.__sameHomeDocument = true;});
        await page.locator('.m-home-track [aria-hidden="false"] .home-pinned-card .article-image a').tap();
        await page.locator('[data-workshop="catalog"]').waitFor();
        await page.goBack({waitUntil:'commit'});
        await page.locator('.m-home-track [aria-hidden="false"]').waitFor();
        assert.equal(await page.evaluate(()=>window.__sameHomeDocument),true);
        assert.deepEqual(errors,[]);
        return {initialHomeRequests:homeRequests.length,coverLoadedAfterTimeout:true,swupBack:true};
      } finally {releaseCover();await context.close();}
    });
    await check('navigation cancels queued article work; failed preload retries on return', async () => {
      const {context,page,errors} = await create('Pixel 7');
      let failedUrl;
      try {
        await page.route('**/p/*/', async route => {
          await new Promise(resolve=>setTimeout(resolve,600));
          if (!failedUrl) {failedUrl=new URL(route.request().url()).pathname;await route.fulfill({status:503,body:'temporary fixture failure'});}
          else await route.continue().catch(()=>{});
        });
        await page.goto(base+'/', {waitUntil:'domcontentloaded'});
        const targets = await expected(page);
        await page.waitForFunction(() => window.__preloadAudit.requests.length===2);
        await page.evaluate(() => window.swup.navigate('/novel/'));
        await page.waitForFunction(() => !!document.querySelector('.novel-bookshelf'));
        await page.waitForTimeout(850);
        const whileAway = await page.evaluate(() => window.__preloadAudit.requests.length);
        assert.equal(whileAway,2);
        assert.ok(failedUrl);
        assert.equal(await page.evaluate(url=>!!window.swup.cache.get(url),failedUrl),false);
        await page.evaluate(() => window.swup.navigate('/'));
        await page.waitForFunction(() => document.body.classList.contains('home-page'));
        await ready(page,targets);
        const audit = await page.evaluate(() => window.__preloadAudit);
        assert.equal(audit.requests.filter(r=>r.url===failedUrl).length,2);
        assert.deepEqual(errors,[]);
        return {articleRequestsWhileAway:whileAway,failedUrl,retriedOnReturn:true,totalArticleRequests:audit.requests.length,errors};
      } finally {await context.close();}
    });
    await check('desktop warms the current group, reuses HTML, and limits shelf covers', async () => {
      const {context,page,requests,errors} = await create();
      try {
        await page.goto(base+'/', {waitUntil:'domcontentloaded'});
        const articles = group => page.locator('main > [data-page="'+group+'"] article:not(.home-pinned-card) .article-title a').evaluateAll(links=>links.map(a=>a.pathname));
        const first = await articles(1), next = await articles(2);
        await ready(page,{articles:first,menu:['/novel/','/prints/']});
        await page.waitForFunction(() => performance.getEntriesByType('resource').filter(r=>r.name.includes('/novel/covers/')).length>=8);
        assert.equal(await page.evaluate(() => window.__preloadAudit.requests.length),first.length);
        assert.equal(requests.filter(r=>/\/novel\/covers\//.test(r.url)).length,8);
        await page.locator('#local-pagination [data-goto="2"]').click();
        await ready(page,{articles:next,menu:[]});
        const article = next[0];
        await page.locator('main > [data-page="2"] .article-title a').first().click();
        await page.waitForURL(url=>url.pathname===article);
        await page.locator('.article-content').waitFor();
        assert.equal(requests.filter(r=>r.type==='Fetch'&&new URL(r.url).pathname===article).length,1);
        assert.deepEqual(errors,[]);
        return {firstGroup:first.length,nextGroup:next.length,articleFetchesOnClick:0,novelCovers:8,errors};
      } finally {await context.close();}
    });
    for (const mode of ['saveData','3g','hidden']) await check(mode+': pause background work and resume when conditions improve', async () => {
      const {context,page,requests,errors} = await create(mode==='3g' ? 'Pixel 7' : undefined, mode);
      try {
        await page.goto(base+'/',{waitUntil:'load'});
        await page.waitForFunction(()=>!!window.swup);
        await page.waitForTimeout(300);
        const speculative = requests.filter(r=>r.type==='Fetch'||/\/novel\/covers\/|\/novel\/animations\/|\/ts\/print-workshop/.test(r.url));
        assert.deepEqual(speculative,[]);
        await page.evaluate(mode=>{
          window.__restricted=false;
          if (mode==='hidden') document.dispatchEvent(new Event('visibilitychange'));
          else navigator.connection.dispatchEvent(new Event('change'));
        },mode);
        await ready(page,{articles:[],menu:['/novel/','/prints/']});
        await page.waitForFunction(()=>window.__preloadAudit.requests.length>0);
        assert.deepEqual(errors,[]);
        return {backgroundRequests:0,resumed:true,errors};
      } finally {await context.close();}
    });
    await check('data saver: opening a cold workshop loads data on demand', async () => {
      const {context,page,requests,errors} = await create('Pixel 7','saveData');
      try {
        await page.goto(base+'/',{waitUntil:'load'});
        assert.ok(!requests.some(r=>r.url.includes('/ts/print-workshop')));
        await page.locator('.m-home-track [data-mobile-page="1"] article:first-child .article-image a[href$="/prints/"]').tap();
        await page.locator('.wk-card').first().waitFor();
        const catalogFetches = requests.filter(r=>r.url.endsWith('/workshop/catalog.json')).length;
        assert.equal(catalogFetches,1);
        assert.ok(!requests.some(r=>/\.webm|\/prints\/detail\//.test(r.url)));
        assert.deepEqual(errors,[]);
        return {catalogFetches,errors};
      } finally {await context.close();}
    });
    await check('no network hints or idle API: idle fallback and buffered desktop shelf entry', async () => {
      const {context,page,requests,errors} = await create(undefined,'no-hints');
      try {
        await page.goto(base+'/',{waitUntil:'load'});
        await page.waitForFunction(()=>window.__warmVideoEl?.readyState===4);
        await page.evaluate(()=>window.__expectedVideo=window.__warmVideoEl);
        await page.locator('#main-menu a[href$="/novel/"]').click();
        await page.waitForFunction(()=>document.querySelector('#bookshelf-intro video')===window.__expectedVideo);
        await page.locator('#bookshelf-intro').click();
        await page.locator('.novel-bookshelf.is-revealed').waitFor();
        assert.equal(requests.filter(r=>r.type==='Fetch'&&new URL(r.url).pathname==='/novel/').length,1);
        assert.deepEqual(errors,[]);
        return {reusedVideo:true,shelfHtmlFetches:1,errors};
      } finally {await context.close();}
    });
  } finally {await browser.close();}
  process.exitCode = results.some(r=>r.status==='failed') ? 1 : 0;
})().catch(error=>{console.error(error);process.exitCode=1;});
