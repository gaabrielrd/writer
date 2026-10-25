import { BOOK_RESTORE_NATIVE_V4, readBookRestoreArtifact } from './bookRestoreArtifacts.mjs';
import {
  BOOK_RESTORE_RESOURCE_FLAT,
  BOOK_RESTORE_RESOURCE_CHILDREN,
} from './bookRestoreResourcePaths.mjs';
import { nativeRestoreToken } from './bookRestoreIntegrityRead.mjs';
import { inconsistent, sum } from './bookRestoreUploadContracts.mjs';
export const BOOK_RESTORE_AUDIT_LAYOUT = Object.freeze([
  ...Object.entries(BOOK_RESTORE_NATIVE_V4).map(([kind, collection]) => ({
    kind,
    collection,
    root: 'book',
  })),
  ...Object.entries(BOOK_RESTORE_RESOURCE_FLAT).map(([kind, collection]) => ({
    kind,
    collection,
    root: 'book',
  })),
  ...Object.entries(BOOK_RESTORE_RESOURCE_CHILDREN).map(([kind, v]) => ({
    kind,
    collection: v.collection,
    parentCollection: v.parent,
    parentKind: v.parent === 'scenes' ? 'scene' : 'arc',
    root: 'book',
  })),
  { kind: 'lore', collection: 'lore', root: 'book' },
  { kind: 'text-body', collection: 'bookTextBodies', root: 'book' },
  {
    kind: 'text-chunk',
    collection: 'chunks',
    root: 'book',
    parentCollection: 'bookTextBodies',
    parentKind: 'text-body',
  },
  { kind: 'payload-body', collection: 'bookResourceBodies', root: 'book' },
  { kind: 'payload-chunk', collection: 'bookResourceChunks', root: 'book' },
  { kind: 'lore-segment', collection: 'bookLoreSegments', root: 'book' },
  { kind: 'history-version', collection: 'workVersions', root: 'book' },
  { kind: 'history-body', collection: 'workVersionBodies', root: 'book' },
  { kind: 'persona-definition', collection: 'preparedPersonas', root: 'job' },
  { kind: 'persona-binding', collection: 'personaBindings', root: 'job' },
  { kind: 'draft-definition', collection: 'preparedDrafts', root: 'job' },
  { kind: 'cover-definition', collection: 'preparedCovers', root: 'job' },
  { kind: 'cover-chunk', collection: 'preparedCoverChunks', root: 'job' },
  { kind: 'cover-storage', collection: 'preparedCoverStorage', root: 'job' },
  { kind: 'persona-library-profile', collection: 'aiPersonas', root: 'personas' },
]);
export function auditAnchor(artifact, kind, id) {
  return {
    kind,
    id,
    nativeToken: nativeRestoreToken(artifact.snapshot),
    journalToken: nativeRestoreToken(artifact.journal),
  };
}
export async function verifyAuditAnchor(tx, db, loaded, anchor) {
  if (anchor === null) return;
  const artifact = await readBookRestoreArtifact(tx, db, loaded, anchor.kind, anchor.id, {
    metadataOnly: true,
  });
  if (
    nativeRestoreToken(artifact.snapshot) !== anchor.nativeToken ||
    nativeRestoreToken(artifact.journal) !== anchor.journalToken
  )
    inconsistent();
}
function queryBase(db, loaded, family) {
  const path =
    family.root === 'book'
      ? 'books/' + loaded.job.bookId
      : family.root === 'job'
        ? loaded.ref.path
        : 'users/' + loaded.job.ownerId;
  return { path, collection: db.collection(path + '/' + family.collection) };
}
/** One bounded physical page, with a separate native parent cursor for nested namespaces. */
export async function advanceBookRestorePhysicalAudit(tx, db, loaded, p) {
  if (p.family >= BOOK_RESTORE_AUDIT_LAYOUT.length) inconsistent();
  const family = BOOK_RESTORE_AUDIT_LAYOUT[p.family],
    base = queryBase(db, loaded, family);
  let query;
  if (family.parentCollection) {
    if (p.parent === null) {
      let parents = db
        .collection(base.path + '/' + family.parentCollection)
        .orderBy('__name__')
        .select()
        .limit(1);
      if (p.parentAfter !== null) parents = parents.startAfter(p.parentAfter);
      const page = await tx.get(parents);
      if (!page.docs.length) {
        p.family++;
        p.parentAfter = null;
        p.after = null;
        return;
      }
      p.parent = page.docs[0].id;
      p.after = null;
    }
    await readBookRestoreArtifact(tx, db, loaded, family.parentKind, p.parent, {
      metadataOnly: true,
    });
    query = db.collection(
      base.path + '/' + family.parentCollection + '/' + p.parent + '/' + family.collection,
    );
  } else {
    if (p.parent !== null || p.parentAfter !== null) inconsistent();
    query = base.collection;
    if (family.root === 'personas')
      query = query.where('restoreOrigin.bookId', '==', loaded.job.bookId);
  }
  query = query.orderBy('__name__').select('stageKind').limit(8);
  if (p.after !== null) query = query.startAfter(p.after);
  const rows = await tx.get(query);
  for (const snapshot of rows.docs) {
    if (Object.hasOwn(snapshot.data(), 'stageKind')) inconsistent();
    const kind =
        family.kind === 'narrative-control' && snapshot.id === 'entity-scenes'
          ? 'entity-index-control'
          : family.kind,
      id = family.parentCollection ? p.parent + ':' + snapshot.id : snapshot.id,
      artifact = await readBookRestoreArtifact(tx, db, loaded, kind, id, { metadataOnly: true });
    if (artifact.ref.path !== snapshot.ref.path) inconsistent();
    p.checkedPhysical = sum(p.checkedPhysical, 1);
    if (p.checkedPhysical > p.checkedArtifacts) inconsistent();
    p.after = snapshot.id;
    p.anchor = auditAnchor(artifact, kind, id);
  }
  if (!rows.docs.length) {
    if (family.parentCollection) {
      p.parentAfter = p.parent;
      p.parent = null;
      p.after = null;
    } else {
      p.family++;
      p.after = null;
    }
  }
}
