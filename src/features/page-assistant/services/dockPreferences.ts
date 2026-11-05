export type DockMode = 'compact' | 'expanded' | 'minimized';
/**
 * Only the position is remembered per account. The dock always arrives
 * minimized on each page, so the open/closed state is never stored.
 */
export interface DockPosition {
  x: number;
  y: number;
}
export const defaultDock: DockPosition = { x: 0.5, y: 1 };
const key = (uid: string) => `writer-assistant-dock:v1:${uid}`;
const valid = (n: unknown): n is number => typeof n === 'number' && n >= 0 && n <= 1;
export function readDockPosition(uid: string): DockPosition {
  try {
    // Older entries also carried a `mode`; it is ignored on purpose.
    const value = JSON.parse(
      localStorage.getItem(key(uid)) ?? 'null',
    ) as Partial<DockPosition> | null;
    if (value && valid(value.x) && valid(value.y)) return { x: value.x, y: value.y };
  } catch {
    /* Preferences are optional; content never depends on storage. */
  }
  return { ...defaultDock };
}
export function saveDockPosition(uid: string, value: DockPosition): boolean {
  try {
    localStorage.setItem(key(uid), JSON.stringify({ x: value.x, y: value.y }));
    return true;
  } catch {
    return false;
  }
}
