import {CONTACT_QQ, escapeHTML as e, setStatus, Settings} from './workshop-shared';

export type OpenContact = (list: string, settings: Settings) => void;

export function bindWorkshopContact(root: HTMLElement, signal: AbortSignal): OpenContact {
  const dialog = root.querySelector<HTMLDialogElement>('[data-contact-dialog]')!;
  const body = dialog.querySelector<HTMLElement>('.wk-contact-body')!;
  const text = dialog.querySelector<HTMLTextAreaElement>('[data-contact-text]')!;
  const number = dialog.querySelector<HTMLElement>('[data-contact-number]')!;
  const feedback = dialog.querySelector<HTMLElement>('[data-copy-feedback]')!;
  const qr = dialog.querySelector<HTMLElement>('[data-contact-qr]')!;
  number.textContent = CONTACT_QQ;
  dialog.querySelector('[data-close-dialog]')!.addEventListener('click', () => dialog.close(), {signal});
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  }, {signal});

  let copyAttempt = 0;
  dialog.addEventListener('close', () => { copyAttempt++; }, {signal});
  async function copy(value: string, message: string, fallback: () => string) {
    const attempt = ++copyAttempt;
    const active = () => !signal.aborted && dialog.open && attempt === copyAttempt;
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      if (active()) setStatus(feedback, fallback(), true);
      return;
    }
    if (active()) setStatus(feedback, message);
  }
  dialog.querySelector('[data-copy-again]')!.addEventListener('click', () => {
    void copy(text.value, '清单已复制，可以粘贴到 QQ。', () => {
      text.focus();
      text.select();
      return '已选中清单，请手动复制。';
    });
  }, {signal});
  dialog.querySelector('[data-copy-qq]')!.addEventListener('click', () => {
    void copy(CONTACT_QQ, 'QQ 号已复制。', () => {
      number.scrollIntoView({block:'nearest'});
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(number);
      selection?.removeAllRanges();
      selection?.addRange(range);
      return '请长按或选中上方 QQ 号手动复制。';
    });
  }, {signal});

  return (list, settings) => {
    text.value = list;
    qr.innerHTML = settings.qq_image ? `<img class="wk-contact-qr" src="${e(settings.qq_image.url)}" alt="店主 QQ 联系二维码">` : '';
    setStatus(feedback, '');
    if (!dialog.open) dialog.showModal();
    body.scrollTop = 0;
    text.setSelectionRange(0, 0);
    text.scrollTop = 0;
  };
}
