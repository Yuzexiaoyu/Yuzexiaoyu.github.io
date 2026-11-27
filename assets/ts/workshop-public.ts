import {api, readApiJSON, workPriceAt, workWeightAt, Entry, Settings} from './workshop-shared';
import {canPreload} from './preload-policy';

type Catalog = {version: number; entries: Entry[]; settings: Settings};
type Entries = {entries: Entry[]};
let snapshot: Promise<Catalog> | null = null;
let localPreload: Promise<Entries> | null = null;
const covers = new Map<string, HTMLImageElement>();
const bootstrap = window as Window & {__workshopCatalogRequest?: Promise<Response>};

function takeEarlyCatalogRequest(): Promise<Response> | undefined {
  const request = bootstrap.__workshopCatalogRequest;
  delete bootstrap.__workshopCatalogRequest;
  return request;
}

function loadLocalCatalog(signal?: AbortSignal): Promise<Entries> {
  return takeEarlyCatalogRequest()?.then(readApiJSON<Entries>) ?? api<Entries>('/api/catalog', signal);
}

function loadSnapshot(refresh = false): Promise<Catalog> {
  if (!snapshot || refresh) {
    const pending = (async () => {
      const earlyRequest = takeEarlyCatalogRequest();
      const response = await (earlyRequest ?? fetch('/workshop/catalog.json', {cache: 'no-cache'}));
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
        throw new Error('工坊内容暂未加载成功，请稍后刷新。');
      }
      const catalog: Catalog = await response.json();
      if (catalog.version !== 1 || !Array.isArray(catalog.entries) || !catalog.settings) {
        throw new Error('工坊内容版本不正确，请稍后刷新。');
      }
      return catalog;
    })();
    snapshot = pending;
    void pending.catch(() => { if (snapshot === pending) snapshot = null; });
  }
  return snapshot;
}

export function catalogEntries(entries: Entry[], hidden: string[]): Entry[] {
  return entries.filter(entry => !entry.topic_only && !hidden.includes(entry.id ?? ''));
}

export async function preloadPublicCatalog(source: string, signal?: AbortSignal, hidden: string[] = []): Promise<void> {
  let catalog: Entries;
  if (source === 'local') {
    if (!localPreload) {
      const pending = loadLocalCatalog();
      localPreload = pending;
      void pending.catch(() => { if (localPreload === pending) localPreload = null; });
    }
    catalog = await localPreload;
  } else {
    catalog = await loadSnapshot();
  }
  if (signal?.aborted || !canPreload()) return;
  // Warm the first two cards. The grid loads the rest on demand.
  for (const entry of catalogEntries(catalog.entries, hidden).slice(0, 2)) {
    const url = entry.images[0]?.url;
    if (!url || covers.has(url)) continue;
    const image = new Image();
    image.decoding = 'async';
    image.fetchPriority = 'low';
    image.onerror = () => covers.delete(url);
    image.src = url;
    covers.set(url, image);
  }
}

// Only the local build talks to the local API. Public hosting serves a snapshot.
export async function publicApi<T>(url: string, signal?: AbortSignal, refresh = false): Promise<T> {
  signal?.throwIfAborted();
  if (document.querySelector('[data-workshop]')?.getAttribute('data-workshop-source') === 'local') {
    if (url === '/api/catalog' && !refresh) {
      const pending = localPreload ?? loadLocalCatalog(signal);
      localPreload = null;
      const catalog = await pending;
      signal?.throwIfAborted();
      return catalog as T;
    }
    return api<T>(url, signal);
  }
  const request = new URL(url, location.origin);
  // Reuse the preload for navigation; confirm the latest prices when making a list.
  const catalog = await loadSnapshot(refresh || request.pathname === '/api/quote');
  signal?.throwIfAborted();
  if (request.pathname === '/api/catalog') return {entries: catalog.entries} as T;
  if (request.pathname === '/api/settings') return catalog.settings as T;
  const quoting = request.pathname === '/api/quote';
  if (!quoting && !request.pathname.startsWith('/api/entry/')) throw new Error('内容不存在');
  const id = quoting ? request.searchParams.get('id') : decodeURIComponent(request.pathname.slice('/api/entry/'.length));
  const entry = catalog.entries.find(item => item.id === id && item.status === 'published');
  if (!entry) throw new Error('内容不存在或已下架');
  if (!quoting) return entry as T;
  if (entry.kind === 'product') return {entry, price: entry.fixed_price, weight_g: entry.weight_g, material: entry.material || '', quantity: 1} as T;
  const color = entry.colors.find(item => item.id === request.searchParams.get('color') && item.active);
  const infill = entry.fixed_infill ?? Number(request.searchParams.get('infill'));
  if (!color) throw new Error('请选择可选条目的可用颜色');
  if (!Number.isInteger(infill) || infill < 15 || infill > 100) throw new Error('请输入 15～100 的整数百分比');
  return {entry, color, infill, material: color.material || '', price: workPriceAt(entry, color.id, infill), weight_g: workWeightAt(entry, infill)} as T;
}
