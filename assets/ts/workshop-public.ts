import {api, quote, Entry, Settings} from './workshop-shared';

type Catalog = {version: number; entries: Entry[]; settings: Settings};

// Only the local build talks to the local API. Public hosting serves a snapshot.
export async function publicApi<T>(url: string, signal?: AbortSignal): Promise<T> {
  if (document.querySelector('[data-workshop]')?.getAttribute('data-workshop-source') === 'local') {
    return api<T>(url, signal);
  }
  const response = await fetch('/workshop/catalog.json', {signal, cache: 'no-cache'});
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('工坊内容暂未加载成功，请稍后刷新。');
  }
  const catalog: Catalog = await response.json();
  if (catalog.version !== 1 || !Array.isArray(catalog.entries) || !catalog.settings) {
    throw new Error('工坊内容版本不正确，请稍后刷新。');
  }
  const request = new URL(url, location.origin);
  if (request.pathname === '/api/catalog') return {entries: catalog.entries} as T;
  if (request.pathname === '/api/settings') return catalog.settings as T;
  const quoting = request.pathname === '/api/quote';
  if (!quoting && !request.pathname.startsWith('/api/entry/')) throw new Error('内容不存在');
  const id = quoting ? request.searchParams.get('id') : decodeURIComponent(request.pathname.slice('/api/entry/'.length));
  const entry = catalog.entries.find(item => item.id === id && item.status === 'published');
  if (!entry) throw new Error('内容不存在或已下架');
  if (!quoting) return entry as T;
  const color = entry.colors.find(item => item.id === request.searchParams.get('color') && item.active);
  const infill = Number(request.searchParams.get('infill'));
  if (entry.kind !== 'product' || !color) throw new Error('请选择商品的可用颜色');
  if (!Number.isInteger(infill) || infill < 15 || infill > 100) throw new Error('请输入 15～100 的整数百分比');
  return {entry, color, infill, price: quote(entry.min_price, entry.max_price, infill)} as T;
}
