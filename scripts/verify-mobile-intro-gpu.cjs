/* Compare the GPU's actual draw inputs against the browser's original CSS
 * interpolation, then verify fallback, interruption and resource cleanup. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:1313';
const out = process.argv[3] || '.mobile-validation/mobile-intro-gpu';
const ua = 'Mozilla/5.0 (Android 14; Mobile; rv:153.0) Gecko/153.0 Firefox/153.0';
const phases = [0,200,405,410,415,420,430,585,590,595,600,605,620,630,640,
  695,700,705,710,720,1000,1190,1200,1295,1300,1370,1400,1490,1550,1590,1600,1650,1770,1900,2050];
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
  const results = [], errors = [];
  const create = async (width, height, mode = 'gpu') => {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 3,
      isMobile: true, hasTouch: true, userAgent: ua });
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://**', route => route.abort());
    await page.addInitScript(mode => {
      window.__draw = { uniforms: {}, vertices: [], count: 0, uploads: 0 };
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        if (mode === 'no-webgl' && type === 'webgl') return null;
        return getContext.call(this, type, ...args);
      };
      if (mode === 'no-spacing') delete CanvasRenderingContext2D.prototype.letterSpacing;
      const p = WebGLRenderingContext.prototype, names = new WeakMap();
      const location = p.getUniformLocation, uniform = p.uniform2f, data = p.bufferData;
      const draw = p.drawArrays, upload = p.texImage2D, compile = p.getShaderParameter;
      p.getShaderParameter = function(shader, name) {
        return mode === 'shader-failure' && name === this.COMPILE_STATUS ? false : compile.call(this, shader, name);
      };
      p.getUniformLocation = function(...args) {
        const value = location.apply(this, args); if (value) names.set(value, args[1]); return value;
      };
      p.uniform2f = function(location, x, y) {
        window.__draw.uniforms[names.get(location)] = [x,y]; return uniform.call(this, location, x, y);
      };
      p.bufferData = function(target, vertices, ...args) {
        if (ArrayBuffer.isView(vertices)) window.__draw.vertices = Array.from(vertices);
        return data.call(this, target, vertices, ...args);
      };
      p.drawArrays = function(...args) { window.__draw.count = args[2]; return draw.apply(this, args); };
      p.texImage2D = function(...args) {
        window.__draw.uploads++;
        const source = args.at(-1);
        window.__draw.texture = [source.width / (devicePixelRatio * 2), source.height / (devicePixelRatio * 2)];
        return upload.apply(this, args);
      };
    }, mode);
    await page.clock.install({ time: new Date('2026-11-09T08:00:00Z') });
    await page.clock.pauseAt(new Date('2026-11-09T08:00:01Z'));
    await page.goto(base, { waitUntil: 'load' });
    return page;
  };
  const pause = page => page.evaluate(async () => {
    window.hidePageLoader = () => {};
    window.__animations = document.querySelector('#page-loader').getAnimations({ subtree: true });
    window.__animations.forEach(a => a.pause());
    await Promise.all(window.__animations.map(a => a.ready));
  });
  const seek = async (page, time) => {
    await page.evaluate(t => window.__animations.forEach(a => { a.currentTime = t; }), time);
    await page.clock.runFor(20);
  };
  try {
    for (const [width,height] of [[320,480],[390,844],[430,932],[844,390],[500,939]]) {
      const gpu = await create(width,height), css = await create(width,height,'no-webgl');
      const initial = await gpu.evaluate(() => ({
        cached: document.querySelector('#page-loader').classList.contains('m-intro-cached'),
        words: document.querySelectorAll('.m-intro-text').length,
        animations: document.querySelector('#page-loader').getAnimations({ subtree: true }).map(a => a.id),
        resolution: [document.querySelector('.m-intro-surface')?.width, document.querySelector('.m-intro-surface')?.height],
      }));
      assert.equal(initial.cached, true); assert.equal(initial.words, 1);
      assert.deepEqual(initial.animations, ['mobile-intro-clock']);
      assert.deepEqual(initial.resolution, [width * 3, height * 3]);
      await pause(gpu); await pause(css);
      for (const time of phases) {
        await seek(gpu,time); await seek(css,time);
        const actual = await gpu.evaluate(() => window.__draw);
        const expected = await css.evaluate(() => {
          const word = document.querySelector('.m-intro-text:not(.m-intro-offscreen)');
          const matrix = new DOMMatrix(getComputedStyle(word).transform);
          const offset = pseudo => { const m = new DOMMatrix(getComputedStyle(word,pseudo).transform); return [m.e,m.f]; };
          const centers = [];
          document.querySelectorAll('.m-intro-row').forEach(row => {
            const line = row.firstElementChild, rs = getComputedStyle(row), ls = getComputedStyle(line);
            const r = new DOMMatrix(rs.transform), l = new DOMMatrix(ls.transform);
            const w = parseFloat(getComputedStyle(line.firstElementChild).width);
            const h = parseFloat(getComputedStyle(line.firstElementChild).height);
            for (let i = 0; i < line.children.length; i++) centers.push({
              x: parseFloat(row.style.left) + r.e + w / 2 + i * (w + parseFloat(ls.gap)),
              y: parseFloat(row.style.top) + r.f + l.f + h / 2, opacity: Number(ls.opacity),
              deferred: line.children[i].classList.contains('m-intro-offscreen'),
            });
          });
          return { skew: [matrix.c,matrix.b], purple: offset('::before'), green: offset('::after'), centers };
        });
        const close = (a,b,label,tolerance=.00006) => assert.ok(Math.abs(a-b) < tolerance,
          `${width}x${height} ${time}ms ${label}: ${a} != ${b}`);
        actual.uniforms.u_skew.forEach((v,k) => close(v,expected.skew[k],'skew'));
        for (const color of ['purple','green']) actual.uniforms[`u_${color}`].forEach((v,k) =>
          close(v * actual.texture[k],expected[color][k],color));
        const centers = [];
        for (let i = 0; i < actual.vertices.length; i += 48) centers.push({
          x: actual.vertices[i], y: actual.vertices[i+1], opacity: actual.vertices[i+6], colorActive: actual.vertices[i+7],
        });
        for (const center of centers) assert.ok(expected.centers.some(c =>
          Math.abs(c.x-center.x) < .02 && Math.abs(c.y-center.y) < .02),
          `${width}x${height} ${time}ms extra glyph ${JSON.stringify(center)}; nearest ${JSON.stringify(expected.centers.toSorted((a,b) => Math.hypot(a.x-center.x,a.y-center.y)-Math.hypot(b.x-center.x,b.y-center.y))[0])}`);
        for (const expectedCenter of expected.centers.filter(c => c.opacity > 0)) {
          const x = (expectedCenter.x - expectedCenter.y) / Math.SQRT2 + width/2;
          const y = (expectedCenter.x + expectedCenter.y) / Math.SQRT2 + height/2;
          if (x < 0 || y < 0 || x > width || y > height) continue;
          const match = centers.find(c => Math.abs(c.x-expectedCenter.x) < .01 && Math.abs(c.y-expectedCenter.y) < .01);
          assert.ok(match, `${width}x${height} ${time}ms missing visible center ${JSON.stringify(expectedCenter)}`);
          close(match.opacity,expectedCenter.opacity,'reveal');
          assert.equal(match.colorActive, time >= 1200 || !expectedCenter.deferred ? 1 : 0, 'Deferred color phase');
        }
        assert.equal(actual.uploads, 1, 'Glyph texture must be uploaded only once');
      }
      results.push({ size: [width,height], initial, phaseChecks: phases.length, status: 'passed' });
      await gpu.close(); await css.close();
    }
    for (const mode of ['no-webgl','no-spacing','shader-failure','tablet']) {
      const page = await create(mode === 'tablet' ? 768 : 390, mode === 'tablet' ? 1024 : 844,mode);
      assert.equal(await page.locator('.m-intro-surface').count(), 0);
      assert.ok(await page.locator('.m-intro-row').count() > 1);
      await page.clock.runFor(2600);
      assert.equal(await page.locator('#page-loader').evaluate(e => getComputedStyle(e).display), 'none');
      results.push({ case: mode, status: 'passed' }); await page.close();
    }
    for (const mode of ['finish','resize','context-loss','external-hide']) {
      const page = await create(390,844);
      if (mode === 'finish') {
        const timing = await page.evaluate(async () => {
          const a = document.getAnimations().find(a => a.id === 'mobile-intro-clock');
          a.pause(); await a.ready;
          const duration = a.effect.getTiming().duration;
          a.currentTime = duration - 1;
          return duration;
        });
        await page.clock.runFor(20);
        assert.equal(await page.locator('#page-loader').evaluate(e => e.classList.contains('hidden')), false);
        await page.evaluate(duration => { document.getAnimations().find(a => a.id === 'mobile-intro-clock').currentTime = duration; }, timing);
        await page.clock.runFor(20);
      } else if (mode === 'resize') await page.setViewportSize({ width:844, height:390 });
      else if (mode === 'context-loss') await page.evaluate(() => document.querySelector('.m-intro-surface').getContext('webgl').getExtension('WEBGL_lose_context').loseContext());
      else await page.evaluate(() => window.hidePageLoader());
      await page.clock.runFor(400);
      assert.equal(await page.locator('.m-intro-surface').count(), 0);
      assert.equal(await page.locator('#page-loader').evaluate(e => getComputedStyle(e).display), 'none');
      assert.equal(await page.evaluate(() => document.getAnimations().some(a => a.id === 'mobile-intro-clock')), false);
      results.push({ case: mode, status: 'passed' }); await page.close();
    }
    assert.deepEqual(errors, []);
    const report = { browser: browser.version(), results, errors };
    fs.writeFileSync(path.join(out,'results.json'), JSON.stringify(report,null,2));
    console.log(JSON.stringify({ passed: results.length, gpuPhaseChecks: phases.length * 5, results: path.join(out,'results.json') }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
