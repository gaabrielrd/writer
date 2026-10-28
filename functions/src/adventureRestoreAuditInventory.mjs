import { digest, nativeToken, inconsistent, sum } from './adventureRestoreContracts.mjs';
import { ADVENTURE_AUDIT_LAYOUT } from './adventureRestoreAuditLayout.mjs';
import {
  adventureStageArtifactId,
  readAdventureStageArtifact,
  ADVENTURE_STAGE_ARTIFACT_FIELDS,
} from './adventureRestoreArtifacts.mjs';
export function adventureAuditContext(loaded) {
  const p = loaded.job.staging;
  return digest({
    domain: 'writer-adventure-native-audit-v1',
    ownerId: loaded.uid,
    restoreId: loaded.id,
    jobToken: loaded.view.jobToken,
    adventureId: loaded.job.adventureId,
    source: loaded.job.source,
    validation: loaded.job.validation.reportHash,
    artifactCount: p.artifactCount,
    counts: [p.countBlocks, p.countScenes, p.countLinks, p.countWordCount],
    personas: p.personaLibraryInstalled,
    media: p.storagePrepared,
    layout: ADVENTURE_AUDIT_LAYOUT,
  });
}
export const adventureAuditAnchor = (journal, artifact) => ({
  address: artifact.address,
  journalToken: nativeToken(journal),
  targetToken: nativeToken(artifact.metadata),
});
export async function readAdventureAuditArtifact(store, tx, loaded, address) {
  const journal = await tx.get(
      store.db.doc(loaded.ref.path + '/stagingArtifacts/' + adventureStageArtifactId(address)),
    ),
    artifact = await readAdventureStageArtifact(store, tx, loaded, journal);
  return { journal, artifact };
}
export async function verifyAdventureAuditAnchor(store, tx, loaded, anchor) {
  if (anchor === null) return;
  const { journal, artifact } = await readAdventureAuditArtifact(store, tx, loaded, anchor.address);
  if (
    nativeToken(journal) !== anchor.journalToken ||
    nativeToken(artifact.metadata) !== anchor.targetToken
  )
    inconsistent();
}
export async function advanceAdventureAuditJournals(store, tx, loaded, p) {
  let query = store.db
    .collection(loaded.ref.path + '/stagingArtifacts')
    .select(...ADVENTURE_STAGE_ARTIFACT_FIELDS)
    .orderBy('__name__')
    .limit(8);
  if (p.auditAfter !== null) query = query.startAfter(p.auditAfter);
  const rows = await tx.get(query);
  for (const journal of rows.docs) {
    const artifact = await readAdventureStageArtifact(store, tx, loaded, journal);
    p.auditJournals = sum(p.auditJournals, 1);
    if (p.auditJournals > p.artifactCount) inconsistent();
    p.auditAfter = journal.id;
    p.auditAnchor = adventureAuditAnchor(journal, artifact);
  }
  if (!rows.docs.length) {
    if (p.auditJournals !== p.artifactCount) inconsistent();
    p.phase = 'audit-physical';
    p.auditAfter = null;
  }
}
export async function advanceAdventureAuditPhysical(store, tx, loaded, p) {
  const family = ADVENTURE_AUDIT_LAYOUT[p.auditFamily];
  if (!family) inconsistent();
  const base =
    family.scope === 'job'
      ? loaded.ref.path
      : family.scope === 'persona'
        ? 'users/' + loaded.uid
        : 'adventures/' + loaded.job.adventureId;
  let query;
  if (family.parentCollection) {
    if (p.auditParent === null) {
      let parents = store.db
        .collection(base + '/' + family.parentCollection)
        .select()
        .orderBy('__name__')
        .limit(1);
      if (p.auditParentAfter !== null) parents = parents.startAfter(p.auditParentAfter);
      const page = await tx.get(parents);
      if (!page.docs.length) {
        p.auditFamily++;
        p.auditParentAfter = null;
        p.auditAfter = null;
        return;
      }
      p.auditParent = page.docs[0].id;
      p.auditAfter = null;
    }
    await readAdventureAuditArtifact(store, tx, loaded, {
      scope: family.scope,
      path: [family.parentCollection, p.auditParent],
    });
    query = store.db.collection(
      base + '/' + family.parentCollection + '/' + p.auditParent + '/' + family.collection,
    );
  } else {
    if (p.auditParent !== null || p.auditParentAfter !== null) inconsistent();
    query = store.db.collection(base + '/' + family.collection);
    if (family.scope === 'persona')
      query = query.where('restoreOrigin.target.id', '==', loaded.job.adventureId);
  }
  query = query.select().orderBy('__name__').limit(8);
  if (p.auditAfter !== null) query = query.startAfter(p.auditAfter);
  const rows = await tx.get(query);
  for (const physical of rows.docs) {
    const address = {
        scope: family.scope,
        path: family.parentCollection
          ? [family.parentCollection, p.auditParent, family.collection, physical.id]
          : [family.collection, physical.id],
      },
      { journal, artifact } = await readAdventureAuditArtifact(store, tx, loaded, address);
    if (
      artifact.targetRef.path !== physical.ref.path ||
      nativeToken(artifact.metadata) !== nativeToken(physical)
    )
      inconsistent();
    p.auditPhysical = sum(p.auditPhysical, 1);
    if (p.auditPhysical > p.auditJournals) inconsistent();
    p.auditAfter = physical.id;
    p.auditAnchor = adventureAuditAnchor(journal, artifact);
  }
  if (!rows.docs.length) {
    if (family.parentCollection) {
      p.auditParentAfter = p.auditParent;
      p.auditParent = null;
    } else p.auditFamily++;
    p.auditAfter = null;
  }
}
