const assert = require('node:assert/strict');
const {after, before, test} = require('node:test');
const {chromium, devices} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

const base = process.argv[2] || 'http://127.0.0.1:48244';
const keychainName = '33号远征队钥匙扣';
let browser;

before(async () => { browser = await chromium.launch({channel: 'chrome'}); });
after(async () => { await browser?.close(); });

async function openKeychainDetail(page) {
  const source = await page.locator('[data-workshop-source]').getAttribute('data-workshop-source');
  const catalog = await page.request.get(base + (source === 'local' ? '/api/catalog' : '/workshop/catalog.json'));
  const {entries} = await catalog.json();
  const keychain = entries.find(item => item.name === keychainName);
  await page.goto(`${base}/prints/detail/?id=${keychain.id}`);
}

async function checkFlight(scope, add) {
  await add.evaluate(button => {
    button.addEventListener('click', event => {
      const trigger = button.closest('[data-workshop]').querySelector('[data-open-cart]');
      const ball = trigger.nextElementSibling;
      if (!ball?.matches('.wk-cart-flight')) return;
      const positions = ball.getAnimations()[0].effect.getKeyframes().map(frame => {
        const [, x, y] = frame.transform.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px/);
        return {x: Number(x), y: Number(y)};
      });
      const target = trigger.getBoundingClientRect();
      button.flightPath = {
        positions, clickX: event.clientX, clickY: event.clientY,
        targetX: target.x + target.width / 2, targetY: target.y + target.height / 2,
      };
    }, {once: true});
  });
  await add.click();
  const path = await add.evaluate(button => button.flightPath);
  assert.ok(path);
  const start = path.positions[0];
  const end = path.positions.at(-1);
  assert.ok(Math.abs(start.x - path.clickX) < 1 && Math.abs(start.y - path.clickY) < 1);
  assert.ok(path.positions.some(point => point.y < start.y - 1));
  assert.ok(Math.abs(end.x - path.targetX) < 1 && Math.abs(end.y - path.targetY) < 1);
  await scope.locator('.wk-cart-flight').waitFor({state: 'detached'});
}

for (const [name, device] of [
  ['desktop', {viewport: {width: 1440, height: 900}}],
  ['mobile', {...devices['iPhone 13'], viewport: {width: 320, height: 568}}],
]) {
  test(`${name} cart keeps variants and quantities across detail, topic and reload`, async () => {
    const page = await browser.newPage(device);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(12000);
    try {
      await page.goto(base + '/prints/?tab=work');
      const grid = page.locator('[data-catalog-grid]');
      const listed = grid.locator('[data-workshop-item]');
      const notice = page.locator('.wk-catalog-notice');
      assert.match(await notice.innerText(), /目前只对主校区出售。六舍可送到寝/);
      assert.equal(await page.getByRole('tablist').count(), 0);
      await listed.first().waitFor();
      assert.deepEqual(await listed.locator('h2').allTextContents(), ['马洛里安-序曲']);
      assert.match(await listed.getAttribute('href'), /id=23871d2434de44809fd3156d5ae4addd/);
      assert.equal(await grid.locator('[data-catalog-topic]').count(), 1);
      if (name === 'desktop') {
        const sidebar = await notice.boundingBox();
        const back = await page.locator('.wk-catalog-home').boundingBox();
        assert.ok(sidebar.width >= 230);
        assert.ok(Math.abs(back.x - sidebar.x) < 1);
        assert.ok(back.y + back.height <= sidebar.y);
      }

      const cart = page.getByRole('dialog', {name: '购物车', exact: true});
      await page.getByRole('button', {name: '购物车', exact: true}).click();
      await cart.getByText('购物车还是空的。').waitFor();
      await page.keyboard.press('Escape');
      await cart.waitFor({state: 'hidden'});
      await openKeychainDetail(page);
      await checkFlight(page, page.locator('[data-add-cart]'));
      await page.getByRole('button', {name: '购物车，1 件'}).waitFor();
      assert.equal(await page.getByText('已加入购物车。', {exact:true}).count(), 0);
      assert.equal(await page.getByRole('button', {name: /生成清单|联系购买/}).count(), 0);
      await page.getByRole('link', {name: '← 返回工坊'}).click();
      await page.locator('[data-catalog-topic]').click();
      const address = base + '/prints/expedition-33/';
      await page.waitForURL(address);
      const trigger = page.locator('[data-open-cart]');
      await trigger.waitFor();
      const initialPosition = await trigger.boundingBox();
      const originalTrigger = await trigger.elementHandle();
      await page.getByRole('link', {name: /玛埃尔镂空立牌/}).click();
      const detail = page.getByRole(name === 'mobile' ? 'region' : 'dialog', {name: '玛埃尔镂空立牌'});
      assert.equal(await trigger.count(), 1);
      assert.equal(await detail.locator('.wk-topic-detail-header [data-open-cart]').count(), 0);
      assert.equal(await detail.getByRole('button', {name: /生成清单|联系购买/}).count(), 0);
      assert.equal(await trigger.evaluate((button, previous) => button === previous, originalTrigger), true);
      assert.deepEqual(await trigger.boundingBox(), initialPosition);
      await detail.getByRole('button', {name: '浅灰色 · PLA'}).click();
      await checkFlight(page, detail.getByRole('button', {name: '加入购物车'}));
      await detail.getByRole('button', {name: '纯白 · PLA'}).click();
      await detail.getByRole('button', {name: '加入购物车'}).click();
      await page.getByRole('button', {name: /购物车，3 件/}).click();
      await cart.locator('[data-cart-total]').getByText('¥45', {exact: true}).waitFor();
      const gray = cart.locator('[data-cart-line]').filter({hasText: '浅灰色'});
      await gray.getByRole('button', {name: '增加数量'}).click();
      assert.equal(await cart.locator('[data-cart-total]').innerText(), '¥60');
      assert.equal(await cart.locator('[data-cart-line]').count(), 3);
      const columnCenters = await cart.locator('.wk-cart-subtotal, .wk-cart-remove, [data-cart-total]').evaluateAll(nodes => nodes.map(node => {
        const bounds = node.getBoundingClientRect();
        return bounds.x + bounds.width / 2;
      }));
      assert.ok(columnCenters.every(center => Math.abs(center - columnCenters[0]) < 1));
      const bounds = await cart.boundingBox();
      assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= device.viewport.width);
      assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= device.viewport.height);

      await cart.getByRole('button', {name: '生成清单 · QQ 联系'}).click();
      const contact = page.getByRole('dialog', {name: 'QQ 联系'});
      const list = contact.getByRole('textbox', {name: '完整选购清单'});
      const text = await list.inputValue();
      assert.match(text, /黑金 PLA \+ 丝绸金 PLA\n填充比例：100%\n数量：1/);
      assert.match(text, /颜色：浅灰色\n填充比例：100%\n数量：2\n单价：¥15\n小计：¥30/);
      assert.match(text, /颜色：纯白\n填充比例：100%\n数量：1/);
      assert.match(text, /合计：¥60$/);
      await page.keyboard.press('Escape');
      await contact.waitFor({state: 'hidden'});
      assert.equal(await cart.isVisible(), true);
      await page.keyboard.press('Escape');
      await cart.waitFor({state: 'hidden'});
      assert.equal(await detail.isVisible(), true);

      await page.reload();
      await page.getByRole('button', {name: /购物车，4 件/}).click();
      await cart.locator('[data-cart-total]').getByText('¥60', {exact: true}).waitFor();
      await gray.getByRole('button', {name: '减少数量'}).click();
      assert.equal(await cart.locator('[data-cart-total]').innerText(), '¥45');
      await gray.getByRole('button', {name: /移除/}).click();
      assert.equal(await cart.locator('[data-cart-total]').innerText(), '¥30');
      assert.equal(page.url(), address);
      assert.deepEqual(errors, []);
    } finally {
      await page.close();
    }
  });
}

