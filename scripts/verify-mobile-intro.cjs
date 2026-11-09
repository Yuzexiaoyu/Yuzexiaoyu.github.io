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

      // Compare the shortened skew timeline with the original loop, including
      // interpolation between keyframes and the reverse half of the animation.
      const skewMatches = await page.evaluate(async duration => {
        const reference = document.createElement('span');
        reference.className = 'glitch';
        reference.textContent = 'reference';
        reference.style.cssText = 'position:fixed;visibility:hidden';
        document.body.appendChild(reference);
        const original = reference.getAnimations().find(a => a.animationName === 'shift');
        const word = document.querySelector('.m-intro-text');
        const candidate = word.getAnimations().find(a => a.animationName === 'm-intro-shift');
        if (!candidate) { reference.remove(); return false; }
        original.pause();
        await original.ready;
        let equal = true;
        for (let time = 0; time <= duration; time += 7) {
          original.currentTime = candidate.currentTime = time;
          const a = new DOMMatrix(getComputedStyle(reference).transform);
          const b = new DOMMatrix(getComputedStyle(word).transform);
          if (['a', 'b', 'c', 'd', 'e', 'f'].some(key => Math.abs(a[key] - b[key]) > .00001)) { equal = false; break; }
        }
        reference.remove();
        return equal;
      }, initial.duration);
      assert.equal(skewMatches, true, `${width}x${height}: original skew timing`);

      // Advance the real retirement timers while seeking CSS animations. Retired
      // words must be wholly outside the screen and own no remaining animations.
      const retirement = [];
      let lastPhase = 0;
      for (const phase of [1610, 1650, 1750, 1850, 1950, 2050]) {
        await page.evaluate(time => window.__introTestAnimations.forEach(a => {
          if (a.playState !== 'idle') a.currentTime = time;
        }), phase);
        await page.clock.runFor(phase - lastPhase);
        lastPhase = phase;
        const snapshot = await page.evaluate(() => {
          const words = [...document.querySelectorAll('.m-intro-retired')];
          return {
            retired: words.length,
            active: document.querySelector('#page-loader').getAnimations({ subtree: true }).filter(a => a.effect.getComputedTiming().progress !== null && a.currentTime < a.effect.getComputedTiming().endTime).length,
            outside: words.every(word => {
              const r = word.getBoundingClientRect();
              return r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight;
            }),
            released: words.every(word => word.getAnimations({ subtree: true }).length === 0),
          };
        });
        assert.equal(snapshot.outside, true, `${width}x${height}: visible word retired at ${phase}ms`);
        assert.equal(snapshot.released, true);
        retirement.push({ phase, ...snapshot });
      }
      assert.ok(retirement.at(-1).retired > initial.words / 2);

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
      results.push({ size: [width, height], status: 'passed', initial, phaseChecks: phases.length, skewMatches, retirement, fade });
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
