import { beforeEach, expect, it, vi } from 'vitest';
import { doc, onSnapshot, runTransaction } from 'firebase/firestore';
import {
  saveCustomTheme,
  removeCustomTheme,
  subscribeThemes,
} from '../services/customThemeService';
import { readThemePreference, saveThemePreference } from '../services/themePreferences';
import { emptyCatalog, newTheme, type ThemeCatalog } from '../model/customTheme';
vi.mock('@/shared/lib', () => ({ firestore: {} }));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(() => 'ref'),
  onSnapshot: vi.fn(),
  runTransaction: vi.fn(),
}));
let catalog: ThemeCatalog | null = null;
const set = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  catalog = null;
  vi.mocked(runTransaction).mockImplementation(async (_db, callback) =>
    callback({
      get: () =>
        Promise.resolve({
          exists: () => !!catalog,
          data: () =>
            catalog
              ? { ...catalog, themes: Object.fromEntries(catalog.themes.map((t) => [t.id, t])) }
              : null,
        }),
      set,
    } as never),
  );
});
it('cria, edita, protege limite e conflitos, e remove transacionalmente', async () => {
  const input = { ...newTheme(), name: 'Floresta' };
  const saved = await saveCustomTheme('author', input, null);
  expect(saved.revision).toBe(1);
  expect(doc).toHaveBeenCalledWith({}, 'users', 'author', 'preferences', 'themes');
  const stored = set.mock.calls.at(-1)![1] as {
    schemaVersion: 1;
    revision: number;
    themes: Record<string, typeof saved>;
  };
  catalog = { ...stored, themes: Object.values(stored.themes) };
  await expect(saveCustomTheme('author', input, null)).resolves.toEqual(saved);
  const edited = await saveCustomTheme('author', { ...saved, name: 'Nova' }, 1);
  expect(edited.createdAt).toBe(saved.createdAt);
  expect(edited.revision).toBe(2);
  await expect(saveCustomTheme('author', { ...input, name: 'Outra' }, null)).rejects.toThrow(
    'outra janela',
  );
  await expect(saveCustomTheme('author', saved, 9)).rejects.toThrow('outra janela');
  await expect(saveCustomTheme('author', { ...input, id: 'custom-other' }, null)).rejects.toThrow(
    'nome',
  );
  catalog = {
    ...emptyCatalog(),
    revision: 1,
    themes: Array.from({ length: 5 }, (_, i) => ({
      ...saved,
      id: 'custom-' + i,
      name: 'Tema ' + i,
    })),
  };
  await expect(saveCustomTheme('author', input, null)).rejects.toThrow('cinco');
  await expect(removeCustomTheme('author', 'custom-0', 9)).rejects.toThrow('outra janela');
  await removeCustomTheme('author', 'custom-0', 1);
  expect(
    Object.keys((set.mock.calls.at(-1)![1] as { themes: Record<string, unknown> }).themes),
  ).toHaveLength(4);
  await removeCustomTheme('author', 'missing', 1);
  await expect(saveCustomTheme('', input, null)).rejects.toThrow('Entre');
  await expect(
    saveCustomTheme(
      'author',
      { ...input, palette: { ...input.palette, foreground: input.palette.background } },
      null,
    ),
  ).rejects.toThrow('contraste');
});
it('assina apenas dados validados e não confirma exclusão pelo cache offline vazio', () => {
  const changed = vi.fn(),
    failed = vi.fn(),
    stop = vi.fn();
  vi.mocked(onSnapshot).mockReturnValue(stop);
  expect(subscribeThemes('author', changed, failed)).toBe(stop);
  const callback = vi.mocked(onSnapshot).mock.calls[0]![2] as unknown as (value: unknown) => void;
  callback({ exists: () => false, metadata: { fromCache: true } });
  expect(changed).not.toHaveBeenCalled();
  callback({ exists: () => false, metadata: { fromCache: false } });
  expect(changed).toHaveBeenCalledWith(emptyCatalog());
  callback({ exists: () => true, data: () => ({}), metadata: { fromCache: false } });
  expect(failed).toHaveBeenCalledWith(expect.any(Error));
  callback({
    exists: () => true,
    data: () => ({ ...emptyCatalog(), themes: {} }),
    metadata: { fromCache: false },
  });
  expect(changed).toHaveBeenLastCalledWith(emptyCatalog());
});
it('isola a preferência por conta e tolera cache corrompido', () => {
  const theme = { ...newTheme(), name: 'Meu tema' };
  saveThemePreference('a', theme);
  expect(readThemePreference('a')).toEqual(theme);
  expect(readThemePreference('b')).toBeNull();
  saveThemePreference('a', null);
  expect(readThemePreference('a')).toBeNull();
  localStorage.setItem('writer_custom_theme_v1:a', 'broken');
  expect(readThemePreference('a')).toBeNull();
});
