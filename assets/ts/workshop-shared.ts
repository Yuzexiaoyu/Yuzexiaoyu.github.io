export type Asset = {id: string; name: string; url: string | null; kind: string; size: number};
export type Color = {id: string; name: string; hex: string; active: number};
export type Entry = {id?: string; revision?: number; name: string; description: string; kind: 'work'|'product'; status: 'draft'|'published'|'archived'; min_price: number; max_price: number; color_ids: string[]; image_ids: string[]; model_id: string|null; source_id: string|null; images: Asset[]; model: Asset|null; source?: Asset|null; colors: Color[]; is_demo: boolean};
export type Settings = {name: string; qq_asset: string|null; qq_image: Asset|null};
export const escapeHTML = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const quote = (low: number, high: number, infill: number) => Math.floor((2 * (low * 85 + (high - low) * (infill - 15)) + 85) / 170);
export const money = (price: number) => `¥${price.toLocaleString('zh-CN')}`;
export function setStatus(node: HTMLElement | null, message: string, error = false) { if(node) {node.textContent = message; node.classList.toggle('is-error', error);} }
export async function api<T>(url: string, signal?: AbortSignal, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {...options, signal, credentials:'same-origin', cache:'no-store'});
  if(!response.headers.get('content-type')?.includes('application/json')) throw new Error('工坊服务尚未启动。请运行项目根目录的“启动工坊.cmd”，再打开本地工坊地址。');
  const data = await response.json();
  if(!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}
export function replaceQuery(params: URLSearchParams) {
  const url = `${location.pathname}?${params.toString()}`;
  const state = {...history.state};
  if(state.source === 'swup') state.url = url;
  history.replaceState(state, '', url);
}
export function abortError(error: any) {return error?.name === 'AbortError';}
