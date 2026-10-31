const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium, devices } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const bases = [process.argv[2] || 'http://127.0.0.1:13134', process.argv[3] || 'http://127.0.0.1:13135'];
const output = process.argv[4] || '.mobile-validation/optimization-performance.json';
fs.mkdirSync(path.dirname(output), { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const results = [];
  for (const base of bases) {
    const context = await browser.newContext({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
    const page = await context.newPage(); await page.route('https://**', route => route.abort());
    await page.addInitScript(() => {
      window.__paginationMetrics = [];
      let factory;
      Object.defineProperty(window, '__createMobilePagination', {
        configurable: true, get() { return factory; },
        set(original) {
          factory = (...args) => {
            const engine = original(...args), paginate = engine.paginate;
            engine.paginate = async book => {
              const start = performance.now(); let ticks = 0;
              const interval = setInterval(() => ticks++, 16);
              try { return await paginate(book); }
              finally { clearInterval(interval); window.__paginationMetrics.push({ ms: performance.now() - start, ticks, pages: book.totalPagesCount }); }
            };
            return engine;
          };
        }
      });
    });
    const start = Date.now();
    await page.goto(`${base}/novel/reader/#vol=if`);
    await page.waitForFunction(() => document.querySelector('#reader-loading')?.style.display === 'none', null, { timeout: 90000 });
    const result = await page.evaluate(() => ({
      metrics: window.__paginationMetrics, text: document.querySelector('#reader-content').textContent,
      images: document.querySelectorAll('#reader-content img').length,
      pages: document.querySelectorAll('.reader-page').length,
      viewport: document.querySelector('#reader-viewport').getBoundingClientRect().toJSON()
    }));
    const { createHash } = require('node:crypto');
    result.textHash = createHash('sha256').update(result.text).digest('hex'); result.characters = result.text.length; delete result.text;
    results.push({ base, loadMs: Date.now() - start, ...result });
    console.log(JSON.stringify(results.at(-1)));
    fs.writeFileSync(output, JSON.stringify(results, null, 2));
    await context.close();
  }
  await browser.close();
  for (const key of ['textHash', 'characters', 'images', 'pages']) assert.equal(results[1][key], results[0][key], `Reader content changed: ${key}`);
  assert.ok(results[1].metrics[0].ticks > 0, 'Pagination did not yield to the event loop');
})().catch(error => { console.error(error); process.exit(1); });
