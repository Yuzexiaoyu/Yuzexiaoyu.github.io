/* Run against the Hugo site with local media. */
const assert = require('node:assert/strict');
const {after, before, test} = require('node:test');
const {chromium, devices} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://localhost:48174';
const topic = base + '/prints/expedition-33/';
let browser;

before(async () => { browser = await chromium.launch({channel:'chrome'}); });
after(async () => { await browser?.close(); });

async function playing(page, suffix) {
  await page.waitForFunction(suffix => {
    const video = document.querySelector('[data-topic-video]');
    return video?.currentSrc.endsWith(suffix) && video.currentTime > .2 &&
      !video.paused && video.videoWidth > 0 && video.classList.contains('is-playing');
  },suffix,{timeout:15000});
}

test('direct mobile entry plays without the workshop bundle or catalog and rotates in place', async () => {
  const page = await browser.newPage(devices['iPhone 13']);
  const unnecessary = [];
  try {
    await page.route(/\/ts\/print-workshop\.|\/workshop\/catalog\.json/, route => {
      unnecessary.push(route.request().url());
      return route.abort();
    });
    await page.goto(topic);
    await playing(page,'scene-loop-portrait-stream-v1.mp4');
    assert.equal(await page.locator('[data-topic-video]').evaluate(v=>v.videoHeight),1280);
    await page.setViewportSize({width:844,height:390});
    await playing(page,'scene-loop-wide-stream-v1.mp4');
    assert.deepEqual(unnecessary,[]);
  } finally { await page.close(); }
});

test('home starts the video while workshop HTML is pending, reuses it and releases playback on return', async () => {
  const page = await browser.newPage(devices['Pixel 7']);
  let releaseWorkshop;
  const held = new Promise(resolve => { releaseWorkshop = resolve; });
  const requests = [];
  try {
    page.on('request', request => requests.push(new URL(request.url()).pathname));
    await page.route(base+'/prints/', async route => {
      await held;
      await route.continue().catch(() => {});
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator.connection, 'effectiveType', {get:()=> '4g'});
      const src = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {...src, set(url) {
        if (this instanceof HTMLVideoElement && url.includes('scene-loop-portrait-stream-v1.mp4')) {
          (window.topicVideoStarts ??= []).push({
            element:this, path:location.pathname, preload:this.preload,
            coversReady:[...document.querySelectorAll('.m-home-track [aria-hidden="false"] .article-image img')]
              .every(img=>img.complete && img.naturalWidth > 0),
            workshopCached:!!window.swup.cache.get('/prints/')
          });
        }
        src.set.call(this, url);
      }});
    });
    await Promise.all([
      page.waitForRequest(request => request.url().endsWith('/scene-loop-portrait-stream-v1.mp4')),
      page.goto(base+'/',{waitUntil:'domcontentloaded'})
    ]);
    await page.waitForFunction(()=>window.swupReady);
    await page.waitForFunction(()=>window.topicVideoStarts?.length);
    const workshopRequest = requests.indexOf('/prints/');
    assert.ok(workshopRequest >= 0 && workshopRequest < requests.indexOf('/prints/expedition-33/scene-loop-portrait-stream-v1.mp4'));
    assert.ok(!requests.includes('/prints/expedition-33/'));
    assert.deepEqual(await page.evaluate(()=>{
      const {path, preload, coversReady, workshopCached} = window.topicVideoStarts[0];
      return {path, preload, coversReady, workshopCached};
    }), {path:'/', preload:'metadata', coversReady:true, workshopCached:false});
    releaseWorkshop();
    await page.waitForFunction(()=>window.swup.cache.get('/prints/'));
    await page.locator('.m-home-track [aria-hidden="false"] .home-pinned-card .article-image a').tap();
    await page.waitForFunction(()=>window.topicVideoStarts?.[0]?.element.preload === 'auto');
    await page.waitForFunction(()=>window.swup.cache.get('/prints/expedition-33/'));
    await page.locator('.wk-topic-card').tap();
    await playing(page,'scene-loop-portrait-stream-v1.mp4');
    assert.ok(await page.locator('[data-topic-video]').evaluate(video =>
      window.topicVideoStarts.length === 1 && window.topicVideoStarts[0].element === video
    ));
    await page.waitForFunction(()=>document.querySelector('[data-topic-music]')?.currentTime>.2);
    const video = await page.locator('[data-topic-video]').elementHandle();
    const music = await page.locator('[data-topic-music]').elementHandle();
    await page.locator('.wk-topic-inner a').tap();
    await page.locator('.wk-topic-card').waitFor();
    for (const media of [video,music]) assert.ok(await media.evaluate(el=>el.paused && !el.hasAttribute('src')));
  } finally { releaseWorkshop(); await page.close(); }
});

