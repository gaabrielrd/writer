import { beforeEach, expect, it, vi } from 'vitest';
import { defaultDock, readDockPreferences, saveDockPreferences } from '../services/dockPreferences';
beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
it('starts at the lower center and keeps presentation isolated by account', () => {
  expect(readDockPreferences('writer')).toEqual(defaultDock);
  expect(saveDockPreferences('writer', { mode: 'minimized', x: 0.2, y: 0.8 })).toBe(true);
  expect(readDockPreferences('writer')).toEqual({ mode: 'minimized', x: 0.2, y: 0.8 });
  expect(readDockPreferences('other')).toEqual(defaultDock);
});
it('falls back from invalid coordinates or unavailable storage without affecting content', () => {
  localStorage.setItem(
    'writer-assistant-dock:v1:writer',
    JSON.stringify({ mode: 'expanded', x: -1, y: 3 }),
  );
  expect(readDockPreferences('writer')).toEqual(defaultDock);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('blocked');
  });
  expect(saveDockPreferences('writer', defaultDock)).toBe(false);
});
