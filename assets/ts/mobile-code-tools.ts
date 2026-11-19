/** The wrap and copy controls share one footer, whichever initializes first. */
export function getMobileCodeTools(block: Element): HTMLElement {
  const existing = block.querySelector<HTMLElement>(':scope > .code-tools');
  if (existing) return existing;

  const tools = document.createElement('div');
  tools.className = 'code-tools';
  const language = block.querySelector<HTMLElement>('code[data-lang]')?.dataset.lang;
  if (language) {
    const label = document.createElement('span');
    label.className = 'code-language';
    label.textContent = language.toUpperCase();
    tools.append(label);
  }
  block.append(tools);
  return tools;
}
