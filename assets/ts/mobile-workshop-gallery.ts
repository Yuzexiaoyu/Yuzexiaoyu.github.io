// Touch navigation is installed only by the mobile workshop detail page.
export function initMobileGallerySwipe(stage: HTMLElement, buttons: HTMLButtonElement[], posters: (string|null|undefined)[], signal: AbortSignal) {
  const strip = buttons[0]?.parentElement;
  const active = () => buttons.find(button => button.getAttribute('aria-pressed') === 'true');
  const media = Array.from(stage.querySelectorAll<HTMLElement>(':scope > .wk-stage-image,:scope > .wk-stage-video,:scope > .wk-video-replay,:scope > model-viewer,:scope > .wk-viewer-loading,:scope > .wk-viewer-failed'));
  const preview = document.createElement('img');
  preview.className = 'wk-swipe-preview';
  preview.alt = ''; preview.setAttribute('aria-hidden','true'); preview.decoding = 'async'; preview.draggable = false;
  const warmed = new Map<string,HTMLImageElement>();
  type Gesture = {id: number; x: number; y: number; base: number; raw: number; lastX: number; lastTime: number; velocity: number; horizontal: boolean; button: HTMLButtonElement; resume?: HTMLButtonElement};
  type Snap = {animations: Animation[]; target?: HTMLButtonElement};
  let gesture: Gesture|null = null, snap: Snap|null = null;
  let visualButton: HTMLButtonElement|undefined, width = 0, offset = 0, neighborSide = 1;
  let committing = false, ignoreClickUntil = 0;

  const clear = () => {
    gesture = null;
    const previous = snap; snap = null;
    previous?.animations.forEach(animation => animation.cancel());
    preview.remove();
    stage.classList.remove('is-swiping');
    stage.style.removeProperty('--wk-swipe-x');
    stage.style.removeProperty('--wk-swipe-neighbor-x');
    media.forEach(element => element.classList.remove('wk-swipe-current'));
    visualButton = undefined; offset = 0;
  };
  const reveal = () => {
    if (!committing && (gesture || snap)) clear();
    const button = active();
    if (!strip || !button) return;
    const frame = strip.getBoundingClientRect(), item = button.getBoundingClientRect();
    if (item.left < frame.left + 3) strip.scrollLeft += item.left - frame.left - 3;
    else if (item.right > frame.right - 3) strip.scrollLeft += item.right - frame.right + 3;
    // Warm adjacent posters only; videos and 3D stay lazy until actually selected.
    const index = buttons.indexOf(button);
    for (const adjacent of [index-1,index+1]) {
      const url = posters[adjacent];
      if (!url || warmed.has(url)) continue;
      const image = new Image(); image.decoding = 'async'; image.src = url; warmed.set(url,image);
    }
  };
  if (buttons.length < 2) return reveal;

  const paint = (raw: number) => {
    const index = buttons.indexOf(visualButton!);
    neighborSide = raw < 0 ? 1 : -1;
    const neighbor = index + neighborSide, available = !!buttons[neighbor];
    offset = available ? Math.max(-width,Math.min(width,raw)) : Math.sign(raw)*Math.min(52,Math.abs(raw)*.26);
    stage.classList.add('is-swiping');
    media.forEach(element => element.classList.add('wk-swipe-current'));
    stage.style.setProperty('--wk-swipe-x',`${offset}px`);
    stage.style.setProperty('--wk-swipe-neighbor-x',`${neighborSide*width+offset}px`);
    const url = posters[neighbor];
    preview.hidden = !available || !url;
    if (url && preview.getAttribute('src') !== url) preview.src = url;
    if (!preview.isConnected) stage.append(preview);
  };
  const settle = (target?: HTMLButtonElement) => {
    if (!visualButton || !stage.classList.contains('is-swiping')) return;
    const destination = target ? (buttons.indexOf(target)>buttons.indexOf(visualButton)?-width:width) : 0;
    const run: Snap = {animations: [],target}; snap = run;
    const finish = () => {
      if (snap !== run) return;
      snap = null;
      if (target && !signal.aborted) {
        committing = true;
        try {target.click();} finally {committing = false;}
      }
      run.animations.forEach(animation => animation.cancel());
      clear();
    };
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : Math.max(140,Math.min(260,Math.abs(destination-offset)/width*260));
    if (!duration || Math.abs(destination-offset)<.5) {finish(); return;}
    const animate = (element: HTMLElement, shift: number) => {
      const animation = element.animate([
        {transform:`translate3d(${offset+shift}px,0,0)`},
        {transform:`translate3d(${destination+shift}px,0,0)`}
      ],{duration,easing:'cubic-bezier(.22,.61,.36,1)',fill:'both'});
      animation.id = 'workshop-gallery-snap'; run.animations.push(animation);
    };
    const videoVisible=!!stage.querySelector('video:not([hidden])');
    media.filter(element => !element.hidden||(videoVisible&&element.matches('.wk-video-replay'))).forEach(element => animate(element,0));
    if (!preview.hidden) animate(preview,neighborSide*width);
    void Promise.all(run.animations.map(animation => animation.finished)).then(finish,()=>{});
  };
  const takeOver = () => {
    if (!snap) return {base: 0,resume: undefined};
    const previous = snap, element = media.find(node => !node.hidden)!;
    const transform = getComputedStyle(element).transform;
    const position = transform==='none'?0:new DOMMatrixReadOnly(transform).m41;
    const neighbor = buttons[buttons.indexOf(visualButton!)+(position<0?1:-1)];
    const base = neighbor?position:position/.26;
    snap = null;
    // Freeze the current visual position before cancelling the compositor animations.
    paint(base);
    previous.animations.forEach(animation => animation.cancel());
    return {base,resume: previous.target};
  };
  const abandon = () => {
    const previous = gesture; gesture = null;
    if (previous) settle(previous.resume);
  };
  stage.addEventListener('touchstart', event => {
    ignoreClickUntil = 0;
    if (event.touches.length !== 1) {abandon(); return;}
    const target = event.target as Element;
    // Model drags belong to the viewer. Its transparent edge areas target the stage.
    const buttonTarget=target.closest('button');
    if (target.closest('model-viewer,a,input,select,textarea')||(buttonTarget&&!buttonTarget.hasAttribute('data-video-replay'))) return;
    const touch = event.touches[0], frame = stage.getBoundingClientRect();
    const button = active(); if (!button) return;
    const resumed = takeOver();
    visualButton = button; width = frame.width;
    gesture = {id: touch.identifier, x: touch.clientX, y: touch.clientY, base: resumed.base, raw: resumed.base, lastX: touch.clientX, lastTime: performance.now(), velocity: 0, horizontal: false, button, resume: resumed.resume};
  }, {passive: true, signal});
  stage.addEventListener('touchmove', event => {
    if (!gesture) return;
    if (event.touches.length !== 1) {abandon(); return;}
    const touch = event.touches[0];
    if (touch.identifier !== gesture.id) {abandon(); return;}
    const dx = touch.clientX-gesture.x, dy = touch.clientY-gesture.y;
    if (!gesture.horizontal) {
      if (Math.max(Math.abs(dx),Math.abs(dy))<6) return;
      if (Math.abs(dx)<=Math.abs(dy)*1.25) {abandon(); return;}
      gesture.horizontal = true;
    }
    if (event.cancelable) event.preventDefault();
    const now = performance.now(), elapsed = now-gesture.lastTime;
    if (elapsed>0) gesture.velocity = (touch.clientX-gesture.lastX)/elapsed;
    gesture.lastX = touch.clientX; gesture.lastTime = now;
    gesture.raw = gesture.base+dx;
    paint(gesture.raw);
  }, {passive: false, signal});
  stage.addEventListener('touchend', event => {
    const swipe = gesture; gesture = null;
    if (!swipe) return;
    if (active() !== swipe.button) {clear(); return;}
    if (!swipe.horizontal || event.touches.length) {settle(swipe.resume); return;}
    const touch = Array.from(event.changedTouches).find(point => point.identifier === swipe.id);
    if (!touch) {settle(); return;}
    ignoreClickUntil = performance.now()+400;
    if (event.cancelable) event.preventDefault();
    const dx = swipe.base+touch.clientX-swipe.x, dy = touch.clientY-swipe.y;
    const velocity = performance.now()-swipe.lastTime<100?swipe.velocity:0;
    const farEnough = Math.abs(dx)>=Math.max(48,Math.min(96,width*.23));
    const flick = Math.abs(dx)>=24 && Math.abs(velocity)>.45 && Math.sign(velocity)===Math.sign(dx);
    const neighbor = buttons[buttons.indexOf(swipe.button)+(dx<0?1:-1)];
    settle(Math.abs(dx)>Math.abs(dy)*1.25 && (farEnough || flick)?neighbor:undefined);
  }, {passive: false, signal});
  stage.addEventListener('touchcancel', abandon, {passive: true, signal});
  stage.addEventListener('click', event => {
    if (performance.now() >= ignoreClickUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, {capture: true, signal});
  window.addEventListener('resize',clear,{signal});
  signal.addEventListener('abort',clear,{once:true});
  return reveal;
}
