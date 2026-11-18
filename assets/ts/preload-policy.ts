type NetworkConnection = EventTarget & {saveData?: boolean; effectiveType?: string};
export const connection = (navigator as Navigator & {connection?: NetworkConnection}).connection;

export function canPreload(): boolean {
  return !document.hidden && navigator.onLine !== false && !connection?.saveData &&
    !['slow-2g', '2g', '3g'].includes(connection?.effectiveType || '');
}
