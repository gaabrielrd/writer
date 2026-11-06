import { createHash } from 'node:crypto';
import { bookBackupIdentity, bookBackupToken, bookBackupChanged } from './bookBackupContext.mjs';
import { readWorkMetadata, workId, workFail, digest } from './workProgressContracts.mjs';
import {
  normalizeBookEditorialArtifact,
  normalizeBookEditorialReference,
} from './bookEditorialProtocol.mjs';
import { bookEditorialRecordIdentity } from './bookEditorialProjection.mjs';
import { literaryFindingTarget } from './literaryFindingTargets.mjs';
import { literaryFindingEditorialIdentity } from './literarySourceOrigins.mjs';
import { readLiteraryArchitectureTargetId } from './literaryArchitectureProtocol.mjs';
import { createLiteraryReferenceReader } from './literaryReferences.mjs';
const fields = {
  finding: [
    'schemaVersion',
    'id',
    'revision',
    'createdAt',
    'updatedAt',
    'source.jobId',
    'source.requestId',
    'source.index',
    'source.fingerprint',
    'action',
    'state',
    'rationale',
    'target',
    'baseline.identityToken',
    'baseline.versionToken',
    'baseline.contentHash',
    'baseline.revision',
    'baseline.proofKind',
    'correction.note',
    'correction.confirmedAt',
    'correction.versionId',
    'correction.targetRevision',
    'correction.contentHash',
    'correction.versionToken',
    'correction.proofKind',
  ],
  impact: [
    'uid',
    'jobId',
    'checkId',
    'controlBirth',
    'observationToken',
    'proofHash',
    'revision',
    'updatedAt',
    'status',
    'rationale',
    'evidence',
  ],
};
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const stable = (value) => digest(canonical(value));
const fail = () =>
  workFail(
    'failed-precondition',
    'A decisão editorial salva está inconsistente. Preserve a origem.',
  );
const revision = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : null);
const actualHash = (value) =>
  value &&
  ['text', 'editorial'].includes(value.proofKind) &&
  typeof value.contentHash === 'string' &&
  /^[a-f0-9]{64}$/.test(value.contentHash)
    ? value.contentHash
    : null;
const pointer = (bookId, id, state = 'unavailable') => ({
  kind: 'artifact',
  id,
  parentId: null,
  scope: { kind: 'book', id: bookId },
  revision: null,
  contentHash: null,
  state,
  purpose: 'source',
});
function logicalSource(bookId, bookBirth, family, value) {
  return digest({
    domain: 'writer-editorial-decision-subject-v1',
    bookId,
    bookBirth,
    family,
    source:
      family === 'finding'
        ? {
            jobId: value.source.jobId,
            requestId: value.source.requestId,
            index: value.source.index,
            fingerprint: value.source.fingerprint ?? null,
          }
        : {
            jobId: value.jobId,
            checkId: value.checkId,
            controlBirth: value.controlBirth,
            observationToken: value.observationToken,
            proofHash: value.proofHash,
          },
  });
}
async function targetReference(tx, c, root, bookBirth, input, snapshot, purpose, pins) {
  const target = literaryFindingTarget(input);
  if (!target) return null;
  const original = {
      identityToken: snapshot?.identityToken ?? null,
      versionToken: snapshot?.versionToken ?? null,
      revision: revision(snapshot?.revision),
      proofKind: snapshot?.proofKind ?? null,
    },
    contentHash = actualHash(snapshot);
  if (['contract', 'plan'].includes(target.kind)) {
    const id = target.kind === 'contract' ? 'current' : target.id,
      book = await readWorkMetadata(tx, c.ref, []),
      row = await readWorkMetadata(
        tx,
        c.db.doc(
          c.path +
            '/' +
            (target.kind === 'contract' ? 'literaryProduction' : 'literaryPlans') +
            '/' +
            id,
        ),
        ['revision'],
      );
    const validScope = target.scopeId === null || target.scopeId === c.target.id;
    const identity = row.exists
      ? literaryFindingEditorialIdentity(c, { book, kind: target.kind, id: target.id, row })
      : null;
    const matches =
      validScope &&
      row.exists &&
      identity === original.identityToken &&
      row.data().revision === original.revision;
    pins.push({ target: bookBackupIdentity(row), identity, matches });
    const artifactId =
      original.revision > 0
        ? bookEditorialRecordIdentity({
            bookId: c.target.id,
            bookBirth,
            kind: target.kind,
            id,
            revision: original.revision,
          }).id
        : digest({
            domain: 'writer-editorial-unknown-target-v1',
            bookId: c.target.id,
            bookBirth,
            target,
            original,
          });
    return {
      ...pointer(c.target.id, artifactId, matches ? 'recorded' : 'unavailable'),
      revision: original.revision,
      contentHash,
      purpose,
    };
  }
  let kind = target.kind,
    id = target.id,
    parentId = null,
    matches = false;
  const scope = {
    kind: kind === 'globalLore' ? 'universe' : 'book',
    id: target.scopeId ?? (kind === 'globalLore' ? (root.universeId ?? null) : c.target.id),
  };
  if (kind === 'architecture') {
    const source = readLiteraryArchitectureTargetId(id);
    kind = source.kind;
    id = source.id;
    parentId = source.arcId;
    if (
      ![
        'act',
        'chapter',
        'scene',
        'arc',
        'event',
        'arcMilestone',
        'sceneLink',
        'narrativeLink',
        'narrativeControl',
      ].includes(kind)
    )
      fail();
  } else {
    const read = await createLiteraryReferenceReader(tx, c, root),
      found = await read({ ...target, purpose: 'source' });
    matches =
      !!found &&
      found.identityToken === original.identityToken &&
      found.versionToken === original.versionToken;
    pins.push({
      target: target.kind,
      id: target.id,
      identity: found?.identityToken ?? null,
      version: found?.versionToken ?? null,
      matches,
    });
  }
  if (kind === 'localLore' || kind === 'globalLore') kind = 'lore';
  return normalizeBookEditorialReference({
    kind,
    id,
    parentId,
    scope,
    revision: original.revision,
    contentHash,
    state: matches ? 'recorded' : 'unavailable',
    purpose,
  });
}
/** Read only the author-owned annotation fields. No finding results, impact checks,
 * cached baseline labels, or target bodies are read by this capture port.
 */
