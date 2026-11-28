export function bindExpeditionImprint(root: HTMLElement, template: HTMLTemplateElement, signal: AbortSignal) {
  const mobile = document.documentElement.dataset.ui === 'mobile';
  const layer = document.createElement('div');
  layer.className = 'exp33-imprint-layer';
  layer.setAttribute('aria-hidden', 'true');
  layer.inert = true;

  function clear() {
    layer.replaceChildren();
    layer.remove();
  }

  layer.addEventListener('animationend', event => {
    if (event.animationName !== 'exp33-imprint-fade' || !(event.target instanceof Element)) return;
    event.target.remove();
    if (!layer.childElementCount) layer.remove();
  }, {signal});

  // Some browsers still deliver click as a MouseEvent, including clicks following a touch.
  let lastPointerType = '';
  root.addEventListener('pointerdown', event => { lastPointerType = event.pointerType; }, {capture:true, passive:true, signal});
  root.addEventListener('click', event => {
    const pointerType = (event as PointerEvent).pointerType || lastPointerType;
    const canImprint = pointerType === 'mouse' || (mobile && pointerType === 'touch');
    if (!canImprint || event.button !== 0 || event.detail === 0) return;

    // Card and cart clicks can change the topmost dialog before the event reaches the topic.
    const dialog = document.elementFromPoint(event.clientX, event.clientY)?.closest('dialog[open]');
    const surface = dialog && root.contains(dialog) ? dialog : root;
    if (surface !== layer.parentElement) surface.append(layer);

    const mark = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
    mark.style.left = event.clientX + 'px';
    mark.style.top = event.clientY + 'px';
    if (layer.childElementCount >= 6) layer.firstElementChild?.remove();
    layer.append(mark);
  }, {passive:true, signal});

  signal.addEventListener('abort', clear, {once:true});
}
