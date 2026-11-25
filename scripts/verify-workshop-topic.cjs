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
    await playing(page,'scene-loop-portrait-2x.mp4');
    assert.equal(await page.locator('[data-topic-video]').evaluate(v=>v.videoHeight),1920);
    await page.setViewportSize({width:844,height:390});
    await playing(page,'scene-loop-4k-2x.mp4');
    assert.deepEqual(unnecessary,[]);
  } finally { await page.close(); }
});

test('catalog navigation starts video and music and releases both on return', async () => {
  const page = await browser.newPage(devices['Pixel 7']);
  try {
    await page.goto(base+'/prints/');
    await page.waitForFunction(()=>window.swupReady);
    await page.locator('.wk-topic-card').tap();
    await playing(page,'scene-loop-portrait-2x.mp4');
    await page.waitForFunction(()=>document.querySelector('[data-topic-music]')?.currentTime>.2);
    const video = await page.locator('[data-topic-video]').elementHandle();
    const music = await page.locator('[data-topic-music]').elementHandle();
    await page.locator('.wk-topic-inner a').tap();
    await page.locator('.wk-topic-card').waitFor();
    for (const media of [video,music]) assert.ok(await media.evaluate(el=>el.paused && !el.hasAttribute('src')));
  } finally { await page.close(); }
});

test('desktop keeps the wide source, mobile recovers from both CDN formats failing', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(topic);
    await playing(page,'scene-loop-4k-2x.webm');
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
    await playing(mobile,'scene-loop-portrait-2x.mp4');
    assert.equal(await mobile.locator('video').evaluate(v=>new URL(v.currentSrc).origin),new URL(base).origin);
    assert.deepEqual([...failures],['mp4','webm']);
  } finally { await mobile.close(); }
});

test('a failed background can be retried from its poster', async () => {
  const page = await browser.newPage(devices['Pixel 7']);
  try {
    const media = /scene-loop-portrait-2x\.(mp4|webm)$/;
    await page.route(media,route=>route.abort());
    await page.goto(topic);
    const retry = page.getByRole('button',{name:'播放背景视频'});
    await retry.waitFor();
    assert.ok(await page.locator('[data-topic-poster]').isVisible());
    await page.unroute(media);
    await retry.tap();
    await playing(page,'scene-loop-portrait-2x.mp4');
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
    await playing(page,'scene-loop-portrait-2x.mp4');
  } finally { await page.close(); }
});