test('the cart plays the full arc when the browser requests reduced motion', async () => {
  const page = await browser.newPage({reducedMotion: 'reduce'});
  try {
    await page.goto(base + '/prints/expedition-33/');
    await page.getByRole('link', {name: /玛埃尔镂空立牌/}).click();
    const detail = page.getByRole('dialog', {name: '玛埃尔镂空立牌'});
    await checkFlight(detail, detail.locator('[data-add-cart]'));
    assert.equal(await detail.locator('[data-cart-count]').innerText(), '1');
  } finally {
    await page.close();
  }
});

test('cart checkout refreshes prices and leaves an unavailable line visible and removable', async () => {
  const page = await browser.newPage();
  const change = {price: 15, archived: false, offline: false};
  const catalogPath = /\/(?:api\/catalog|workshop\/catalog\.json)$/;
  try {
    await page.route(catalogPath, async route => {
      if (change.offline) return route.abort();
      const response = await route.fetch();
      const data = await response.json();
      const entry = data.entries.find(item => item.name === keychainName);
      entry.fixed_price = change.price;
      if (change.archived) data.entries = data.entries.filter(item => item !== entry);
      await route.fulfill({response, json: data});
    });
    await page.goto(base + '/prints/');
    await openKeychainDetail(page);
    await page.locator('[data-add-cart]').click();
    const cart = page.getByRole('dialog', {name: '购物车', exact: true});
    const checkout = cart.getByRole('button', {name: '生成清单 · QQ 联系'});
    change.offline = true;
    await page.locator('[data-open-cart]').click();
    await cart.getByRole('button', {name: '重新获取报价'}).waitFor();
    assert.equal(await checkout.isDisabled(), true);
    change.offline = false;
    await cart.getByRole('button', {name: '重新获取报价'}).click();
    await cart.locator('[data-cart-total]').getByText('¥15', {exact: true}).waitFor();
    change.price = 19;
    await checkout.click();
    const contact = page.getByRole('dialog', {name: 'QQ 联系'});
    assert.match(await contact.locator('[data-contact-text]').inputValue(), /合计：¥19$/);
    await contact.getByRole('button', {name: '关闭', exact: true}).click();
    change.archived = true;
    await checkout.click();
    await cart.getByText('请先移除不可用的商品。').waitFor();
    assert.equal(await checkout.isDisabled(), true);
    await cart.getByRole('button', {name: /移除/}).click();
    await cart.getByText('购物车还是空的。').waitFor();
  } finally {
    await page.close();
  }
});
