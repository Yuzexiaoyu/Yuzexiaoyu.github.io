type ReaderSwipeOptions = {
  page: () => number;
  count: () => number;
  width: () => number;
  ready: () => boolean;
  goTo: (page: number) => void;
};

export function createMobileReaderSwipe(content: HTMLElement, viewport: HTMLElement, options: ReaderSwipeOptions) {
  const controller = new AbortController();
  const {signal} = controller;
  type Gesture = {id:number; x:number; y:number; base:number; page:number; width:number; horizontal:boolean; lastX:number; lastAt:number; velocity:number};
  let gesture: Gesture|null = null;
  let animation: Animation|null = null;
  let ignoreClickUntil = 0;
  const selectedText = () => !!window.getSelection()?.toString();
  const zoomed = () => (window.visualViewport?.scale || 1) > 1.05;
  const position = (x: number) => { content.style.transform = `translate3d(${x}px,0,0)`; };
  const cancelAnimation = () => {
    const previous = animation; animation = null;
    if (previous) { previous.onfinish = null; previous.cancel(); }
  };
  function reset() {
    gesture = null;
    cancelAnimation();
    viewport.classList.remove('m-reader-dragging');
    position(-options.page() * options.width());
  }
  function settle(page = options.page()) {
    const painted = getComputedStyle(content).transform;
    const from = painted === 'none' ? 0 : new DOMMatrixReadOnly(painted).m41;
    gesture = null;
    cancelAnimation();
    if (!options.ready()) { reset(); return; }
    // Commit reading progress once on release; the animation only moves the painted strip.
    if (page !== options.page()) options.goTo(page);
    const to = -options.page() * options.width();
    position(to);
    if (Math.abs(from-to) < .5 || matchMedia('(prefers-reduced-motion: reduce)').matches) { reset(); return; }
    viewport.classList.add('m-reader-dragging');
    const snap = content.animate([
      {transform:`translate3d(${from}px,0,0)`},
      {transform:`translate3d(${to}px,0,0)`}
    ], {duration:Math.min(260,Math.max(140,Math.abs(from-to)/options.width()*260)),easing:'cubic-bezier(.22,.61,.36,1)',fill:'both'});
    animation = snap;
    snap.id = 'mobile-reader-snap';
    snap.onfinish = () => { if (animation === snap) reset(); };
  }
  viewport.addEventListener('touchstart', event => {
    if (event.touches.length !== 1 || !options.ready() || selectedText() || zoomed()) { reset(); return; }
    const target = event.target as Element;
    if (target.closest('a,button,input,select,textarea,[contenteditable="true"]')) return;
    const scroller = target.closest<HTMLElement>('pre,table');
    if (scroller && scroller.scrollWidth > scroller.clientWidth + 1) return;
    const touch = event.touches[0], frame = viewport.getBoundingClientRect();
    // Leave browser back/forward edge gestures available.
    if (touch.clientX < frame.left + 24 || touch.clientX > frame.right - 24) return;
    const painted = getComputedStyle(content).transform;
    const x = painted === 'none' ? 0 : new DOMMatrixReadOnly(painted).m41;
    cancelAnimation(); position(x);
    gesture = {id:touch.identifier,x:touch.clientX,y:touch.clientY,base:x+options.page()*options.width(),page:options.page(),width:options.width(),horizontal:false,lastX:touch.clientX,lastAt:performance.now(),velocity:0};
  }, {passive:true,signal});
  viewport.addEventListener('touchmove', event => {
    if (!gesture) return;
    if (event.touches.length !== 1 || !options.ready() || selectedText() || zoomed() || options.page() !== gesture.page) { reset(); return; }
    const touch = event.touches[0];
    if (touch.identifier !== gesture.id) { reset(); return; }
    const dx = touch.clientX - gesture.x, dy = touch.clientY - gesture.y;
    if (!gesture.horizontal) {
      if (Math.max(Math.abs(dx),Math.abs(dy)) < 7) return;
      if (Math.abs(dx) <= Math.abs(dy) * 1.2) { settle(); return; }
      gesture.horizontal = true;
      viewport.classList.add('m-reader-dragging');
    }
    if (event.cancelable) event.preventDefault();
    const now = performance.now(), elapsed = now - gesture.lastAt;
    if (elapsed > 0) gesture.velocity = (touch.clientX-gesture.lastX)/elapsed;
    gesture.lastX = touch.clientX; gesture.lastAt = now;
    let offset = Math.max(-gesture.width,Math.min(gesture.width,gesture.base+dx));
    if ((gesture.page === 0 && offset > 0) || (gesture.page === options.count()-1 && offset < 0)) {
      offset = Math.sign(offset) * Math.min(52,Math.abs(offset) * .24);
    }
    position(-gesture.page * gesture.width + offset);
  }, {passive:false,signal});
  viewport.addEventListener('touchend', event => {
    const swipe = gesture;
    if (!swipe) return;
    gesture = null;
    if (!swipe.horizontal || event.touches.length || selectedText() || zoomed()) { settle(); return; }
    const touch = Array.from(event.changedTouches).find(touch => touch.identifier === swipe.id);
    if (!touch) { settle(); return; }
    if (event.cancelable) event.preventDefault();
    ignoreClickUntil = performance.now() + 400;
    const dx = swipe.base + touch.clientX-swipe.x;
    const velocity = performance.now()-swipe.lastAt < 100 ? swipe.velocity : 0;
    const turn = Math.abs(dx) >= Math.max(48,Math.min(96,swipe.width*.22)) || (Math.abs(dx) >= 26 && Math.abs(velocity) > .45 && Math.sign(velocity) === Math.sign(dx));
    const next = Math.max(0,Math.min(options.count()-1,swipe.page+(turn?(dx<0?1:-1):0)));
    settle(next);
  }, {passive:false,signal});
  viewport.addEventListener('touchcancel', () => { if (gesture) settle(); }, {passive:true,signal});
  viewport.addEventListener('click', event => {
    if (performance.now() >= ignoreClickUntil) return;
    event.preventDefault(); event.stopImmediatePropagation();
  }, {capture:true,signal});
  window.addEventListener('resize', reset, {signal});
  return {reset,destroy:() => { controller.abort(); reset(); }};
}
