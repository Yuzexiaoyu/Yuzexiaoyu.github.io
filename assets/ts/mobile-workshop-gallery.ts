// Touch navigation is installed only by the mobile workshop detail page.
export function initMobileGallerySwipe(stage: HTMLElement, buttons: HTMLButtonElement[], signal: AbortSignal) {
  const strip = buttons[0]?.parentElement;
  const active = () => buttons.find(button => button.getAttribute('aria-pressed') === 'true');
  const reveal = () => {
    const button = active();
    if (!strip || !button) return;
    const frame = strip.getBoundingClientRect(), item = button.getBoundingClientRect();
    if (item.left < frame.left + 3) strip.scrollLeft += item.left - frame.left - 3;
    else if (item.right > frame.right - 3) strip.scrollLeft += item.right - frame.right + 3;
  };
  if (buttons.length < 2) return reveal;

  let gesture: {id: number; x: number; y: number; horizontal: boolean; button?: HTMLButtonElement}|null = null;
  let ignoreClickUntil = 0;
  stage.addEventListener('touchstart', event => {
    gesture = null;
    ignoreClickUntil = 0;
    if (event.touches.length !== 1) return;
    const target = event.target as Element;
    // Model drags belong to the viewer. Its transparent edge areas target the stage.
    if (target.closest('model-viewer,button,a,input,select,textarea')) return;
    const touch = event.touches[0], frame = stage.getBoundingClientRect();
    const video = stage.querySelector<HTMLVideoElement>('video:not([hidden])');
    // Leave the native video control strip available for seeking and volume.
    if (video?.controls && touch.clientY >= frame.bottom - 56) return;
    gesture = {id: touch.identifier, x: touch.clientX, y: touch.clientY, horizontal: false, button: active()};
  }, {passive: true, signal});
  stage.addEventListener('touchmove', event => {
    if (!gesture) return;
    if (event.touches.length !== 1) {gesture = null; return;}
    const touch = event.touches[0];
    if (touch.identifier !== gesture.id) {gesture = null; return;}
    const dx = Math.abs(touch.clientX - gesture.x), dy = Math.abs(touch.clientY - gesture.y);
    if (!gesture.horizontal) {
      if (Math.max(dx,dy) < 10) return;
      if (dx <= dy * 1.25) {gesture = null; return;}
      gesture.horizontal = true;
    }
    if (event.cancelable) event.preventDefault();
  }, {passive: false, signal});
  stage.addEventListener('touchend', event => {
    const swipe = gesture;
    gesture = null;
    if (!swipe?.horizontal || event.touches.length || active() !== swipe.button) return;
    const touch = Array.from(event.changedTouches).find(point => point.identifier === swipe.id);
    if (!touch) return;
    ignoreClickUntil = performance.now() + 400;
    if (event.cancelable) event.preventDefault();
    const dx = touch.clientX - swipe.x, dy = touch.clientY - swipe.y;
    const threshold = Math.max(40,Math.min(64,stage.clientWidth * .12));
    if (Math.abs(dx) < threshold || Math.abs(dx) <= Math.abs(dy) * 1.25) return;
    const index = buttons.indexOf(swipe.button!);
    buttons[index + (dx < 0 ? 1 : -1)]?.click();
  }, {passive: false, signal});
  stage.addEventListener('touchcancel', () => {gesture = null;}, {passive: true, signal});
  stage.addEventListener('click', event => {
    if (performance.now() >= ignoreClickUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, {capture: true, signal});
  return reveal;
}
