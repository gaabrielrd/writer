export type DockMode = 'compact' | 'expanded' | 'minimized';
export interface DockPreferences {
  mode: DockMode;
  x: number;
  y: number;
}
export const defaultDock: DockPreferences = { mode: 'compact', x: 0.5, y: 1 };
const key = (uid: string) => `writer-assistant-dock:v1:${uid}`;
export function readDockPreferences(uid: string): DockPreferences {
  try {
    const value = JSON.parse(localStorage.getItem(key(uid)) ?? 'null') as DockPreferences | null;
    if (
      value &&
      ['compact', 'expanded', 'minimized'].includes(value.mode) &&
      Number.isFinite(value.x) &&
      Number.isFinite(value.y) &&
      value.x >= 0 &&
      value.x <= 1 &&
      value.y >= 0 &&
      value.y <= 1
    )
      return { mode: value.mode, x: value.x, y: value.y };
  } catch {
    /* Preferences are optional; content never depends on storage. */
  }
  return { ...defaultDock };
}
export function saveDockPreferences(uid: string, value: DockPreferences): boolean {
  try {
    localStorage.setItem(key(uid), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
