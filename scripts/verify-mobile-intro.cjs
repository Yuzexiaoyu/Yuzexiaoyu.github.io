/* Verify the mobile word wall's phase, lifecycle and desktop isolation. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:1313';
const out = process.argv[3] || '.mobile-validation/mobile-intro';
const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
  const results = [];
  try {
    for (const [width, height] of [[320, 480], [390, 844], [430, 932], [844, 390], [768, 1024]]) {
      const page = await browser.newPage({ viewport: { width, height }, isMobile: true, hasTouch: true, userAgent: ua });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://**', route => route.abort());
      await page.clock.install({ time: new Date('2026-11-09T08:00:00Z') });
      await page.clock.pauseAt(new Date('2026-11-09T08:00:01Z'));
      await page.goto(base, { waitUntil: 'load' });
      const initial = await page.evaluate(async () => {
        const loader = document.querySelector('#page-loader');
        const rows = [...loader.querySelectorAll('.m-intro-row')];
        const word = loader.querySelector('.m-intro-text');
        const matrix = new DOMMatrix(getComputedStyle(loader.querySelector('.loader')).transform);
        const rowPitch = Math.ceil(word.offsetHeight * 1.65 + 6);
        window.__introTestAnimations = loader.getAnimations({ subtree: true });
        window.__introTestAnimations.forEach(animation => animation.pause());
        await Promise.all(window.__introTestAnimations.map(animation => animation.ready));
        return {
          ready: loader.classList.contains('m-intro-ready'),
          rows: rows.length, words: loader.querySelectorAll('.m-intro-text').length,
          deferred: loader.querySelectorAll('.m-intro-offscreen').length,
          rotation: Math.atan2(matrix.b, matrix.a) * 180 / Math.PI,
          duration: 1550 + Math.ceil((innerWidth + innerHeight) / Math.SQRT2 / (2 * rowPitch)) * 18 + 460,
          revealDelays: rows.map(row => getComputedStyle(row.firstElementChild).animationDelay),
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      assert.equal(initial.ready, true);
      assert.ok(initial.rows > 1 && initial.deferred > 0);
      assert.ok(Math.abs(initial.rotation - 45) < .001);
      assert.equal(initial.overflow, false);

      const phases = [1200, 1300, 1550, 1650, 1770, 1900, 2050];
      for (const phase of phases) {
        const equal = await page.evaluate(time => {
          window.__introTestAnimations.forEach(animation => { animation.currentTime = time; });
          const reference = document.querySelector('.m-intro-text:not(.m-intro-offscreen)');
          const values = (element, pseudo) => {
            const matrix = new DOMMatrix(getComputedStyle(element, pseudo).transform);
            return [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f];
          };
          return [...document.querySelectorAll('.m-intro-offscreen')].every(word => ['::before', '::after'].every(pseudo => {
            const expected = values(reference, pseudo);
            return values(word, pseudo).every((value, index) => Math.abs(value - expected[index]) < .0001);
          }));
        }, phase);
        assert.equal(equal, true, `${width}x${height}: color phase at ${phase}ms`);
      }

      await page.reload({ waitUntil: 'load' });
      await page.clock.fastForward(initial.duration - 1);
      assert.equal(await page.locator('#page-loader').evaluate(element => element.classList.contains('hidden')), false);
      await page.clock.fastForward(1);
      const fade = await page.locator('#page-loader').evaluate(element => {
        const wordmark = element.querySelector('.m-intro-wordmark');
        return { hidden: element.classList.contains('hidden'), wordmark: getComputedStyle(wordmark).display, animations: wordmark.getAnimations({ subtree: true }).length };
      });
      assert.deepEqual(fade, { hidden: true, wordmark: 'none', animations: 0 });
      await page.clock.fastForward(300);
      assert.equal(await page.locator('#page-loader').evaluate(element => getComputedStyle(element).display), 'none');
      assert.deepEqual(errors, []);
      results.push({ size: [width, height], status: 'passed', initial, phaseChecks: phases.length, fade });
      await page.close();
    }

    const desktop = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    await desktop.route('https://**', route => route.abort());
    await desktop.goto(base, { waitUntil: 'domcontentloaded' });
    const original = await desktop.evaluate(() => {
      const word = document.querySelector('#page-loader .loader > .glitch');
      return { fontSize: getComputedStyle(word).fontSize, animation: getComputedStyle(word).animationName, mobile: getComputedStyle(document.querySelector('.m-intro-wordmark')).display };
    });
    assert.deepEqual(original, { fontSize: '60px', animation: 'shift', mobile: 'none' });
    results.push({ case: 'desktop animation', status: 'passed', original });
    await desktop.close();

    const search = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: ua });
    await search.route('https://**', route => route.abort());
    await search.goto(new URL('/search/', base).href, { waitUntil: 'load' });
    assert.equal(await search.locator('#page-loader').evaluate(element => getComputedStyle(element).display), 'none');
    assert.equal(await search.locator('body.template-search').count(), 1);
    results.push({ case: 'mobile non-home route', status: 'passed' });
    await search.close();

    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ browser: browser.version(), results }, null, 2));
    console.log(JSON.stringify({ passed: results.length, mobileSizes: 5, colorPhaseChecks: 35, results: path.join(out, 'results.json') }));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
