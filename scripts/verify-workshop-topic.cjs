/* Run against the Hugo site with local media. */
const assert = require('node:assert/strict');
const {after, before, test} = require('node:test');
const {chromium, devices} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://localhost:48174';
const topic = base + '/prints/expedition-33/';
let browser;

before(async () => { browser = await chromium.launch({channel:'chrome', ignoreDefaultArgs:['--hide-scrollbars']}); });
after(async () => { await browser?.close(); });

async function playing(page, suffix) {
  await page.waitForFunction(suffix => {
    const video = document.querySelector('[data-topic-video]');
    return video?.currentSrc.endsWith(suffix) && video.currentTime > .2 &&
      !video.paused && video.videoWidth > 0 && video.classList.contains('is-playing');
  },suffix,{timeout:15000});
}

test('workshop navigation still works when the preload plugin fails to load', async () => {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await page.route('**/lib/index.umd.js', route => route.abort());
    await page.goto(base + '/prints/');
    await page.waitForFunction(() => window.swupReady);
    await page.evaluate(() => { window.workshopNavigationProbe = document; });
    await page.locator('[data-catalog-topic]').click();
    await page.waitForURL(topic);
    await page.locator('[data-topic-item]').first().waitFor();
    assert.equal(await page.evaluate(() => window.workshopNavigationProbe === document), true);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test('expedition imprint follows mouse clicks through dialogs and workshop navigation', async () => {
  const page = await browser.newPage({hasTouch:true});
  const mark = page.locator('.exp33-imprint');
  const layer = page.locator('.exp33-imprint-layer');
  const card = page.locator('[data-topic-item]').first();
  const detail = page.locator('[data-topic-detail][open]');
  try {
    await page.goto(topic, {waitUntil:'domcontentloaded'});
    await card.waitFor();
    await page.waitForFunction(() => window.swupReady);
    await page.evaluate(() => { window.imprintDocument = document; });
    const samples = [];
    for (const reducedMotion of ['no-preference', 'reduce']) {
      await page.emulateMedia({reducedMotion});
      await page.mouse.click(640, 160);
      assert.equal(await mark.count(), 1, reducedMotion);
      assert.equal(await mark.locator(':scope > .exp33-brush:only-child > .exp33-numerals:only-child').count(), 1);
      const sample = await mark.evaluate(node => {
        const {x, y} = node.getBoundingClientRect();
        const brush = node.querySelector('.exp33-brush');
        const arcs = ['::before', '::after'].map(side => getComputedStyle(brush, side).clipPath);
        const animations = node.getAnimations({subtree:true}).map(animation => {
          animation.currentTime = 260;
          const effect = animation.effect;
          const style = getComputedStyle(effect.target);
          return {name:animation.animationName, timing:effect.getTiming(), end:effect.getComputedTiming().endTime, frames:effect.getKeyframes(),
            transform:style.transform, opacity:style.opacity};
        });
        const scale = new DOMMatrixReadOnly(getComputedStyle(node).transform);
        return {point:[x, y], scale:[scale.a, scale.d], arcs, animations};
      });
      assert.deepEqual(sample.point, [640, 160]);
      assert.ok(sample.scale.every(axis => Math.abs(axis - .7) < .0001));
      assert.ok(sample.arcs.every(path => path.startsWith('path(')));
      assert.notEqual(sample.arcs[0], sample.arcs[1]);
      assert.deepEqual(sample.animations.map(a => a.name).sort(), ['exp33-brush-turn', 'exp33-imprint-fade']);
      assert.ok(sample.animations.every(a => a.timing.duration === 400 && a.end === 400 && a.frames.length > 1));
      const turn = sample.animations.find(a => a.name === 'exp33-brush-turn');
      assert.deepEqual(turn.frames.map(frame => frame.computedOffset), [0, 1]);
      assert.doesNotMatch(turn.frames[0].easing, /step/);
      assert.notEqual(turn.frames[0].transform, turn.frames[1].transform);
      samples.push(sample);
      await layer.waitFor({state:'detached', timeout:3000});
    }
    assert.deepEqual(samples[1], samples[0]);

    await page.mouse.click(640, 160, {button:'right'});
    assert.equal(await mark.count(), 0);
    await page.touchscreen.tap(640, 160);
    assert.equal(await mark.count(), 0);
    await card.press('Enter');
    await detail.waitFor();
    assert.equal(await mark.count(), 0);
    await page.keyboard.press('Escape');
    await card.click();
    assert.equal(await detail.locator('.exp33-imprint').count(), 1);
    const photo = detail.locator('[data-view="photo"]').nth(1);
    await photo.click();
    assert.equal(await photo.getAttribute('aria-pressed'), 'true');

    await page.keyboard.press('Escape');
    await page.locator('[data-topic-back-workshop]').click();
    await page.locator('.wk-catalog-notice').click();
    assert.equal(await mark.count(), 0);
    await page.locator('[data-catalog-topic]').click();
    await card.waitFor();
    assert.equal(await page.evaluate(() => window.imprintDocument === document), true);
    await page.mouse.click(640, 160);
    assert.equal(await mark.count(), 1);
  } finally { await page.close(); }
});

test('desktop reveals the opaque wallpaper through its dark cover or retry poster', async () => {
  for (const retry of [false, true]) {
    const page = await browser.newPage();
    try {
      if (retry) await page.addInitScript(() => {
        const play = HTMLMediaElement.prototype.play;
        HTMLMediaElement.prototype.play = function () {
          if (this.matches('[data-topic-video]') && !navigator.userActivation.isActive) {
            this.autoplay = false;
            return Promise.reject(new DOMException('Gesture required', 'NotAllowedError'));
          }
          return play.call(this);
        };
      });
      await page.goto(topic, {waitUntil:'domcontentloaded'});
      if (retry) {
        const button = page.getByRole('button', {name:'播放背景视频'});
        await button.waitFor();
        assert.equal(await page.locator('[data-topic-poster]').evaluate(poster => getComputedStyle(poster).opacity), '1');
        await button.click();
      }
      const samples = [];
      for (const finished of [false, true]) {
        const state = await page.waitForFunction(({retry, finished}) => {
          const video = document.querySelector('[data-topic-video].is-playing');
          if (!video || video.paused) return;
          const wall = video.parentElement;
          const cover = retry ? getComputedStyle(wall.querySelector('[data-topic-poster]')) : getComputedStyle(wall, '::before');
          const opacity = Number(cover.opacity);
          if (finished ? opacity !== 0 : opacity <= .2 || opacity >= .8) return;
          const style = getComputedStyle(video);
          return {video:[style.opacity, style.transitionProperty], duration:cover.animationDuration,
            gradient:getComputedStyle(wall, '::after').backgroundImage, time:video.currentTime};
        }, {retry, finished}, {timeout:8000});
        const sample = await state.jsonValue();
        assert.deepEqual(sample.video, ['1', 'none']);
        assert.equal(sample.duration, '3s');
        assert.match(sample.gradient, /linear-gradient/);
        samples.push(sample);
      }
      assert.equal(samples[1].gradient, samples[0].gradient);
      assert.ok(samples[1].time > samples[0].time);
    } finally { await page.close(); }
  }
});

test('direct mobile entry plays and rotates while the workshop requests fail', async () => {
  const page = await browser.newPage(devices['iPhone 13']);
  try {
    await page.route(/\/ts\/print-workshop\.|\/workshop\/catalog\.json/, route => route.abort());
    await page.goto(topic);
    await playing(page,'scene-loop-portrait-stream-v1.mp4');
    assert.equal(await page.locator('[data-topic-video]').evaluate(v=>v.videoHeight),1280);
    await page.getByText('工坊脚本加载失败，请刷新页面重试。').waitFor();
    await page.setViewportSize({width:844,height:390});
    await playing(page,'scene-loop-wide-stream-v1.mp4');
  } finally { await page.close(); }
});

test('mobile wallpaper keeps its crop when the visible area grows or shrinks', async () => {
  const page = await browser.newPage(devices['iPhone 13']);
  try {
    await page.goto(topic);
    await playing(page, 'scene-loop-portrait-stream-v1.mp4');
    const video = page.locator('[data-topic-video]');
    const bounds = await video.boundingBox();
    const source = await video.evaluate(element => element.currentSrc);
    const position = await video.evaluate(element => getComputedStyle(element).objectPosition);
    assert.equal(position, '50% 50%');

    // Change the fixed positioning area without resizing the large viewport, as a toolbar does.
    const scene = page.locator('.wk-topic-scene');
    await scene.evaluate(element => {
      element.style.transform = 'translate(0)';
      element.style.position = 'fixed';
      element.style.inset = '0 0 auto';
      element.style.minHeight = '0';
    });
    for (const height of [784, 844, 784]) {
      await scene.evaluate((element, pixels) => { element.style.height = pixels + 'px'; }, height);
      assert.equal((await scene.boundingBox()).height, height);
      assert.deepEqual(await video.boundingBox(), bounds);
      assert.equal(await video.evaluate(element => element.currentSrc), source);
      assert.equal(await video.evaluate(element => getComputedStyle(element).objectPosition), position);
    }
  } finally { await page.close(); }
});

test('topic cards and details stay over the playing video on desktop and mobile', async () => {
  const cases = [
    [devices['Desktop Chrome'], 'scene-loop-wide-stream-v1.mp4'],
    [{...devices['iPhone 13'], viewport:{width:320,height:568}}, 'scene-loop-portrait-stream-v1.mp4'],
    [{...devices['iPhone 13'], viewport:{width:844,height:390}}, 'scene-loop-wide-stream-v1.mp4'],
  ];
  for (const [device, source] of cases) {
    const page = await browser.newPage(device);
    try {
      await page.goto(topic);
      const cards = page.locator('[data-topic-grid] [data-workshop-item]');
      await cards.nth(1).waitFor();
      assert.equal(await page.getByText('相关物品', {exact:true}).count(), 0);
      assert.equal(await cards.locator('.wk-badge').count(), 0);
      assert.deepEqual(await cards.locator('.wk-card-price').allTextContents(), ['¥15', '¥15']);
      await playing(page,source);
      assert.ok(await cards.evaluateAll(items => {
        const video = document.querySelector('[data-topic-video]').getBoundingClientRect();
        return window.scrollY === 0 && items.every(item => {
          const card = item.getBoundingClientRect();
          return card.top >= Math.max(0, video.top) && card.bottom <= Math.min(innerHeight, video.bottom) + 1 &&
            card.left >= video.left && card.right <= video.right;
        });
      }));
      const first = cards.first();
      const coverWidth = (await first.locator('img').boundingBox()).width;
      const desktop = await page.locator('html').getAttribute('data-ui') !== 'mobile';
      const name = await first.locator('h3').innerText();
      const cover = await first.locator('img').getAttribute('src');
      const wallpaper = await page.locator('[data-topic-video]').elementHandle();
      const videoBounds = await wallpaper.boundingBox();
      assert.equal(videoBounds.width, await page.evaluate(() => innerWidth));
      const time = await wallpaper.evaluate(video => video.currentTime);
      await first.click();
      const detailRole = desktop ? 'dialog' : 'region';
      const panel = page.getByRole(detailRole, {name, exact:true});
      await panel.waitFor();
      assert.equal(page.url(), topic);
      assert.equal(await panel.getByRole('heading', {name, exact:true}).textContent(), name);
      assert.doesNotMatch(await panel.locator('.wk-description').textContent(), /实拍为黑色|切换到 3D 预览查看/);
      assert.equal(await panel.locator('[data-price]').textContent(), '¥15');
      assert.equal(await panel.locator('[data-infill-value]').textContent(), '100%');
      assert.equal(await panel.locator('[data-weight]').textContent(), '约 45 g');
      assert.deepEqual(await panel.locator('[data-color-id]').evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label'))),
        ['黑色 · PLA', '浅灰色 · PLA', '纯白 · PLA']);
      assert.deepEqual(await panel.locator('.wk-config').evaluate(config => {
        const style = getComputedStyle(config);
        return [style.backgroundColor, style.backgroundImage, style.borderWidth];
      }), ['rgba(0, 0, 0, 0)', 'none', '0px']);
      assert.ok(await panel.locator('.wk-config-section:has(.wk-swatches)').evaluate(section=>{
        const palette=section.querySelector('.wk-swatches');
        const material=section.querySelector('.wk-material');
        return getComputedStyle(material).borderTopWidth==='0px'&&material.getBoundingClientRect().top>=palette.getBoundingClientRect().bottom;
      }));
      assert.equal(await panel.locator('[data-stage-image]').getAttribute('src'), cover);
      for (const card of await cards.all()) assert.equal(await card.isVisible(), false);
      assert.deepEqual(await wallpaper.boundingBox(), videoBounds);
      if (desktop) {
        assert.equal(await panel.evaluate(element => getComputedStyle(element).scrollbarWidth), 'none');
        assert.ok(await panel.locator('.wk-detail-grid').evaluate((grid, previousWidth) => {
          const media = grid.querySelector('.wk-stage').getBoundingClientRect();
          const info = grid.querySelector('.wk-config').getBoundingClientRect();
          return media.width > previousWidth * 1.5 && info.left > media.right && info.width >= 350;
        }, coverWidth));
      } else {
        assert.equal(await page.locator('dialog[open]').count(), 0);
        assert.ok(await panel.evaluate(section => section.parentElement.classList.contains('wk-topic-scene')));
        assert.equal(await panel.evaluate(section => getComputedStyle(section).overflowY), 'visible');
        assert.equal(await page.getByRole('button', {name:/返回物品/}).count(), 0);
        assert.equal(await page.locator('.wk-topic-inner').evaluate(element => getComputedStyle(element).backgroundColor), 'rgba(0, 0, 0, 0)');
        await page.evaluate(() => window.scrollTo({top:80, behavior:'instant'}));
        assert.ok(await page.evaluate(() => window.scrollY > 0));
        assert.deepEqual(await wallpaper.boundingBox(), videoBounds);
      }
      await panel.locator('[data-view="photo"]').nth(1).click();
      await page.waitForFunction(url => document.querySelector('[data-stage-image]')?.getAttribute('src') !== url, cover);
      await page.waitForFunction(({video, time}) => video.isConnected && !video.paused && Math.abs(video.currentTime - time) > .2, {video:wallpaper, time});

      await panel.getByRole('button', {name:'加入购物车'}).click();
      await page.locator('[data-open-cart]').click();
      const cart = page.getByRole('dialog', {name:'购物车'});
      await cart.getByRole('button', {name:/生成清单/}).click();
      const contact = page.getByRole('dialog', {name:'QQ 联系'});
      await contact.waitFor();
      assert.match(await contact.locator('[data-contact-text]').inputValue(), /合计：¥15/);
      assert.match(await contact.locator('[data-contact-text]').inputValue(), /材质：PLA\n颜色：黑色\n填充比例：100%/);
      await contact.getByRole('button', {name:'关闭', exact:true}).click();
      await contact.waitFor({state:'hidden'});
      await cart.getByRole('button', {name:'关闭购物车'}).click();

      if (desktop) {
        await page.getByRole('button', {name:'关闭物品详情'}).click();
      } else {
        await page.goBack();
        await panel.waitFor({state:'hidden'});
        await first.waitFor();
        await page.goForward();
        await panel.waitFor();
        assert.equal(page.url(), topic);
        await page.goBack();
      }
      await panel.waitFor({state:'hidden'});
      assert.equal(await first.isVisible(), true);
      assert.deepEqual(await wallpaper.boundingBox(), videoBounds);
      assert.equal(await first.evaluate(card => card === document.activeElement), true);
      const second = cards.nth(1);
      await second.click();
      const secondDetail = page.getByRole(detailRole, {name:await second.locator('h3').textContent(), exact:true});
      await secondDetail.waitFor();
      assert.equal(await secondDetail.locator('[data-price]').textContent(), '¥15');
      assert.equal(await secondDetail.locator('[data-infill-value]').textContent(), '100%');
      assert.equal(await secondDetail.locator('[data-weight]').textContent(), '约 7 g');
      assert.equal(await secondDetail.locator('[data-material]').textContent(), '黑金 PLA + 丝绸金 PLA');
      assert.deepEqual(await secondDetail.locator('.wk-description').evaluate(element => [element.firstChild.textContent, element.firstChild.nextSibling.tagName, element.firstChild.nextSibling.nextSibling.tagName]),
        ['致后来者！', 'BR', 'BR']);
      assert.equal(await secondDetail.locator('.wk-description :is(em, hr)').count(), 0);
      assert.equal(await secondDetail.locator('.wk-stock-specs .wk-material > span').first().textContent(), '材质');
      assert.equal(await secondDetail.locator('.wk-stock-specs .wk-config-section--fixed-infill h2').textContent(), '固定填充比例');
      await page.keyboard.press('Escape');
      await secondDetail.waitFor({state:'hidden'});
      assert.equal(page.url(), topic);
      assert.ok(await wallpaper.evaluate(video => video.isConnected && !video.paused));
    } finally { await page.close(); }
  }
});

test('the workshop lists one Malorian card and its detail has no link to the other record', async () => {
  const page = await browser.newPage();
  try {
    const html = await page.request.get(base+'/prints/');
    assert.doesNotMatch(await html.text(), /玛埃尔镂空立牌|33号远征队钥匙扣|href="[^"]*id=6c4c0fadb83a48e4a3f0e4736630786c/);
    await page.goto(base+'/prints/');
    await page.locator('[data-catalog-entries] [data-workshop-item]').first().waitFor();
    assert.deepEqual(await page.locator('[data-workshop-item] h2').allTextContents(), ['马洛里安-序曲']);
    await page.getByRole('link', {name:/马洛里安-序曲/}).click();
    await page.getByRole('heading', {name:'马洛里安-序曲', exact:true, level:1}).waitFor();
    assert.equal(await page.getByRole('link', {name:/查看现货/}).count(), 0);
    await page.locator('[data-detail-back]').click();
    await page.locator('[data-catalog-topic]').click();
    await page.getByRole('heading', {name:'玛埃尔镂空立牌', exact:true}).waitFor();
    await page.getByRole('heading', {name:'33号远征队钥匙扣', exact:true}).waitFor();
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
    await page.getByRole('link',{name:'← 返回工坊'}).tap();
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
    const lead = page.locator('[data-catalog-lead]').first();
    await lead.waitFor({state:'visible'});
    await page.waitForFunction(()=>document.querySelector('[data-catalog-lead] img')?.naturalWidth>0);
    assert.match(await lead.getAttribute('href'),/\/prints\/detail\/\?id=/);
    await page.locator('.wk-topic-card').tap();
    await playing(page,'scene-loop-portrait-stream-v1.mp4');
    await page.waitForFunction(()=>document.querySelector('[data-topic-music]')?.currentTime>.2);
    assert.match(await page.locator('[data-topic-music]').evaluate(audio=>audio.currentSrc),/\/lumiere-aac-v1\.m4a$/);
  } finally { release(); await page.close(); }
});

test('the catalog lead keeps its card and cover when priced; item video waits for a click', async () => {
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
    const seed = page.locator('[data-catalog-lead]').first();
    await seed.waitFor({state:'visible'});
    assert.equal(await page.locator('[data-catalog-lead]').count(),1);
    assert.equal(await page.getByRole('tablist').count(),0);
    await page.waitForFunction(()=>document.querySelector('[data-catalog-lead] img')?.naturalWidth>0);
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