export async function readBookEditorialDecisionCapture(
  tx,
  c,
  { id, role, family, bookBirth, root, itemToken, tokenForRow },
) {
  if (!['finding', 'impact'].includes(family)) fail();
  const prefix = family === 'finding' ? 'literaryFinding' : 'literaryImpact',
    collection = prefix + (role === 'current' ? 'Decisions' : 'DecisionVersions'),
    reference = c.db.doc(c.path + '/' + collection + '/' + id);
  if (family === 'impact') {
    const actor = await readWorkMetadata(tx, reference, ['uid']);
    if (!actor.exists || tokenForRow(actor) !== itemToken) bookBackupChanged(true);
    if (actor.data().uid !== c.uid)
      workFail('permission-denied', 'A anotação pertence a outra conta.');
  }
  const row = await readWorkMetadata(tx, reference, fields[family]),
    value = row.data();
  if (!row.exists || tokenForRow(row) !== itemToken) bookBackupChanged(true);
  let nativeId;
  if (family === 'finding') {
    if (
      value.schemaVersion !== 1 ||
      !value.source ||
      !Number.isSafeInteger(value.source.index) ||
      value.source.index < 0 ||
      value.source.index >= 40
    )
      fail();
    workId(value.source.jobId);
    workId(value.source.requestId);
    if (value.source.fingerprint != null) bookBackupToken(value.source.fingerprint);
    nativeId = digest({
      jobId: value.source.jobId,
      requestId: value.source.requestId,
      index: value.source.index,
    });
    if (value.id !== nativeId) fail();
  } else {
    workId(value.jobId);
    bookBackupToken(value.checkId);
    bookBackupToken(value.observationToken);
    bookBackupToken(value.proofHash);
    if (
      !Array.isArray(value.controlBirth) ||
      value.controlBirth.length !== 2 ||
      !Number.isSafeInteger(value.controlBirth[0]) ||
      value.controlBirth[0] < 0 ||
      !Number.isInteger(value.controlBirth[1]) ||
      value.controlBirth[1] < 0 ||
      value.controlBirth[1] >= 1e9
    )
      fail();
    nativeId = digest({ jobId: value.jobId, checkId: value.checkId });
  }
  if (!Number.isSafeInteger(value.revision) || value.revision < 1) fail();
  if (
    family === 'impact' &&
    (role === 'current'
      ? id !== nativeId
      : id !== digest({ jobId: value.jobId, checkId: value.checkId, revision: value.revision }))
  )
    fail();
  if (
    family === 'finding' &&
    (role === 'current'
      ? id !== nativeId
      : id !== digest({ id: nativeId, revision: value.revision }))
  )
    fail();
  let head = null,
    state = 'artifact-bundle',
    selected = value,
    recordedRole = role;
  if (role === 'version') {
    const headRef = c.db.doc(c.path + '/' + prefix + 'Decisions/' + nativeId),
      actor = family === 'impact' ? await readWorkMetadata(tx, headRef, ['uid']) : null;
    head =
      actor?.exists && actor.data().uid !== c.uid
        ? actor
        : await readWorkMetadata(tx, headRef, fields[family]);
    if (head.exists && (family !== 'impact' || head.data().uid === c.uid)) {
      const current = head.data();
      if (!Number.isSafeInteger(current.revision) || current.revision < value.revision) fail();
      if (current.revision === value.revision) {
        if (stable(current) !== stable(value)) fail();
        state = 'current-alias';
        selected = current;
        recordedRole = 'current';
      }
    }
  }
  const correction =
    selected.correction && Object.keys(selected.correction).length ? selected.correction : null;
  const source = pointer(c.target.id, logicalSource(c.target.id, bookBirth, family, selected)),
    logical = digest({ domain: 'writer-editorial-own-decision-v1', family, nativeId }),
    identity = bookEditorialRecordIdentity({
      bookId: c.target.id,
      bookBirth,
      kind: 'decision',
      id: logical,
      revision: selected.revision,
    }),
    pins = [],
    references = [source],
    children = [];
  let annotation, text, status;
  const evidenceIds = [];
  if (family === 'finding') {
    text = selected.action;
    status = selected.state;
    let targetType = selected.target?.kind ?? null;
    if (targetType === 'architecture')
      targetType += ':' + readLiteraryArchitectureTargetId(selected.target.id).kind;
    annotation = { family, action: selected.action, state: selected.state, targetType };
    const target = selected.target
      ? await targetReference(
          tx,
          c,
          root,
          bookBirth,
          selected.target,
          selected.baseline,
          'subject',
          pins,
        )
      : null;
    if (target) references.push(target);
    if (correction) {
      annotation.correction = {
        note: Object.hasOwn(correction, 'note') ? correction.note : null,
        confirmedAt: correction.confirmedAt ?? null,
      };
      const corrected = selected.target
        ? await targetReference(
            tx,
            c,
            root,
            bookBirth,
            selected.target,
            {
              ...correction,
              revision: correction.targetRevision,
              identityToken: selected.baseline?.identityToken,
            },
            'source',
            pins,
          )
        : null;
      if (corrected) references.push(corrected);
      if (correction.versionId) {
        const versionId = workId(correction.versionId),
          version = await readWorkMetadata(tx, c.db.doc(c.path + '/workVersions/' + versionId), [
            'id',
            'target',
            'resource',
            'deleting',
            'contentHash',
          ]),
          metadata = version.data(),
          matches =
            version.exists &&
            typeof metadata.contentHash === 'string' &&
            /^[a-f0-9]{64}$/.test(metadata.contentHash) &&
            !metadata.deleting &&
            metadata.id === versionId &&
            metadata.target?.kind === 'book' &&
            metadata.target.id === c.target.id &&
            !!metadata.resource &&
            !!selected.target &&
            metadata.resource.kind === selected.target.kind &&
            metadata.resource.id === selected.target.id &&
            metadata.contentHash === correction.contentHash;
        pins.push({ history: bookBackupIdentity(version), matches });
        references.push({
          kind: 'historyVersion',
          id: versionId,
          parentId: null,
          scope: { kind: 'book', id: c.target.id },
          revision: null,
          contentHash: matches ? metadata.contentHash : null,
          state: matches ? 'recorded' : 'unavailable',
          purpose: 'source',
        });
      }
    }
  } else {
    text = selected.status;
    status = selected.status;
    annotation = { family, action: null, state: status, targetType: null };
    if (!Array.isArray(selected.evidence) || selected.evidence.length > 8) fail();
    for (const [index, evidence] of selected.evidence.entries()) {
      if (
        !evidence ||
        Object.keys(evidence).some((key) => key !== 'note') ||
        typeof evidence.note !== 'string' ||
        !evidence.note.trim() ||
        evidence.note.length > 1500
      )
        fail();
      const evidenceId = digest({
        domain: 'writer-editorial-own-decision-evidence-v1',
        parent: identity.id,
        index,
      });
      evidenceIds.push(evidenceId);
      children.push(
        normalizeBookEditorialArtifact({
          schemaVersion: 1,
          id: evidenceId,
          kind: 'evidence',
          revision: null,
          createdAt: null,
          updatedAt: null,
          provenance: 'unknown',
          availability: { state: 'included' },
          content: {
            source,
            quote: '',
            start: null,
            end: null,
            offsetUnit: 'not-recorded',
            classification: 'interpretation',
            rationale: evidence.note,
          },
        }),
      );
    }
  }
  const artifact = normalizeBookEditorialArtifact({
      schemaVersion: 1,
      id: identity.id,
      kind: 'decision',
      revision: selected.revision,
      createdAt: Object.hasOwn(selected, 'createdAt') ? selected.createdAt : null,
      updatedAt: Object.hasOwn(selected, 'updatedAt') ? selected.updatedAt : null,
      provenance: 'unknown',
      lineage: { id: identity.lineage, role: recordedRole },
      availability: { state: 'included' },
      content: {
        status,
        category: null,
        text,
        rationale: selected.rationale,
        supersedes: null,
        evidenceIds,
        references,
        annotation,
      },
    }),
    artifacts = [artifact, ...children],
    bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, artifacts }), 'utf8');
  if (bytes.length > 1024 * 1024 || artifacts.length > 9) fail();
  return {
    artifact,
    artifacts,
    bytes,
    state,
    contentHash: createHash('sha256').update(bytes).digest('hex'),
    head: head ? bookBackupIdentity(head) : null,
    pins,
  };
}
