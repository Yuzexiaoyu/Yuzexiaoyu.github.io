/* Compare the current mobile-enabled candidate with the saved pre-optimization build. */
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const before = process.argv[2] || 'http://127.0.0.1:13134';
const after = process.argv[3] || 'http://127.0.0.1:13135';
const out = process.argv[4] || '.mobile-validation/optimization-desktop';
fs.mkdirSync(out, { recursive: true });
const cases = [
  { width: 375, route: '/' }, { width: 768, route: '/' }, { width: 1440, route: '/' },
  { width: 375, route: '/novel/reader/#vol=01' }, { width: 1440, route: '/novel/reader/#vol=01' },
  { width: 1440, route: '/p/markdown基本语法/' }, { width: 1440, route: '/search/?keyword=数据' },
  { width: 1440, route: '/archives/' }, { width: 1440, route: '/novel/' }
];
(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
  const results = [];
  async function capture(base, fixture, label) {
    const page = await browser.newPage({ viewport: { width: fixture.width, height: 900 }, deviceScaleFactor: 1 });
    try {
      await page.route('https://**', route => route.abort());
      await page.addInitScript(() => { sessionStorage.setItem('bookshelf-notice-shown', '1'); window.__bookshelfIntroConsumed = true; });
      await page.goto(base + fixture.route, { waitUntil: 'load' });
      if (fixture.route.includes('/reader/')) await page.waitForFunction(() => document.querySelector('#reader-loading')?.style.display === 'none', null, { timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      // Lazy content below the viewport also determines the article's total height.
      await page.evaluate(async () => {
        const images = Array.from(document.querySelectorAll('img'));
        images.forEach(img => { img.loading = 'eager'; });
        await Promise.all(images.map(img => img.decode().catch(() => {})));
      });
      await page.waitForFunction(() => Array.from(document.querySelectorAll('img')).filter(img => {
        const rect = img.getBoundingClientRect(); return rect.width && rect.height && rect.top < innerHeight && rect.bottom > 0;
      }).every(img => img.complete && img.naturalWidth > 0), null, { timeout: 10000 });
      await page.waitForTimeout(2500);
      await page.evaluate(() => {
        document.querySelectorAll('video').forEach(video => video.pause());
        const title = document.querySelector('.search-result--title');
        if (title) title.textContent = title.textContent.replace(/[0-9]+(?:\.[0-9]+)?(?=\s*(?:秒|s))/g, '0');
      });
      await page.addStyleTag({ content: '#warp-canvas,#bgCanvas,.cursor-glow,#aplayer .aplayer-time-inner,.mini-time{visibility:hidden!important}*{transition:none!important}' });
      // Finish entrances and seek infinite decorative animations to the same timestamp.
      await page.evaluate(() => document.getAnimations().forEach(animation => {
        const timing = animation.effect.getComputedTiming();
        if (timing.iterations === Infinity) { animation.pause(); animation.currentTime = 0; }
        else animation.finish();
      }));
      const geometry = await page.evaluate(() => ({
        mode: document.documentElement.dataset.ui || null,
        elements: Array.from(document.querySelectorAll('.container.main-container,.site-name,.site-logo,main.main,.article-list>article,.right-sidebar,#aplayer,#reader-viewport,.reader-page')).slice(0, 20).map(el => {
          const rect = el.getBoundingClientRect(), style = getComputedStyle(el);
          return { selector: el.id || el.className, x: rect.x, y: rect.y, width: rect.width, height: rect.height, font: style.fontSize, weight: style.fontWeight, color: style.color, padding: style.padding, display: style.display };
        })
      }));
      const file = path.join(out, `${results.length}-${label}.png`);
      await page.screenshot({ path: file });
      return { geometry, pixels: await sharp(file).removeAlpha().raw().toBuffer() };
    } finally { await page.close(); }
  }
  function difference(a, b) {
    assert.equal(a.length, b.length);
    let maxChannelDelta = 0, changedPixels = 0;
    for (let i = 0; i < a.length; i += 3) {
      const delta = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
      if (delta) changedPixels++; maxChannelDelta = Math.max(maxChannelDelta, delta);
    }
    return { maxChannelDelta, changedPixels };
  }
  for (const fixture of cases) {
    if (process.env.DESKTOP_TEST_FILTER && !fixture.route.includes(process.env.DESKTOP_TEST_FILTER)) continue;
    try {
      const original = await capture(before, fixture, 'before');
      const repeated = await capture(before, fixture, 'repeat');
      const candidate = await capture(after, fixture, 'after');
      const noise = difference(original.pixels, repeated.pixels), change = difference(original.pixels, candidate.pixels);
      const detail = { fixture, noise, change, original: original.geometry, candidate: candidate.geometry };
      fs.writeFileSync(path.join(out, `${results.length}-detail.json`), JSON.stringify(detail, null, 2));
      assert.equal(candidate.geometry.mode, null);
      assert.deepEqual(candidate.geometry, original.geometry);
      assert.ok(change.maxChannelDelta <= Math.max(1, noise.maxChannelDelta) && (change.maxChannelDelta <= 1 || change.changedPixels <= noise.changedPixels), JSON.stringify({ noise, change }));
      results.push({ fixture, status: 'passed', noise, change });
    } catch (error) { results.push({ fixture, status: 'failed', error: error.stack }); }
    console.log(`${results.at(-1).status}: ${fixture.width} ${fixture.route}`);
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ browser: browser.version(), results }, null, 2));
  }
  await browser.close();
  process.exitCode = results.some(result => result.status === 'failed') ? 1 : 0;
})().catch(error => { console.error(error); process.exitCode = 1; });
