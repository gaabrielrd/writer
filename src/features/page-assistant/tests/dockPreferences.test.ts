import { beforeEach, expect, it, vi } from 'vitest';
import { defaultDock, readDockPosition, saveDockPosition } from '../services/dockPreferences';
beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
it('starts at the lower center and keeps the position isolated by account', () => {
  expect(readDockPosition('writer')).toEqual(defaultDock);
  expect(saveDockPosition('writer', { x: 0.2, y: 0.8 })).toBe(true);
  expect(readDockPosition('writer')).toEqual({ x: 0.2, y: 0.8 });
  expect(JSON.parse(localStorage.getItem('writer-assistant-dock:v1:writer')!)).toEqual({
    x: 0.2,
    y: 0.8,
  });
  expect(readDockPosition('other')).toEqual(defaultDock);
});
it('keeps the position saved by older versions and ignores their open state', () => {
  localStorage.setItem(
    'writer-assistant-dock:v1:writer',
    JSON.stringify({ mode: 'expanded', x: 0.3, y: 0.4 }),
  );
  expect(readDockPosition('writer')).toEqual({ x: 0.3, y: 0.4 });
});
it('falls back from invalid coordinates or unavailable storage without affecting content', () => {
  localStorage.setItem(
    'writer-assistant-dock:v1:writer',
    JSON.stringify({ mode: 'expanded', x: -1, y: 3 }),
  );
  expect(readDockPosition('writer')).toEqual(defaultDock);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  expect(saveDockPosition('writer', defaultDock)).toBe(false);
});
