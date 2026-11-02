import { doc, onSnapshot, runTransaction } from 'firebase/firestore';
import { firestore } from '@/shared/lib';
import {
  emptyCatalog,
  validateCatalog,
  validateTheme,
  paletteIssues,
  MAX_THEMES,
  sameThemeContent,
  type CustomTheme,
  type ThemeCatalog,
} from '../model/customTheme';
function reference(uid: string) {
  if (!uid || uid.includes('/')) throw new Error('Entre na sua conta para gerenciar temas.');
  return doc(firestore, 'users', uid, 'preferences', 'themes');
}
function decodeCatalog(value: unknown): ThemeCatalog {
  const data = value as Record<string, unknown>;
  if (!data || !data.themes || Array.isArray(data.themes) || typeof data.themes !== 'object')
    throw new Error('Catálogo inválido.');
  if (
    Object.entries(data.themes).some(
      ([id, value]) => !value || typeof value !== 'object' || (value as CustomTheme).id !== id,
    )
  )
    throw new Error('Catálogo inválido.');
  return validateCatalog({
    schemaVersion: data.schemaVersion,
    revision: data.revision,
    themes: Object.values(data.themes),
  });
}
function encodeCatalog(catalog: ThemeCatalog, changedId: string) {
  return {
    ...catalog,
    changedId,
    themes: Object.fromEntries(catalog.themes.map((theme) => [theme.id, theme])),
  };
}
export function subscribeThemes(
  uid: string,
  onChange: (catalog: ThemeCatalog) => void,
  onError: (error: Error) => void,
) {
  return onSnapshot(
    reference(uid),
    { includeMetadataChanges: true },
    (snapshot) => {
      try {
        // Do not mistake an empty offline cache for a confirmed remote deletion.
        if (!snapshot.exists() && snapshot.metadata.fromCache) return;
        onChange(snapshot.exists() ? decodeCatalog(snapshot.data()) : emptyCatalog());
      } catch (error) {
        onError(error instanceof Error ? error : new Error('Catálogo inválido.'));
      }
    },
    onError,
  );
}
export async function saveCustomTheme(
  uid: string,
  input: CustomTheme,
  expectedRevision: number | null,
): Promise<CustomTheme> {
  const theme = validateTheme(input);
  if (paletteIssues(theme.palette).length) throw new Error('Corrija o contraste antes de salvar.');
  return runTransaction(firestore, async (tx) => {
    const ref = reference(uid),
      snapshot = await tx.get(ref);
    const catalog = snapshot.exists() ? decodeCatalog(snapshot.data()) : emptyCatalog();
    const previous = catalog.themes.find((t) => t.id === theme.id);
    if ((previous?.revision ?? null) !== expectedRevision) {
      // Same stable ID makes a retry after an uncertain successful create safe.
      if (
        previous &&
        previous.revision === (expectedRevision ?? 0) + 1 &&
        sameThemeContent(previous, theme)
      )
        return previous;
      throw new Error('Este tema mudou em outra janela. Reabra a edição antes de salvar.');
    }
    if (!previous && catalog.themes.length >= MAX_THEMES)
      throw new Error('Você já possui cinco temas. Remova um para criar outro.');
    if (
      catalog.themes.some(
        (t) => t.id !== theme.id && t.name.toLocaleLowerCase() === theme.name.toLocaleLowerCase(),
      )
    )
      throw new Error('Já existe um tema com esse nome.');
    const now = Date.now();
    const saved = {
      ...theme,
      revision: (previous?.revision ?? 0) + 1,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    const themes = previous
      ? catalog.themes.map((t) => (t.id === saved.id ? saved : t))
      : [...catalog.themes, saved];
    tx.set(
      ref,
      encodeCatalog({ schemaVersion: 1, revision: catalog.revision + 1, themes }, theme.id),
    );
    return saved;
  });
}
export async function removeCustomTheme(
  uid: string,
  id: string,
  expectedRevision: number,
): Promise<void> {
  await runTransaction(firestore, async (tx) => {
    const ref = reference(uid),
      snapshot = await tx.get(ref);
    const catalog = snapshot.exists() ? decodeCatalog(snapshot.data()) : emptyCatalog();
    const theme = catalog.themes.find((t) => t.id === id);
    if (!theme) return;
    if (theme.revision !== expectedRevision)
      throw new Error('Este tema mudou em outra janela. Atualize antes de remover.');
    tx.set(
      ref,
      encodeCatalog(
        {
          schemaVersion: 1,
          revision: catalog.revision + 1,
          themes: catalog.themes.filter((t) => t.id !== id),
        },
        id,
      ),
    );
  });
}