test('desktop uses the compact wide source; mobile can retry another format on the same origin', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(topic);
    await playing(page,'scene-loop-wide-stream-v1.mp4');
  } finally { await page.close(); }

  const mobile = await browser.newPage(devices['iPhone 13']);
  const failures = new Set();
  try {
    await mobile.route('**/scene-loop-portrait-stream-v1.mp4',route=>{
      failures.add(new URL(route.request().url()).pathname.split('.').pop());
      return route.abort();
    });
    await mobile.goto(topic);
    await playing(mobile,'scene-loop-portrait-2x.webm');
    assert.equal(await mobile.locator('video').evaluate(v=>new URL(v.currentSrc).origin),new URL(base).origin);
    assert.deepEqual([...failures],['mp4']);
  } finally { await mobile.close(); }
});

test('the workshop topic is usable while its catalog and bundle requests are still pending', async () => {
  const page = await browser.newPage(devices['iPhone 13']);
  let release;
  const held = new Promise(resolve => { release = resolve; });
  try {
    await page.route(/\/ts\/print-workshop\.|\/workshop\/catalog\.json/, async route => {
      await held;
      await route.continue().catch(() => {});
    });
    await page.goto(base+'/prints/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.swupReady);
    assert.equal(await page.locator('[data-workshop-item]').count(),0);
    assert.equal(await page.evaluate(()=>typeof window.WorkshopApp),'undefined');
    const lead = page.locator('[data-catalog-lead="work"]');
    await lead.waitFor({state:'visible'});
    await page.waitForFunction(()=>document.querySelector('[data-catalog-lead="work"] img')?.naturalWidth>0);
    assert.match(await lead.getAttribute('href'),/\/prints\/detail\/\?id=/);
    await page.locator('.wk-topic-card').tap();
    await playing(page,'scene-loop-portrait-stream-v1.mp4');
    await page.waitForFunction(()=>document.querySelector('[data-topic-music]')?.currentTime>.2);
    assert.match(await page.locator('[data-topic-music]').evaluate(audio=>audio.currentSrc),/\/lumiere-aac-v1\.m4a$/);
  } finally { release(); await page.close(); }
});

test('the stock lead keeps its card and cover when priced; item video waits for a click', async () => {
  const page = await browser.newPage(devices['Pixel 7']);
  let releaseCatalog;
  const held = new Promise(resolve => { releaseCatalog = resolve; });
  const isItemVideo = request => /\/workshop\/media\/[^/]+\.mp4$/.test(request.url());
  const media = [];
  try {
    await page.addInitScript(()=>{
      Object.defineProperty(navigator.connection,'effectiveType',{get:()=> '4g'});
    });
    page.on('request',request=>{if(isItemVideo(request)) media.push(request.url());});
    await page.route('**/workshop/catalog.json',async route=>{
      await held;
      await route.continue().catch(()=>{});
    });
    await page.goto(base+'/prints/?tab=product',{waitUntil:'domcontentloaded'});
    const seed = page.locator('[data-catalog-lead="product"]');
    await seed.waitFor({state:'visible'});
    assert.equal(await page.locator('[data-catalog-lead="work"]').isVisible(),false);
    await page.waitForFunction(()=>document.querySelector('[data-catalog-lead="product"] img')?.naturalWidth>0);
    await seed.evaluate(card=>{window.__catalogLead={card,cover:card.querySelector('img')};});
    releaseCatalog();

    const item = page.locator('[data-workshop-item]').first();
    await item.waitFor({state:'visible'});
    assert.ok(await item.evaluate(card=>card===window.__catalogLead.card &&
      card.querySelector('img')===window.__catalogLead.cover && !!card.querySelector('.wk-card-price').textContent.trim()));
    const detail = await item.evaluate(card=>card.pathname+card.search);
    await item.focus();
    await page.waitForFunction(href=>window.swup.cache.has(href),detail);
    assert.deepEqual(media,[]);

    await Promise.all([page.waitForRequest(isItemVideo),item.tap()]);
    await page.locator('[data-stage-video]').waitFor({state:'attached'});
    assert.ok((await page.locator('[data-stage-video]').getAttribute('src')).endsWith('.mp4'));
  } finally {releaseCatalog();await page.close();}
});

test('switching to 3G cancels pending background media but the chosen topic can still play', async () => {
  const page = await browser.newPage(devices['Pixel 7']);
  let releaseVideo;
  const held = new Promise(resolve=>{releaseVideo=resolve;});
  const portrait = '**/scene-loop-portrait-stream-v1.mp4';
  try {
    await page.addInitScript(()=>{
      window.__networkForTopic='4g';
      Object.defineProperty(navigator.connection,'effectiveType',{get:()=>window.__networkForTopic});
      const src=Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype,'src');
      Object.defineProperty(HTMLMediaElement.prototype,'src',{...src,set(url){
        if(this instanceof HTMLVideoElement && String(url).includes('scene-loop-portrait-stream-v1.mp4')) window.__firstTopicVideo ??= this;
        src.set.call(this,url);
      }});
    });
    await page.route(portrait,async route=>{await held;await route.continue().catch(()=>{});});
    await Promise.all([page.waitForRequest(portrait),page.goto(base+'/',{waitUntil:'domcontentloaded'})]);
    await page.evaluate(()=>{
      window.__networkForTopic='3g';
      navigator.connection.dispatchEvent(new Event('change'));
    });
    await page.waitForFunction(()=>window.__firstTopicVideo && !window.__firstTopicVideo.hasAttribute('src'));
    releaseVideo();
    await page.locator('.m-home-track [aria-hidden="false"] .home-pinned-card .article-image a').tap();
    await page.locator('.wk-topic-card').tap();
    await playing(page,'scene-loop-portrait-stream-v1.mp4');
  } finally {releaseVideo();await page.close();}
});

