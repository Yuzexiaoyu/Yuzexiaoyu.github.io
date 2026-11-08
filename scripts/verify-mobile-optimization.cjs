/* Focused regressions for the follow-up mobile optimization. Run against a mobile-enabled build. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:13135';
const out = process.argv[3] || '.mobile-validation/optimization-after-checks';
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, channel: process.env.BROWSER_CHANNEL || 'chrome' });
  const context = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await context.route('https://**', route => route.abort());
  const page = await context.newPage();
  const results = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  async function check(name, run) {
    const start = Date.now();
    try { const detail = await run(); results.push({ name, status: 'passed', ms: Date.now() - start, detail }); }
    catch (error) { results.push({ name, status: 'failed', error: error.stack }); }
    console.log(`${results.at(-1).status}: ${name}`);
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ browser: browser.version(), results }, null, 2));
  }
  await page.goto(base + '/', { waitUntil: 'load' });
  await page.waitForFunction(() => window.__createMobilePagination);
  await check('EPUB IDs remain local to each chapter, including empty end anchors', async () => {
    const detail = await page.evaluate(async () => {
      const viewport = document.createElement('div');
      viewport.className = 'reader-viewport';
      viewport.style.cssText = 'position:fixed;left:-10000px;top:0;width:390px;height:250px;flex:none';
      const content = document.createElement('div'); content.className = 'reader-content';
      content.style.cssText = 'font-size:18px;line-height:1.8'; viewport.append(content); document.body.append(viewport);
      const engine = window.__createMobilePagination(content, viewport);
      try {
        const chapters = [0, 1].map(idx => {
          const anchor = document.createElement('section');
          anchor.innerHTML = '<p id="source"><a href="#note">注释</a>' + '长段落验证。'.repeat(350) + '<span id="end"></span></p><p id="note">注释终点</p>';
          return { idx, anchor };
        });
        const expected = chapters.map(ch => ch.anchor.textContent).join('');
        content.replaceChildren(...chapters.map(ch => ch.anchor));
        const book = { chapters }; await engine.paginate(book);
        const targets = chapters.map(ch => ({ chapter: ch.idx, source: engine.target('source', ch.idx), note: engine.target('note', ch.idx), end: engine.target('end', ch.idx) }));
        const intact = content.textContent === expected;
        viewport.style.width = '320px'; await engine.paginate(book);
        return { targets, intact, afterReflow: content.textContent === expected, reflowTargets: chapters.map(ch => engine.target('end', ch.idx)) };
      } finally { engine.cancel(); viewport.remove(); }
    });
    assert.ok(detail.intact && detail.afterReflow, 'Source text changed');
    for (const target of detail.targets) for (const key of ['source', 'note', 'end']) assert.notEqual(target[key], null, `chapter ${target.chapter} lost ${key}: ${JSON.stringify(detail)}`);
    assert.ok(detail.reflowTargets.every(index => index !== null));
    return detail;
  });
  await check('long pagination yields to input and cancelled work cannot overwrite its replacement', async () => {
    const detail = await page.evaluate(async () => {
      const viewport = document.createElement('div'); viewport.className = 'reader-viewport';
      viewport.style.cssText = 'position:fixed;left:-10000px;top:0;width:390px;height:250px;flex:none';
      const content = document.createElement('div'); content.className = 'reader-content';
      viewport.append(content); document.body.append(viewport);
      const engine = window.__createMobilePagination(content, viewport);
      const anchor = document.createElement('section'); anchor.innerHTML = '<p>分页中的长段落。'.repeat(2000);
      content.append(anchor); const book = { chapters: [{ idx: 0, anchor }] };
      let completed = false, handledBeforeCompletion = false;
      const pendingInput = new Promise(resolve => setTimeout(() => {
        handledBeforeCompletion = !completed; engine.cancel(); resolve();
      }, 0));
      const pending = engine.paginate(book).then(() => { completed = true; });
      await pendingInput;
      const replacement = document.createElement('section'); replacement.innerHTML = '<p id="replacement">新卷内容</p>';
      const latest = { chapters: [{ idx: 7, anchor: replacement }] };
      content.replaceChildren(replacement);
      await engine.paginate(latest); await pending;
      const result = { handledBeforeCompletion, text: content.textContent, pages: latest.totalPagesCount, target: engine.target('replacement', 7), staleBookCommitted: book.totalPagesCount !== undefined };
      engine.cancel(); viewport.remove(); return result;
    });
    assert.equal(detail.handledBeforeCompletion, true, JSON.stringify(detail));
    assert.equal(detail.staleBookCommitted, false, JSON.stringify(detail));
    assert.equal(detail.text, '新卷内容'); assert.equal(detail.pages, 1); assert.equal(detail.target, 0);
    return detail;
  });
  await check('no fixed music UI or audio resource on mobile', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    const detail = await page.evaluate(() => ({
      player: !!document.querySelector('#aplayer'),
      audio: !!document.querySelector('audio'),
      musicResources: performance.getEntriesByType('resource').filter(entry => /aplayer|music-uploads/i.test(entry.name)).map(entry => entry.name),
      clearance: getComputedStyle(document.documentElement).getPropertyValue('--m-bottom-obstruction').trim()
    }));
    assert.equal(detail.player, false);
    assert.equal(detail.audio, false);
    assert.deepEqual(detail.musicResources, []);
    assert.equal(detail.clearance, '0px');
    return detail;
  });
  await check('no uncaught browser errors', async () => { assert.deepEqual(errors, []); return errors; });
  await browser.close();
  process.exitCode = results.some(result => result.status === 'failed') ? 1 : 0;
})().catch(error => { console.error(error); process.exit(1); });
