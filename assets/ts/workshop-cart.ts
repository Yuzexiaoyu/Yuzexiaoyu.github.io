import type {OpenContact} from './workshop-contact';
import {publicApi as api} from './workshop-public';
import {Entry, Settings, abortError, escapeHTML as e, money, setStatus, workPriceAt} from './workshop-shared';

type CartSelection = {id: string; name: string; colorId?: string; infill?: number};
type CartLine = CartSelection & {quantity: number};
const storageKey = 'workshop-cart-v1';
const maxQuantity = 99;
let memory: CartLine[] = [];
let memoryOnly = false;

function sameSelection(a: CartSelection, b: CartSelection) {
  return a.id === b.id && a.colorId === b.colorId && a.infill === b.infill;
}

function readCart(): CartLine[] {
  if (memoryOnly) return memory;
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    if (Array.isArray(saved)) {
      return saved.filter((line): line is CartLine =>
        !!line && typeof line.id === 'string' && typeof line.name === 'string' &&
        Number.isInteger(line.quantity) && line.quantity > 0 && line.quantity <= maxQuantity &&
        (line.colorId === undefined ||
          (typeof line.colorId === 'string' && Number.isInteger(line.infill) && line.infill >= 15 && line.infill <= 100)));
    }
    return [];
  } catch {
    return memory;
  }
}

function saveCart(lines: CartLine[]) {
  memory = lines;
  if (memoryOnly) return;
  try { localStorage.setItem(storageKey, JSON.stringify(lines)); }
  catch { memoryOnly = true; }
}

function getLineDetails(line: CartLine, entry?: Entry) {
  const configurable = entry?.kind === 'work';
  const color = configurable ? entry.colors.find(option => option.id === line.colorId && option.active) : undefined;
  const infill = configurable ? line.infill : entry?.fixed_infill;
  let price: number | null = null;
  if (entry?.status === 'published' && configurable === Boolean(line.colorId)) {
    if (!configurable) price = entry.fixed_price;
    else if (color && typeof infill === 'number' && (entry.fixed_infill == null || entry.fixed_infill === infill)) {
      price = workPriceAt(entry, color.id, infill);
    }
  }
  const material = configurable ? color?.material : entry?.material;
  const name = entry?.name ?? line.name;
  const cover = entry?.images[0]?.url;
  return {name, color, infill, material, price, cover, quantity: line.quantity};
}

