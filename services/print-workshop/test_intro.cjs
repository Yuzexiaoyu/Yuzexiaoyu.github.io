// Exercise the actual Hugo-built entrance code with a controlled frame clock.
const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const html = readFileSync('.local/print-workshop/site/prints/index.html', 'utf8');
const source = html.match(/<script id="workshop-intro-script">([\s\S]*?)<\/script>/)?.[1];
assert.ok(source, 'Build the local Hugo site before running entrance tests');

function page({path = '/', mobile = false, reduced = false} = {}) {
  let now = 0, sequence = 0;
  const frames = new Map(), events = {}, speeds = [], animations = [];
  class Element {
    constructor(tagName = 'DIV') { this.tagName = tagName; this.dataset = {}; this.inert = false; this.children = []; this.isConnected = true; }
    animate(keyframes, timing) {
      const animation = {keyframes, timing, currentTime: 0, cancelled: false, pause() {}, cancel() { this.cancelled = true; }};
      animations.push(animation);
      return animation;
    }
  }
  const document = {documentElement: new Element('HTML'), body: new Element('BODY'), querySelectorAll: () => [new Element(), new Element()]};
  document.body.children = [new Element('HEADER'), new Element(), new Element('SCRIPT')];
  const window = {__isMobileUI: () => mobile, setWarpSpeed: value => speeds.push(['desktop', value]), __mobileWarp: {setSpeed: value => speeds.push(['mobile', value])}, addEventListener: (name, fn) => {events[name] = fn;}};
  const context = vm.createContext({window, document, location: {href: 'http://127.0.0.1:13135'+path, origin: 'http://127.0.0.1:13135'}, URL, HTMLElement: Element, performance: {now: () => now}, matchMedia: () => ({matches: reduced}), requestAnimationFrame: fn => {frames.set(++sequence, fn); return sequence;}, cancelAnimationFrame: id => frames.delete(id)});
  vm.runInContext(source, context);
  return {window, document, Element, events, speeds, animations, frames,
    step(time) { now = time; const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(time)); },
    root() { const root = new Element(); root.dataset.workshop = 'catalog'; return root; },
    phase() { return document.documentElement.dataset.workshopIntro; }
  };
}

test('direct entry hides, accelerates, reveals, then restores input and normal speed', () => {
  const p = page({path: '/prints/'});
  const body = p.document.body;
  assert.equal(p.phase(), 'warp');
  assert.equal(body.inert, true);
  p.window.WorkshopIntro.enter(p.root());
  p.step(200);
  assert.ok(p.speeds.at(-1)[1] > 5 && p.speeds.at(-1)[1] < 40);
  p.step(300);
  assert.equal(p.speeds.at(-1)[1], 40);
  assert.equal(p.phase(), 'warp');
  p.step(450);
  assert.equal(p.phase(), 'reveal');
  p.step(675);
  assert.ok(p.animations.every(a => a.currentTime === 225));
  assert.ok(p.speeds.at(-1)[1] < 40);
  p.step(1000);
  assert.equal(p.phase(), undefined);
  assert.equal(body.inert, false);
  assert.equal(p.speeds.at(-1)[1], 5);
  assert.ok(p.animations.every(a => a.cancelled));
});

test('Swup body replacement unlocks both old and new bodies', () => {
  const p = page();
  const oldBody = p.document.body;
  p.window.WorkshopIntro.navigate('/prints/?tab=product', '/');
  p.document.body = new p.Element('BODY');
  p.window.WorkshopIntro.enter(p.root());
  assert.equal(oldBody.inert, true);
  assert.equal(p.document.body.inert, true);
  p.step(450); p.step(1000);
  assert.equal(oldBody.inert, false);
  assert.equal(p.document.body.inert, false);
});

test('navigation away cancels hidden state and all queued entrance frames', () => {
  const p = page({path: '/prints/'});
  p.window.WorkshopIntro.enter(p.root());
  p.step(800);
  p.window.WorkshopIntro.navigate('/', '/prints/');
  p.step(3000);
  assert.equal(p.phase(), undefined);
  assert.equal(p.document.body.inert, false);
  assert.equal(p.frames.size, 0);
});

test('internal workshop navigation and admin do not restart the entrance', () => {
  const p = page();
  assert.equal(p.window.WorkshopIntro.navigate('/prints/detail/?id=demo', '/prints/'), false);
  assert.equal(p.window.WorkshopIntro.navigate('/admin/prints/', '/'), false);
  assert.equal(p.phase(), undefined);
  assert.equal(p.frames.size, 0);
});

test('mobile controls the existing lightweight canvas only', () => {
  const p = page({path: '/prints/', mobile: true});
  p.window.WorkshopIntro.enter(p.root());
  p.step(800);
  assert.ok(p.speeds.every(([engine]) => engine === 'mobile'));
  assert.equal(p.speeds.at(-1)[1], 40);
});

test('failed navigation releases the old page within eight seconds', () => {
  const p = page();
  p.window.WorkshopIntro.navigate('/prints/', '/');
  p.step(8001);
  assert.equal(p.phase(), undefined);
  assert.equal(p.document.body.inert, false);
});

test('reduced motion preserves the requested warp and simplifies content reveal', () => {
  const p = page({path: '/prints/', reduced: true});
  p.window.WorkshopIntro.enter(p.root());
  p.step(200);
  assert.ok(p.speeds.at(-1)[1] > 5 && p.speeds.at(-1)[1] < 40);
  p.step(300);
  assert.equal(p.phase(), 'warp');
  assert.equal(p.speeds.at(-1)[1], 40);
  p.step(450);
  assert.equal(p.phase(), 'reveal');
  assert.ok(p.animations.every(a => a.timing.duration === 160));
  assert.ok(p.animations.every(a => a.keyframes.every(frame => !frame.transform)));
  p.step(675);
  assert.ok(p.speeds.at(-1)[1] > 5 && p.speeds.at(-1)[1] < 40);
  p.step(1000);
  assert.equal(p.phase(), undefined);
  assert.equal(p.speeds.at(-1)[1], 5);
  assert.equal(p.document.body.inert, false);
});

test('mobile reduced-motion navigation still accelerates the existing background', () => {
  const p = page({mobile: true, reduced: true});
  assert.equal(p.window.WorkshopIntro.navigate('/prints/', '/'), true);
  p.window.WorkshopIntro.enter(p.root());
  p.step(300);
  assert.equal(p.speeds.at(-1)[1], 40);
  assert.ok(p.speeds.every(([engine]) => engine === 'mobile'));
  p.step(450); p.step(1000);
  assert.equal(p.phase(), undefined);
  assert.equal(p.speeds.at(-1)[1], 5);
});

test('pagehide cancels the entrance so history restoration remains usable', () => {
  const p = page({path: '/prints/'});
  p.events.pagehide();
  assert.equal(p.phase(), undefined);
  assert.equal(p.document.body.inert, false);
  assert.equal(p.frames.size, 0);
});
