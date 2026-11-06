import {
  workScope,
  workProject,
  workId,
  workFail,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { normalizeLiteraryImpactNode, literaryImpactNodeKey } from './literaryImpactProtocol.mjs';
import { LITERARY_IMPACT_BOOK_INVENTORIES } from './literaryImpactInventory.mjs';
import { literaryNativeBirth } from './literarySourceOrigins.mjs';
import { LITERARY_IMPACT_NATIVE_AUDIT } from './literaryImpactNativeAudit.mjs';
export const IMPACT_LEGACY_COVERAGE = 'unindexed-origin-coverage';
export const IMPACT_REGISTRY_TOKEN = digest({
  version: 2,
  bookInventories: LITERARY_IMPACT_BOOK_INVENTORIES,
  legacy: IMPACT_LEGACY_COVERAGE,
  nativeAudit: LITERARY_IMPACT_NATIVE_AUDIT,
});
export const IMPACT_MAX_BOOKS = Math.min(
  64,
  Math.floor(512 / (LITERARY_IMPACT_BOOK_INVENTORIES.length + 1)),
);
export const literaryImpactBookToken = (c, birth) =>
  digest({ domain: 'literary-impact-book-v1', uid: c.uid, target: c.target, birth });
export function literaryImpactIntent(c, data) {
  if (
    !Array.isArray(data.bookIds) ||
    !data.bookIds.length ||
    data.bookIds.length > IMPACT_MAX_BOOKS ||
    !Array.isArray(data.sources) ||
    !data.sources.length ||
    data.sources.length > 16 ||
    typeof data.prepareIndices !== 'boolean'
  )
    workFail(
      'invalid-argument',
      'Selecione o escopo explícito do mapa dentro do orçamento de inventário.',
    );
  const bookIds = [...new Set(data.bookIds.map(workId))].sort();
  if (bookIds.length !== data.bookIds.length || !bookIds.includes(c.target.id))
    workFail('invalid-argument', 'Escopo de livros inválido.');
  const sources = data.sources
    .map(normalizeLiteraryImpactNode)
    .sort((a, b) => literaryImpactNodeKey(a).localeCompare(literaryImpactNodeKey(b)));
  if (new Set(sources.map(literaryImpactNodeKey)).size !== sources.length)
    workFail('invalid-argument', 'Não repita fontes.');
  if (
    sources.some(
      (source) =>
        (source.kind === 'book' && source.id !== source.scopeId) ||
        (source.kind === 'contract' && source.id !== 'current'),
    )
  )
    workFail('invalid-argument', 'Origem lógica inválida.');
  return { bookIds, sources, prepareIndices: data.prepareIndices };
}
export async function readLiteraryImpactScope(tx, c, intent) {
  await workProject(tx, c);
  const books = [],
    worlds = new Map();
  for (const id of intent.bookIds) {
    const scoped = workScope(c.db, c.uid, { target: { kind: 'book', id } }, []);
    const root = await workProject(tx, scoped),
      row = await readWorkMetadata(tx, scoped.ref, []);
    books.push({ id, birth: literaryNativeBirth(row), universeId: root.universeId ?? null });
    if (root.universeId && !worlds.has(root.universeId)) {
      const world = await readWorkMetadata(tx, c.db.doc('universes/' + workId(root.universeId)), [
        'authorId',
        'deleting',
      ]);
      if (!world.exists || world.data().authorId !== c.uid || world.data().deleting)
        workFail('permission-denied', 'Um universo do escopo está indisponível.');
      worlds.set(root.universeId, { id: root.universeId, birth: literaryNativeBirth(world) });
    }
  }
  for (const source of intent.sources)
    if (
      (source.scopeKind === 'book' && !intent.bookIds.includes(source.scopeId)) ||
      (source.scopeKind === 'universe' && !worlds.has(source.scopeId)) ||
      (source.scopeKind === 'user' && source.scopeId !== c.uid)
    )
      workFail('permission-denied', 'Uma fonte está fora do escopo selecionado.');
  const inventories = intent.bookIds.flatMap((scopeId) =>
    [...LITERARY_IMPACT_BOOK_INVENTORIES, IMPACT_LEGACY_COVERAGE].map((collection) => ({
      scopeKind: 'book',
      scopeId,
      collection,
    })),
  );
  const birth = books.find((book) => book.id === c.target.id).birth;
  return {
    bookBirth: birth,
    bookToken: literaryImpactBookToken(c, birth),
    registryToken: IMPACT_REGISTRY_TOKEN,
    scopeToken: digest({
      domain: 'literary-impact-scope-v1',
      uid: c.uid,
      target: c.target,
      books,
      worlds: [...worlds.values()].sort((a, b) => a.id.localeCompare(b.id)),
      registryToken: IMPACT_REGISTRY_TOKEN,
      sources: intent.sources,
    }),
    inventories,
    bookIds: intent.bookIds,
    universeIds: [...worlds.keys()].sort(),
  };
}
