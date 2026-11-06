import {
  workProject,
  workId,
  workFail,
  workRevision,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { readPersonaCatalogFence } from './personaCatalogClock.mjs';
import { readLiteraryImpactChatCatalog } from './literaryImpactCatalog.mjs';
const counters = [
  'sceneRevision',
  'narrativeRevision',
  'literaryRevision',
  'literaryContextRevision',
  'literaryDependencyRevision',
  'localLoreVersion',
  'loreVersion',
  'historyRevision',
];
const fields = [
  'authorId',
  'deleting',
  'updatedAt',
  'universeId',
  'personaId',
  'personaRevision',
  ...counters,
];
function birth(row) {
  const value = row.createTime;
  if (
    !row.exists ||
    !Number.isSafeInteger(value?.seconds) ||
    !Number.isSafeInteger(value?.nanoseconds)
  )
    workFail('failed-precondition', 'A identidade da origem do impacto não pôde ser conferida.');
  return [value.seconds, value.nanoseconds];
}
function changed(row) {
  const value = row.updateTime;
  if (!Number.isSafeInteger(value?.seconds) || !Number.isSafeInteger(value?.nanoseconds))
    workFail('failed-precondition', 'A versão do universo não pôde ser conferida.');
  return [value.seconds, value.nanoseconds];
}
// This fence covers the registered book/native-literary producers. Inventory
// orchestration must still report unsupported producers (including legacy chats
// and unindexed historical origins) rather than certify an incomplete census.
// An absent native-chat clock with existing data is explicitly untracked; the
// native audit records that gap instead of repairing or granting a new catalog.
export async function readLiteraryImpactFence(tx, c, { bookIds }) {
  await workProject(tx, c);
  if (
    c.target.kind !== 'book' ||
    !Array.isArray(bookIds) ||
    !bookIds.length ||
    bookIds.length > 64 ||
    !bookIds.includes(c.target.id) ||
    new Set(bookIds).size !== bookIds.length
  )
    workFail('invalid-argument', 'Escopo de livros do mapa inválido.');
  const books = [],
    worlds = [],
    universeIds = new Set();
  for (const id of [...bookIds].map(workId).sort()) {
    const row = await readWorkMetadata(tx, c.db.doc('books/' + id), fields),
      root = row.data();
    if (!root || root.authorId !== c.uid || root.deleting)
      workFail('permission-denied', 'Um livro do mapa está indisponível.');
    if (!Number.isFinite(root.updatedAt) || root.updatedAt < 0)
      workFail('failed-precondition', 'A data da origem do mapa é inválida.');
    const clocks = Object.fromEntries(counters.map((key) => [key, workRevision(root[key] ?? 0)]));
    const universeId = root.universeId == null ? null : workId(root.universeId);
    if (universeId) universeIds.add(universeId);
    books.push({
      id,
      birth: birth(row),
      changed: changed(row),
      updatedAt: root.updatedAt,
      universeId,
      clocks,
      personaBinding: {
        personaId: root.personaId ?? null,
        personaRevision: workRevision(root.personaRevision ?? 0),
      },
    });
  }
  for (const id of [...universeIds].sort()) {
    const row = await readWorkMetadata(tx, c.db.doc('universes/' + id), ['authorId', 'deleting']);
    if (!row.exists || row.data().authorId !== c.uid || row.data().deleting)
      workFail('permission-denied', 'Um universo do mapa está indisponível.');
    worlds.push({ id, birth: birth(row), changed: changed(row) });
  }
  const personas = await readPersonaCatalogFence(tx, c.db, c.uid);
  const nativeChats = await readLiteraryImpactChatCatalog(tx, c.db, c.uid);
  return {
    token: digest({
      domain: 'literary-impact-source-fence-v1',
      uid: c.uid,
      books,
      worlds,
      personas,
      nativeChats,
    }),
    bookIds: books.map((book) => book.id),
    universeIds: worlds.map((world) => world.id),
  };
}
