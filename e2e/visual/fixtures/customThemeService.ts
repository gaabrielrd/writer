import {
  emptyCatalog,
  validateCatalog,
  validateTheme,
  type CustomTheme,
  type ThemeCatalog,
} from '../../../src/features/custom-themes/model/customTheme';
import { author } from './data';
const listeners = new Set<(catalog: ThemeCatalog) => void>();
const key = 'writer_fixture_custom_themes';
function read(): ThemeCatalog {
  return validateCatalog(JSON.parse(sessionStorage.getItem(key) ?? JSON.stringify(emptyCatalog())));
}
function owner(uid: string) {
  if (uid !== author.uid) throw new Error('Conta fictícia necessária.');
}
function write(catalog: ThemeCatalog) {
  sessionStorage.setItem(key, JSON.stringify(catalog));
  listeners.forEach((fn) => fn(structuredClone(catalog)));
}
export function subscribeThemes(
  uid: string,
  changed: (catalog: ThemeCatalog) => void,
  failed: (error: Error) => void,
) {
  owner(uid);
  if (sessionStorage.getItem(key + '_error')) {
    failed(new Error('Falha simulada ao carregar temas.'));
    return () => undefined;
  }
  listeners.add(changed);
  changed(read());
  return () => {
    listeners.delete(changed);
  };
}
export async function saveCustomTheme(
  uid: string,
  input: CustomTheme,
  revision: number | null,
): Promise<CustomTheme> {
  await Promise.resolve();
  owner(uid);
  if (sessionStorage.getItem(key + '_save_error')) throw new Error('Falha simulada ao salvar.');
  const catalog = read(),
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
  write({
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
  const catalog = read(),
    previous = catalog.themes.find((t) => t.id === id);
  if (previous && previous.revision !== revision) throw new Error('Tema alterado em outra janela.');
  write({
    ...catalog,
    revision: catalog.revision + 1,
    themes: catalog.themes.filter((t) => t.id !== id),
  });
}