export function bindWorkshopCart(root: HTMLElement, signal: AbortSignal, openContact: OpenContact) {
  const dialog = root.querySelector<HTMLDialogElement>('[data-cart]')!;
  const close = dialog.querySelector<HTMLButtonElement>('[data-close-cart]')!;
  const list = dialog.querySelector<HTMLUListElement>('[data-cart-list]')!;
  const empty = dialog.querySelector<HTMLElement>('[data-cart-empty]')!;
  const footer = dialog.querySelector<HTMLElement>('[data-cart-footer]')!;
  const feedback = dialog.querySelector<HTMLElement>('[data-cart-feedback]')!;
  const total = dialog.querySelector<HTMLElement>('[data-cart-total]')!;
  const retry = dialog.querySelector<HTMLButtonElement>('[data-cart-retry]')!;
  const checkout = dialog.querySelector<HTMLButtonElement>('[data-cart-checkout]')!;
  const trigger = root.querySelector<HTMLButtonElement>('[data-open-cart]')!;
  const badge = trigger.querySelector<HTMLElement>('[data-cart-count]')!;
  let lines = readCart();
  let entries: Map<string | undefined, Entry> | undefined;
  let request: AbortController | undefined;
  let failed = false;
  let landing: Animation | undefined;

  function flyToCart(event: MouseEvent, detailSignal: AbortSignal) {
    if (detailSignal.aborted || !trigger.animate) return;
    const source = (event.currentTarget as HTMLButtonElement).getBoundingClientRect();
    const target = trigger.getBoundingClientRect();
    const startX = event.detail ? event.clientX : source.left + source.width / 2;
    const startY = event.detail ? event.clientY : source.top + source.height / 2;
    const endX = target.left + target.width / 2;
    const endY = target.top + target.height / 2;
    const distance = Math.hypot(endX - startX, endY - startY);
    const controlX = Math.abs(endX - startX) < 72 ? Math.max(12, Math.min(startX, endX) - 58) : (startX + endX) / 2;
    const rise = Math.min(136, Math.max(54, distance * 0.23));
    const controlY = Math.max(10, Math.min(startY, endY) - rise);
    const frames = Array.from({length: 21}, (_, index) => {
      const t = index / 20;
      const remaining = 1 - t;
      const x = remaining ** 2 * startX + 2 * remaining * t * controlX + t ** 2 * endX;
      const y = remaining ** 2 * startY + 2 * remaining * t * controlY + t ** 2 * endY;
      const arrival = Math.max(0, (t - 0.8) / 0.2);
      return {
        transform: `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%) scale(${1 - 0.72 * arrival})`,
        opacity: 1 - arrival ** 2,
      };
    });

    const ball = document.createElement('span');
    ball.className = 'wk-cart-flight';
    ball.setAttribute('aria-hidden', 'true');
    // The launcher and the flight must share the topic dialog's top layer.
    trigger.after(ball);
    const flight = ball.animate(frames, {
      duration: Math.min(580, Math.max(410, 370 + distance * 0.23)),
      easing: 'cubic-bezier(.22, .53, .53, .98)',
      fill: 'both',
    });
    const cancel = () => flight.cancel();
    detailSignal.addEventListener('abort', cancel, {once: true});
    void flight.finished.then(() => {
      if (detailSignal.aborted || dialog.open || !trigger.isConnected) return;
      landing?.cancel();
      landing = trigger.animate([
        {transform: 'scale(1)'},
        {transform: 'scale(1.12)', offset: 0.4},
        {transform: 'scale(1)'},
      ], {duration: 180, easing: 'ease-out'});
    }, () => {}).finally(() => {
      detailSignal.removeEventListener('abort', cancel);
      ball.remove();
    });
  }

  const getItems = () => lines.map(line => getLineDetails(line, entries?.get(line.id)));
  const sum = (items: ReturnType<typeof getItems>) =>
    items.reduce((subtotal, item) => subtotal + (item.price ?? 0) * item.quantity, 0);

  function render() {
    const count = lines.reduce((quantity, line) => quantity + line.quantity, 0);
    badge.hidden = !count;
    badge.textContent = count > 99 ? '99+' : String(count);
    trigger.setAttribute('aria-label', count ? `购物车，${count} 件` : '购物车');
    if (!dialog.open) return;
    const items = getItems();
    const unavailable = !!entries && items.some(item => item.price == null);
    empty.hidden = !!count;
    list.hidden = footer.hidden = !count;
    retry.hidden = !failed;
    checkout.disabled = !count || !!request || !entries || unavailable;
    const subtotal = money(sum(items));
    dialog.style.setProperty('--wk-cart-amount-chars', String(subtotal.length));
    total.textContent = entries && !unavailable ? subtotal : '—';
    list.innerHTML = items.map((item, index) => {
      const specs = [item.color?.name, item.material, item.infill == null ? '' : `${item.infill}% 填充`].filter(Boolean);
      return `<li class="wk-cart-line" data-cart-line="${index}">
        <div class="wk-cart-cover">${item.cover ? `<img src="${e(item.cover)}" alt="" loading="lazy" decoding="async">` : ''}</div>
        <div class="wk-cart-item"><strong>${e(item.name)}</strong>
          ${specs.length ? `<p>${e(specs.join(' · '))}</p>` : ''}
          ${item.price == null && entries ? '<p class="wk-cart-unavailable">已下架或规格不可用，请移除后重新选择。</p>' : ''}
        </div>
        ${item.price == null ? '' : `<strong class="wk-cart-subtotal">${money(item.price * item.quantity)}</strong>`}
        <div class="wk-cart-quantity" role="group" aria-label="${e([item.name, ...specs].join('，'))}">
          <button type="button" data-cart-action="less" aria-label="减少数量"${item.quantity === 1 ? ' disabled' : ''}>−</button>
          <span aria-label="${item.quantity} 件">${item.quantity}</span>
          <button type="button" data-cart-action="more" aria-label="增加数量"${item.quantity === maxQuantity ? ' disabled' : ''}>+</button>
        </div>
        <button type="button" class="wk-cart-remove" data-cart-action="remove" aria-label="移除 ${e(item.name)}">移除</button>
      </li>`;
    }).join('');
  }

  async function refresh(forContact = false) {
    request?.abort();
    const current = new AbortController();
    request = current;
    failed = false;
    setStatus(feedback, '正在核对报价…');
    render();
    try {
      const catalog = api<{entries: Entry[]}>('/api/catalog', current.signal, true);
      const [latest, settings] = await Promise.all([
        catalog, forContact ? api<Settings>('/api/settings', current.signal) : undefined,
      ]);
      if (current.signal.aborted) return;
      entries = new Map(latest.entries.map(entry => [entry.id, entry]));
      const items = getItems();
      const unavailable = items.some(item => item.price == null);
      setStatus(feedback, unavailable ? '请先移除不可用的商品。' : '', unavailable);
      if (settings && items.length && !unavailable) {
        const text = items.map(item => [
          `商品：${item.name}`, `材质：${item.material || '—'}`,
          ...(item.color ? [`颜色：${item.color.name}`] : []),
          ...(item.infill == null ? [] : [`填充比例：${item.infill}%`]),
          `数量：${item.quantity}`, `小计：${money(item.price! * item.quantity)}`,
        ].join('\n')).join('\n\n');
        request = undefined;
        render();
        checkout.focus({preventScroll: true});
        openContact(`${text}\n\n合计：${money(sum(items))}`, settings);
      }
    } catch (error) {
      if (!current.signal.aborted && !abortError(error)) {
        failed = true;
        entries = undefined;
        setStatus(feedback, '暂时无法获取报价，请重试。', true);
      }
    } finally {
      if (request === current) {
        request = undefined;
        render();
      }
    }
  }

  function sync() {
    lines = readCart();
    render();
    if (dialog.open && lines.length && !entries && !request && !failed) void refresh();
  }
  trigger.hidden = false;
  trigger.addEventListener('click', () => {
    entries = undefined;
    failed = false;
    setStatus(feedback, '');
    dialog.showModal();
    sync();
  }, {signal});
  close.addEventListener('click', () => dialog.close(), {signal});
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  }, {signal});
  const cancelRequest = () => { request?.abort(); request = undefined; };
  dialog.addEventListener('close', () => { if (!dialog.open) cancelRequest(); }, {signal});
  signal.addEventListener('abort', cancelRequest, {once: true});
  signal.addEventListener('abort', () => landing?.cancel(), {once: true});
  window.addEventListener('storage', event => {
    if (event.key === storageKey || event.key === null) sync();
  }, {signal});
  list.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('[data-cart-action]') : null;
    if (!button) return;
    const selected = lines[Number(button.closest<HTMLElement>('[data-cart-line]')?.dataset.cartLine)];
    if (!selected) return;
    lines = readCart();
    const index = lines.findIndex(line => sameSelection(line, selected));
    const action = button.dataset.cartAction;
    if (index >= 0) {
      const line = lines[index];
      if (action === 'remove') lines.splice(index, 1);
      else line.quantity = Math.min(maxQuantity, Math.max(1, line.quantity + (action === 'more' ? 1 : -1)));
      saveCart(lines);
    }
    if (!request && !failed && getItems().every(item => item.price != null)) setStatus(feedback, '');
    render();
    const row = list.children[Math.min(index, lines.length - 1)];
    const focus = row?.querySelector<HTMLButtonElement>(`[data-cart-action="${action}"]:not(:disabled)`)
      ?? row?.querySelector<HTMLButtonElement>('[data-cart-action="remove"]') ?? close;
    focus.focus({preventScroll: true});
  }, {signal});
  retry.addEventListener('click', () => void refresh(), {signal});
  checkout.addEventListener('click', () => void refresh(true), {signal});
  render();

  return (selection: CartSelection, event: MouseEvent, detailSignal: AbortSignal) => {
    lines = readCart();
    const existing = lines.find(line => sameSelection(line, selection));
    if (existing?.quantity === maxQuantity) return false;
    if (existing) existing.quantity++;
    else lines.push({...selection, quantity: 1});
    saveCart(lines);
    render();
    flyToCart(event, detailSignal);
    return true;
  };
}
