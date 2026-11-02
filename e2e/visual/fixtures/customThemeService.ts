import {
  emptyCatalog,
  validateCatalog,
  validateTheme,
  type CustomTheme,
  type ThemeCatalog,
} from '../../../src/features/custom-themes/model/customTheme';
import { author } from './data';
const listeners = new Map<string, Set<(catalog: ThemeCatalog) => void>>();
const key = 'writer_fixture_custom_themes';
function read(uid: string): ThemeCatalog {
  return validateCatalog(
    JSON.parse(sessionStorage.getItem(owner(uid)) ?? JSON.stringify(emptyCatalog())),
  );
}
function owner(uid: string) {
  if (uid === author.uid) return key;
  if (uid === 'visual-second-author') return key + ':second';
  throw new Error('Conta fictícia necessária.');
}
function write(uid: string, catalog: ThemeCatalog) {
  sessionStorage.setItem(owner(uid), JSON.stringify(catalog));
  listeners.get(uid)?.forEach((fn) => fn(structuredClone(catalog)));
}
export function subscribeThemes(
  uid: string,
  changed: (catalog: ThemeCatalog) => void,
  failed: (error: Error) => void,
) {
  const storageKey = owner(uid);
  if (sessionStorage.getItem(storageKey + '_error')) {
    failed(new Error('Falha simulada ao carregar temas.'));
    return () => undefined;
  }
  const accountListeners = listeners.get(uid) ?? new Set();
  listeners.set(uid, accountListeners);
  accountListeners.add(changed);
  changed(read(uid));
  return () => {
    accountListeners.delete(changed);
    if (!accountListeners.size) listeners.delete(uid);
  };
}
export async function saveCustomTheme(
  uid: string,
  input: CustomTheme,
  revision: number | null,
): Promise<CustomTheme> {
  await Promise.resolve();
  owner(uid);
  if (sessionStorage.getItem(owner(uid) + '_save_error'))
    throw new Error('Falha simulada ao salvar.');
  const catalog = read(uid),
    previous = catalog.themes.find((t) => t.id === input.id);
  if ((previous?.revision ?? null) !== revision)
    throw new Error('Este tema mudou em outra janela.');
  if (!previous && catalog.themes.length >= 5) throw new Error('Você já possui cinco temas.');
  if (
    catalog.themes.some(
      (t) => t.id !== input.id && t.name.toLowerCase() === input.name.trim().toLowerCase(),
    )
  )
    throw new Error('Já existe um tema com esse nome.');
  const theme = validateTheme({
    ...input,
    revision: (previous?.revision ?? 0) + 1,
    createdAt: previous?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  });
  write(uid, {
    ...catalog,
    revision: catalog.revision + 1,
    themes: previous
      ? catalog.themes.map((t) => (t.id === theme.id ? theme : t))
      : [...catalog.themes, theme],
  });
  return theme;
}
export async function removeCustomTheme(uid: string, id: string, revision: number) {
  await Promise.resolve();
  owner(uid);
  const catalog = read(uid),
    previous = catalog.themes.find((t) => t.id === id);
  if (previous && previous.revision !== revision) throw new Error('Tema alterado em outra janela.');
  write(uid, {
    ...catalog,
    revision: catalog.revision + 1,
    themes: catalog.themes.filter((t) => t.id !== id),
  });
}
