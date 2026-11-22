// Run the actual Hugo-built bundle. Build the production directory before testing.
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');

const build = process.env.HUGO_BUILD_DIR || '.local/print-workshop/production';
const html = readFileSync(join(build, 'index.html'), 'utf8');
const workshopHtml = readFileSync(join(build, 'prints/index.html'), 'utf8');
const bundleUrl = workshopHtml.match(/href=["']?([^\s"'<>]*\/ts\/print-workshop[^\s"'<>]*\.js)/)[1];
const bundle = readFileSync(join(build, new URL(bundleUrl, 'http://localhost').pathname), 'utf8');
const fixture = JSON.parse(readFileSync('static/workshop/catalog.json', 'utf8'));
const flush = () => new Promise(resolve => setImmediate(resolve));
const response = data => ({ok:true, headers:{get:()=>'application/json'}, json:async()=>structuredClone(data)});

function harness(fetcher = async () => response(fixture), earlyResponse) {
  const requests = [], images = [];
  let current = null;
  const location = {origin:'http://localhost', search:''};
  const window = {__workshopCatalogRequest:earlyResponse};
  vm.runInNewContext(bundle, {
    window, location, URL, URLSearchParams, AbortController, navigator:{},
    requestAnimationFrame:()=>1, cancelAnimationFrame(){},
    document:{querySelector:()=>current},
    fetch:(...args)=>{requests.push(args[0]);return fetcher(...args);},
    Image:class {set src(value){images.push(value);}},
  });
  return {
    app:window.WorkshopApp, requests, images,
    mount(source = 'static', tab = 'work') {
      const grid = {innerHTML:''};
      location.search = `?tab=${tab}`;
      current = {
        dataset:{workshop:'catalog',workshopSource:source},
        getAttribute:()=>source, addEventListener(){},
        querySelector:selector=>selector==='[data-catalog-grid]'?grid:null,
        querySelectorAll:()=>[],
      };
      window.WorkshopApp.init();
      return grid;
    },
  };
}

test('blog defers workshop requests and then starts the bundle and data together', async () => {
  const source = html.match(/<script id=["']?workshop-loader["']?>([\s\S]*?)<\/script>/)[1];
  const scripts = [], preloads = [], requests = [];
  const window = {addEventListener(){}, __pagePreload:{allowed:()=>true}};
  vm.runInNewContext(source, {
    window, fetch:url=>{requests.push(url);return Promise.resolve(response(fixture));},
    document:{
      addEventListener(){}, createElement:()=>({}),
      head:{appendChild:script=>scripts.push(script)},
    },
  });
  assert.equal(scripts.length, 0);
  assert.equal(requests.length, 0);
  const warm = window.__warmWorkshop(new AbortController().signal);
  assert.equal(scripts.length, 1);
  assert.deepEqual(requests, ['/workshop/catalog.json']);
  assert.equal(scripts[0].src, new URL(bundleUrl, 'http://localhost').pathname);
  window.WorkshopApp = {preload:async source=>preloads.push(source)};
  scripts[0].onload();
  await warm;
  assert.deepEqual(preloads, ['static']);
});

test('the workshop bundle consumes the catalog request started during navigation', async () => {
  const h = harness(undefined,Promise.resolve(response(fixture)));
  const grid = h.mount();
  await flush();
  assert.match(grid.innerHTML,/wk-card/);
  assert.deepEqual(h.requests,[]);
});

test('concurrent preloads share one snapshot request and warm the lead cover of each tab', async () => {
  const h = harness();
  await Promise.all([h.app.preload('static'),h.app.preload('static')]);
  assert.deepEqual(h.requests, ['/workshop/catalog.json']);
  const leadCovers = ['work', 'product'].map(kind=>fixture.entries.find(entry=>entry.kind===kind)?.images[0]?.url);
  assert.deepEqual(h.images.sort(), [...new Set(leadCovers.filter(Boolean))].sort());
});

test('entering either catalog tab reuses the preloaded data', async () => {
  const h = harness();
  await h.app.preload('static');
  const works = h.mount();
  await flush();
  assert.match(works.innerHTML, new RegExp(fixture.entries.find(e=>e.kind==='work').name));
  h.app.destroy();
  const products = h.mount('static', 'product');
  await flush();
  assert.match(products.innerHTML, new RegExp(fixture.entries.find(e=>e.kind==='product').name));
  assert.equal(h.requests.length, 1);
});

test('cancelled navigation does not cancel or poison the shared preload', async () => {
  let complete;
  const h = harness(()=>new Promise(resolve=>{complete=resolve;}));
  const preload = h.app.preload('static');
  const abandoned = h.mount();
  h.app.destroy();
  complete(response(fixture));
  await preload;
  await flush();
  assert.equal(abandoned.innerHTML, '');
  const returned = h.mount();
  await flush();
  assert.match(returned.innerHTML, /wk-card/);
  assert.equal(h.requests.length, 1);
});

test('failed background preload can retry when entering the workshop', async () => {
  let attempt = 0;
  const h = harness(async()=>{if(++attempt===1)throw new Error('offline');return response(fixture);});
  await assert.rejects(h.app.preload('static'), /offline/);
  const grid = h.mount();
  await flush();
  assert.match(grid.innerHTML, /wk-card/);
  assert.equal(h.requests.length, 2);
});

test('local preview consumes its preload once then reads live data on return', async () => {
  const h = harness(async()=>response({entries:fixture.entries}));
  await h.app.preload('local');
  const grid = h.mount('local');
  await flush();
  assert.match(grid.innerHTML, /wk-card/);
  assert.deepEqual(h.requests, ['/api/catalog']);
  h.app.destroy();
  h.mount('local');
  await flush();
  assert.deepEqual(h.requests, ['/api/catalog','/api/catalog']);
});

test('a local catalog visit consumes the request started before the bundle', async () => {
  const h = harness(async()=>response({entries:fixture.entries}),Promise.resolve(response({entries:fixture.entries})));
  const grid = h.mount('local');
  await flush();
  assert.match(grid.innerHTML,/wk-card/);
  assert.deepEqual(h.requests,[]);
  h.app.destroy();
  h.mount('local','product');
  await flush();
  assert.deepEqual(h.requests,['/api/catalog']);
});