test('a failed background can be retried from its poster', async () => {
  const page = await browser.newPage(devices['Pixel 7']);
  try {
    const media = /scene-loop-portrait-(?:stream-v1|2x)\.(mp4|webm)$/;
    await page.route(media,route=>route.abort());
    await page.goto(topic);
    const retry = page.getByRole('button',{name:'播放背景视频'});
    await retry.waitFor();
    assert.ok(await page.locator('[data-topic-poster]').isVisible());
    await page.unroute(media);
    await retry.tap();
    await playing(page,'scene-loop-portrait-stream-v1.mp4');
    assert.ok(await retry.isHidden());
  } finally { await page.close(); }
});

test('a tap starts the background when the browser denies autoplay', async () => {
  const page = await browser.newPage(devices['iPhone 13']);
  try {
    await page.addInitScript(() => {
      const play = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function () {
        if (this.matches('[data-topic-video]') && !navigator.userActivation.isActive) {
          this.autoplay = false;
          return Promise.reject(new DOMException('Gesture required','NotAllowedError'));
        }
        return play.call(this);
      };
    });
    await page.goto(topic);
    await page.getByRole('button',{name:'播放背景视频'}).tap();
    await playing(page,'scene-loop-portrait-stream-v1.mp4');
  } finally { await page.close(); }
});
