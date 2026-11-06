import { readLiteraryFindingTarget } from './literaryFindingTargets.mjs';
import { workProject, workFail, digest, readWorkMetadata } from './workProgressContracts.mjs';
import { createLiteraryReferenceReader } from './literaryReferences.mjs';
import { literaryFindingEditorialIdentity } from './literarySourceOrigins.mjs';
import { editorialStored } from './literaryContracts.mjs';
const referenceKinds = ['act', 'chapter', 'scene', 'arc', 'event', 'localLore', 'globalLore'];
// A saved correction target does not prove that a correction was made. This
// checks only its captured native identity/version, never successor acceptance.
export async function verifyLiteraryImpactFindingSource(tx, c, link) {
  const { from, capture } = link;
  if (
    !capture ||
    !['finding-target', 'architecture-source'].includes(capture.scheme) ||
    capture.originToken !== null
  )
    return null;
  if (c.target.kind !== 'book' || (from.scopeKind === 'book' && from.scopeId !== c.target.id))
    workFail('permission-denied', 'O destino editorial pertence a outro livro.');
  const root = await workProject(tx, c);
  if (from.kind === 'architecture') {
    const actual = await readLiteraryFindingTarget(tx, c, {
      kind: 'architecture',
      id: from.id,
      scopeId: from.scopeId,
    });
    return {
      sourceAvailable: true,
      identityMatches:
        capture.identityToken === null ? null : capture.identityToken === actual.identityToken,
      versionMatches:
        capture.versionToken === null ? null : capture.versionToken === actual.versionToken,
      manuscriptRead: false,
      editorialReview: false,
    };
  }
  if (capture.scheme === 'architecture-source') return null;
  if (referenceKinds.includes(from.kind)) {
    const read = await createLiteraryReferenceReader(tx, c, root),
      actual = await read(
        {
          kind: from.kind,
          id: from.id,
          scopeId: from.scopeId,
          purpose: 'source',
        },
        false,
      );
    if (!actual) return { sourceAvailable: false };
    const matches =
      capture.identityToken === null ? null : capture.identityToken === actual.identityToken;
    return {
      sourceAvailable: true,
      identityMatches: matches,
      versionMatches:
        capture.versionToken === null
          ? null
          : capture.versionToken === actual.versionToken &&
            (capture.revision === null || capture.revision === actual.reference.revision),
    };
  }
  if (
    !['plan', 'contract'].includes(from.kind) ||
    (from.kind === 'contract' && from.id !== 'current')
  )
    return null;
  const path =
    from.kind === 'contract'
      ? c.path + '/literaryProduction/current'
      : c.path + '/literaryPlans/' + from.id;
  const row = await readWorkMetadata(tx, c.db.doc(path), ['revision']);
  if (!row.exists) return { sourceAvailable: false };
  const book = await readWorkMetadata(tx, c.ref, []);
  const identity = literaryFindingEditorialIdentity(c, { book, kind: from.kind, id: from.id, row });
  const identityMatches =
    capture.identityToken === null ? null : capture.identityToken === identity;
  if (identityMatches !== true || capture.versionToken === null)
    return { sourceAvailable: true, identityMatches, versionMatches: null };
  const saved = (await tx.get(row.ref)).data();
  if (!Number.isSafeInteger(saved.revision) || saved.revision < 1)
    workFail('failed-precondition', 'Revisão editorial inconsistente.');
  const content = from.kind === 'contract' ? editorialStored(saved).contract : saved.plan;
  if (!content || typeof content !== 'object' || Array.isArray(content))
    workFail('failed-precondition', 'Conteúdo editorial inconsistente.');
  const version = digest({ identityToken: identity, revision: saved.revision, content });
  return {
    sourceAvailable: true,
    identityMatches,
    versionMatches:
      capture.versionToken === version &&
      (capture.revision === null || capture.revision === saved.revision),
    manuscriptRead: false,
    editorialReview: false,
    contentVerification: 'editorial-hash',
    byteIntegrityChecked: true,
  };
}
