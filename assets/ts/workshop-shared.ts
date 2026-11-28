export type Asset = {id: string; name: string; url: string | null; brotli_url?: string; av1?: {url: string; size: number}; kind: string; size: number};
export type Color = {id: string; name: string; hex: string; active: number; material: string};
export type ColorPreview = {image_ids: string[]; video_ids: string[]; accent?: string};
export type Entry = {id?: string; revision?: number; name: string; description: string; material: string; kind: 'work'|'product'; status: 'draft'|'published'|'archived'; topic?: string; topic_only?: boolean; min_price: number; max_price: number; fixed_price: number|null; fixed_infill?: number|null; weight_g: number|null; weight_approximate?: boolean; min_weight_g: number|null; max_weight_g: number|null; color_ids: string[]; image_ids: string[]; video_ids: string[]; model_id: string|null; source_id: string|null; images: Asset[]; videos: Asset[]; model: Asset|null; source?: Asset|null; colors: Color[]; color_previews?: Record<string, ColorPreview>; color_prices?: Record<string, number>; is_demo: boolean};
export type Settings = {name: string; qq_asset: string|null; qq_image: Asset|null};
export function firstVideoIndexForColor(entry: Entry, colorId = entry.colors[0]?.id): number {
  const videos = entry.videos ?? [];
  const preview = colorId && entry.color_previews?.[colorId];
  return preview ? videos.findIndex(video => preview.video_ids.includes(video.id)) : videos.length ? 0 : -1;
}
export const CONTACT_QQ = '2045757235';
export const escapeHTML = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const quote = (low: number, high: number, infill: number) => Math.floor((2 * (low * 85 + (high - low) * (infill - 15)) + 85) / 170);
export const workPriceAt = (entry: Entry, colorId: string, infill: number) =>
  entry.color_prices?.[colorId] ?? quote(entry.min_price, entry.max_price, infill);
export function workPriceRange(entry: Entry): [number, number] {
  const fixed = entry.fixed_infill;
  const low = fixed == null ? entry.min_price : quote(entry.min_price, entry.max_price, fixed);
  const high = fixed == null ? entry.max_price : low;
  if (!entry.color_prices || !entry.colors.length) return [low, high];
  const prices = entry.colors.map(color => entry.color_prices?.[color.id]);
  return [Math.min(...prices.map(price => price ?? low)), Math.max(...prices.map(price => price ?? high))];
}
export const weightAt = (low: number|null|undefined, high: number|null|undefined, infill: number) => low == null || high == null ? null : quote(Math.round(low * 100), Math.round(high * 100), infill) / 100;
export const workWeightAt = (entry: Entry, infill: number) =>
  (entry.fixed_infill == null ? null : entry.weight_g) ?? weightAt(entry.min_weight_g, entry.max_weight_g, infill);
export const grams = (value: number|null) => value == null ? '—' : `${value.toLocaleString('zh-CN', {maximumFractionDigits: 2})} g`;
export const money = (price: number|null|undefined) => price == null ? '敬请期待' : `¥${price.toLocaleString('zh-CN')}`;
export function setStatus(node: HTMLElement | null, message: string, error = false) { if(node) {node.textContent = message; node.classList.toggle('is-error', error);} }
export async function api<T>(url: string, signal?: AbortSignal, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {...options, signal, credentials:'same-origin', cache:'no-store'});
  return readApiJSON<T>(response);
}
export async function readApiJSON<T>(response: Response): Promise<T> {
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
