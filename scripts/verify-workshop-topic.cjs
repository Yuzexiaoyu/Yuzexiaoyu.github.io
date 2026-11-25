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

test('home preloads the workshop before the topic, reuses the video and releases playback on return', async () => {
  const page = await browser.newPage(devices['Pixel 7']);
  try {
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
    await page.goto(base+'/');
    await page.waitForFunction(()=>window.swupReady);
    await page.waitForFunction(()=>window.swup.cache.get('/prints/'));
    await page.waitForFunction(()=>window.topicVideoStarts?.length);
    assert.deepEqual(await page.evaluate(()=>{
      const {path, preload, coversReady, workshopCached} = window.topicVideoStarts[0];
      return {path, preload, coversReady, workshopCached};
    }), {path:'/', preload:'metadata', coversReady:true, workshopCached:true});
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
  } finally { await page.close(); }
});

test('desktop uses the compact wide source; mobile retries the compact source on Pages', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(topic);
    await playing(page,'scene-loop-wide-stream-v1.mp4');
  } finally { await page.close(); }

  const mobile = await browser.newPage(devices['iPhone 13']);
  const failures = new Set();
  try {
    await mobile.route(topic,async route=>{
      const response = await route.fetch();
      const html = (await response.text()).replace(/(<source\b[^>]*?\bsrc=["']?)(?:https?:\/\/[^/"'\s>]+)?(\/prints\/expedition-33\/[^\s>"']+\.(?:mp4|webm))/gi,'$1https://media.invalid$2');
      await route.fulfill({response,body:html});
    });
    await mobile.route('https://media.invalid/**',route=>{
      failures.add(new URL(route.request().url()).pathname.split('.').pop());
      return route.abort();
    });
    await mobile.goto(topic);
    await playing(mobile,'scene-loop-portrait-stream-v1.mp4');
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
    await page.locator('.wk-topic-card').tap();
    await playing(page,'scene-loop-portrait-stream-v1.mp4');
    await page.waitForFunction(()=>document.querySelector('[data-topic-music]')?.currentTime>.2);
  } finally { release(); await page.close(); }
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
