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
  p.step(120);
  assert.ok(p.speeds.at(-1)[1] > 5 && p.speeds.at(-1)[1] < 32);
  assert.equal(p.phase(), 'warp');
  p.step(240);
  assert.equal(p.speeds.at(-1)[1], 32);
  assert.equal(p.phase(), 'reveal');
  p.step(550);
  assert.ok(p.animations.every(a => a.currentTime === 310));
  assert.ok(p.speeds.at(-1)[1] < 32);
  p.step(860);
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
  p.step(240); p.step(860);
  assert.equal(oldBody.inert, false);
  assert.equal(p.document.body.inert, false);
});

test('navigation away cancels hidden state and all queued entrance frames', () => {
  const p = page({path: '/prints/'});
  p.window.WorkshopIntro.enter(p.root());
  p.step(500);
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
  p.step(240);
  assert.ok(p.speeds.every(([engine]) => engine === 'mobile'));
  assert.equal(p.speeds.at(-1)[1], 32);
  p.step(860);
  assert.equal(p.speeds.at(-1)[1], 5);
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
  p.step(120);
  assert.ok(p.speeds.at(-1)[1] > 5 && p.speeds.at(-1)[1] < 32);
  assert.equal(p.phase(), 'warp');
  p.step(240);
  assert.equal(p.speeds.at(-1)[1], 32);
  assert.equal(p.phase(), 'reveal');
  assert.ok(p.animations.every(a => a.timing.duration === 160));
  assert.ok(p.animations.every(a => a.keyframes.every(frame => !frame.transform)));
  p.step(550);
  assert.ok(p.speeds.at(-1)[1] > 5 && p.speeds.at(-1)[1] < 32);
  p.step(860);
  assert.equal(p.phase(), undefined);
  assert.equal(p.speeds.at(-1)[1], 5);
  assert.equal(p.document.body.inert, false);
});

test('mobile reduced-motion navigation still accelerates the existing background', () => {
  const p = page({mobile: true, reduced: true});
  assert.equal(p.window.WorkshopIntro.navigate('/prints/', '/'), true);
  p.window.WorkshopIntro.enter(p.root());
  p.step(240);
  assert.equal(p.speeds.at(-1)[1], 32);
  assert.ok(p.speeds.every(([engine]) => engine === 'mobile'));
  p.step(860);
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

test('speed has one rounded peak with no hold or discontinuity at reveal', () => {
  const p = page({path: '/prints/'});
  p.window.WorkshopIntro.enter(p.root());
  const sample = time => {p.step(time); return p.speeds.at(-1)[1];};
  const ascent = [0, 60, 120, 180, 239, 240].map(sample);
  const descent = [241, 300, 450, 650, 800, 860].map(sample);
  assert.ok(ascent.every((value, i) => i === 0 || value > ascent[i - 1]));
  assert.ok(descent.every((value, i) => value < (i === 0 ? ascent.at(-1) : descent[i - 1])));
  assert.ok(32 - ascent.at(-2) < 0.01);
  assert.ok(32 - descent[0] < 0.01);
  assert.equal(descent.at(-1), 5);
  assert.equal(p.frames.size, 0);
});

test('slow navigation settles on schedule and content arrival never restarts warp', () => {
  const p = page();
  p.window.WorkshopIntro.navigate('/prints/', '/');
  p.step(240);
  assert.equal(p.speeds.at(-1)[1], 32);
  p.step(860);
  assert.equal(p.speeds.at(-1)[1], 5);
  assert.equal(p.phase(), 'warp');
  p.step(2000);
  p.window.WorkshopIntro.enter(p.root());
  p.step(2016);
  assert.equal(p.phase(), 'reveal');
  assert.equal(p.speeds.at(-1)[1], 5);
  p.step(2636);
  assert.equal(p.phase(), undefined);
  assert.equal(p.speeds.at(-1)[1], 5);
  assert.equal(p.document.body.inert, false);
});

test('a stalled first frame skips elapsed warp rather than flashing back to peak', () => {
  const p = page({path: '/prints/'});
  p.window.WorkshopIntro.enter(p.root());
  p.step(2000);
  assert.equal(p.phase(), 'reveal');
  assert.equal(p.speeds.at(-1)[1], 5);
  p.step(2620);
  assert.equal(p.phase(), undefined);
});

test('nested content moves without multiplying the outer opacity fade', () => {
  const p = page({path: '/prints/'});
  p.window.WorkshopIntro.enter(p.root());
  p.step(240);
  const groups = p.animations.filter(a => a.keyframes.some(frame => frame.transform));
  assert.ok(groups.length > 0);
  assert.ok(groups.every(a => a.keyframes.every(frame => frame.opacity === undefined)));
});
