import { createHash } from 'node:crypto';
import { bookBackupIdentity, bookBackupToken, bookBackupChanged } from './bookBackupContext.mjs';
import { readWorkMetadata, workId, workFail, digest } from './workProgressContracts.mjs';
import { authorizeLiteraryWritingManifest } from './literaryWritingContext.mjs';
import { normalizeLiteraryWritingManifest } from './literaryWritingProtocol.mjs';
import { normalizeLiteraryGate, literaryGateReady } from './literaryGateProtocol.mjs';
import { createLiteraryReferenceReader } from './literaryReferences.mjs';
import {
  projectBookEditorialPlanReference,
  bookEditorialRecordIdentity,
} from './bookEditorialProjection.mjs';
import { normalizeBookEditorialArtifact } from './bookEditorialProtocol.mjs';
const fields = [
  'schemaVersion',
  'chapterId',
  'revision',
  'updatedAt',
  'stateToken',
  'manifest',
  'ready',
  'authorAccepted',
  'gateDigest',
];
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
  workFail('failed-precondition', 'A preparação salva está inconsistente. Preserve a origem.');
const ref = (bookId, id, state = 'recorded') => ({
  kind: 'artifact',
  id,
  parentId: null,
  scope: { kind: 'book', id: bookId },
  revision: null,
  contentHash: null,
  state,
  purpose: 'source',
});
const sourceDocId = (reference) =>
  reference.kind === 'volumeUnit'
    ? 'volume-unit:' + digest({ id: reference.id, scopeId: reference.scopeId })
    : reference.kind + ':' + reference.id + ':' + (reference.purpose ?? 'source');
/** Metadata-first private reader. Revoked origins never cause a gate body read. */
export async function readBookEditorialPreparationCapture(
  tx,
  c,
  { id, role, bookBirth, root, itemToken, tokenForRow },
) {
  const collection =
      role === 'current' ? 'literaryPreparationGates' : 'literaryPreparationGateVersions',
    row = await readWorkMetadata(tx, c.db.doc(c.path + '/' + collection + '/' + id), fields),
    header = row.data();
  if (!row.exists || tokenForRow(row) !== itemToken) bookBackupChanged(true);
  const chapterId = workId(header.chapterId),
    revision = header.revision;
  if (
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    (role === 'current' ? id !== chapterId : id !== digest({ id: chapterId, revision }))
  )
    fail();
  let head = null,
    state = 'artifact-bundle',
    selected = row,
    recordedRole = role;
  if (role === 'version') {
    head = await readWorkMetadata(
      tx,
      c.db.doc(c.path + '/literaryPreparationGates/' + chapterId),
      fields,
    );
    if (head.exists) {
      const value = head.data();
      if (!Number.isSafeInteger(value.revision) || value.revision < revision) fail();
      if (value.revision === revision) {
        if (stable(header) !== stable(value)) fail();
        state = 'current-alias';
        selected = head;
        recordedRole = 'current';
      }
    }
  }
  const logical = digest({ domain: 'writer-editorial-preparation-document-v1', chapterId }),
    identity = bookEditorialRecordIdentity({
      bookId: c.target.id,
      bookBirth,
      kind: 'document',
      id: logical,
      revision,
    });
  const common = {
    schemaVersion: 1,
    id: identity.id,
    kind: 'document',
    revision,
    createdAt: null,
    updatedAt: Object.hasOwn(header, 'updatedAt') ? header.updatedAt : null,
    provenance: 'unknown',
    lineage: { id: identity.lineage, role: recordedRole },
  };
  let manifest = null,
    unavailable = null;
  const pins = [];
  try {
    manifest = normalizeLiteraryWritingManifest(header.manifest);
  } catch {
    unavailable = 'unsupported-legacy-schema';
  }
  if (header.schemaVersion !== 1) unavailable = 'unsupported-legacy-schema';
  if (!unavailable) {
    if (
      manifest.resource.kind !== 'chapter' ||
      manifest.resource.id !== chapterId ||
      digest(manifest) !== bookBackupToken(header.stateToken)
    )
      fail();
    try {
      await authorizeLiteraryWritingManifest(tx, c, manifest);
    } catch (error) {
      if (['permission-denied', 'not-found'].includes(error.code)) unavailable = 'source-revoked';
      else throw error;
    }
  }
  let artifacts;
  if (unavailable) {
    pins.push({ authorization: unavailable });
    artifacts = [
      normalizeBookEditorialArtifact({
        ...common,
        availability: { state: 'unavailable', reason: unavailable },
        content: null,
      }),
    ];
  } else {
    const body = await tx.get(selected.ref),
      value = body.data();
    if (stable(bookBackupIdentity(body)) !== stable(bookBackupIdentity(selected)))
      bookBackupChanged(true);
    let gate;
    try {
      gate = normalizeLiteraryGate(value.gate);
    } catch {
      fail();
    }
    if (
      digest({ stateToken: header.stateToken, gate }) !== bookBackupToken(header.gateDigest) ||
      header.ready !== literaryGateReady(gate) ||
      header.authorAccepted !== gate.authorAccepted
    )
      fail();
    if (state === 'current-alias') {
      const original = await tx.get(row.ref);
      if (
        stable(bookBackupIdentity(original)) !== stable(bookBackupIdentity(row)) ||
        stable(original.data().gate) !== stable(value.gate)
      )
        fail();
    }
    const read = await createLiteraryReferenceReader(tx, c, root),
      sources = new Map();
    for (const entry of manifest.references) {
      const found = await read(entry.reference),
        matches = !!found && found.versionToken === entry.versionToken;
      pins.push({
        identity: found?.identityToken ?? null,
        version: found?.versionToken ?? null,
        matches,
      });
      sources.set(
        sourceDocId(entry.reference),
        projectBookEditorialPlanReference(
          c.target.id,
          root.universeId ?? null,
          entry.reference,
          matches ? 'recorded' : 'unavailable',
        ),
      );
    }
    const chapter = await readWorkMetadata(tx, c.db.doc(c.path + '/chapters/' + chapterId), [
        'ownerId',
        'bookId',
        'deleting',
        'archived',
      ]),
      chapterValue = chapter.data();
    const available =
      chapter.exists &&
      !chapterValue.deleting &&
      !chapterValue.archived &&
      (chapterValue.ownerId == null || chapterValue.ownerId === c.uid) &&
      (chapterValue.bookId == null || chapterValue.bookId === c.target.id);
    pins.push({ chapter: bookBackupIdentity(chapter), available });
    const chapterRef = {
      kind: 'chapter',
      id: chapterId,
      parentId: null,
      scope: { kind: 'book', id: c.target.id },
      revision: null,
      contentHash: null,
      state: available ? 'recorded' : 'unavailable',
      purpose: 'subject',
    };
    async function sourceReference(documentId) {
      if (sources.has(documentId)) return sources.get(documentId);
      let kind, nativeId, sourceRevision, path, currentPath;
      if (documentId === 'contract' && manifest.contractRevision > 0) {
        kind = 'contract';
        nativeId = 'current';
        sourceRevision = manifest.contractRevision;
        path = c.path + '/literaryContractVersions/' + sourceRevision;
        currentPath = c.path + '/literaryProduction/current';
      } else if (typeof documentId === 'string' && documentId.startsWith('plan:')) {
        const plan = manifest.plans.find((plan) => 'plan:' + plan.id === documentId);
        if (plan && plan.revision > 0) {
          kind = 'plan';
          nativeId = plan.id;
          sourceRevision = plan.revision;
          path =
            c.path + '/literaryPlanVersions/' + digest({ id: nativeId, revision: sourceRevision });
          currentPath = c.path + '/literaryPlans/' + nativeId;
        }
      }
      let result;
      if (kind) {
        const saved = await readWorkMetadata(tx, c.db.doc(path), ['revision', 'id']),
          current = await readWorkMetadata(tx, c.db.doc(currentPath), ['revision', 'id']);
        const exists =
          (saved.exists &&
            saved.data().revision === sourceRevision &&
            (kind === 'contract' || saved.data().id === nativeId)) ||
          (current.exists &&
            current.data().revision === sourceRevision &&
            (kind === 'contract' || current.data().id === nativeId));
        pins.push({
          source: documentId,
          saved: bookBackupIdentity(saved),
          current: bookBackupIdentity(current),
        });
        result = ref(
          c.target.id,
          bookEditorialRecordIdentity({
            bookId: c.target.id,
            bookBirth,
            kind,
            id: nativeId,
            revision: sourceRevision,
          }).id,
          exists ? 'recorded' : 'unavailable',
        );
      } else
        result = ref(
          c.target.id,
          digest({
            domain: 'writer-editorial-preparation-unrecorded-source-v1',
            parent: identity.id,
            documentId,
          }),
          'unavailable',
        );
      sources.set(documentId, result);
      return result;
    }
    const evidence = [],
      criteria = [];
    for (const criterion of value.gate.criteria) {
      const evidenceIds = [];
      for (const [index, source] of criterion.evidence.entries()) {
        const evidenceId = digest({
            domain: 'writer-editorial-preparation-evidence-v1',
            parent: identity.id,
            criterion: criterion.id,
            index,
          }),
          sourceRef = await sourceReference(source.documentId);
        evidenceIds.push(evidenceId);
        evidence.push(
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
              source: sourceRef,
              quote: source.quote,
              start: null,
              end: null,
              offsetUnit: 'not-recorded',
              classification: 'unclassified',
              rationale: criterion.rationale,
            },
          }),
        );
      }
      criteria.push({
        id: criterion.id,
        result: criterion.result,
        rationale: criterion.rationale,
        evidenceIds,
      });
    }
    const document = normalizeBookEditorialArtifact({
      ...common,
      provenance: value.assessment === 'author' ? 'author' : 'unknown',
      availability: { state: 'included' },
      content: {
        role: 'preparation',
        title: 'Preparação editorial do capítulo',
        sections: [],
        references: [],
        preparation: {
          chapter: chapterRef,
          historicalAcceptance: gate.authorAccepted,
          historicalReady: header.ready,
          notes: value.gate.notes,
          criteria,
        },
      },
    });
    artifacts = [document, ...evidence];
  }
  const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, artifacts }), 'utf8');
  if (bytes.length > 1024 * 1024 || artifacts.length > 43) fail();
  return {
    artifact: artifacts[0],
    artifacts,
    bytes,
    state,
    contentHash: createHash('sha256').update(bytes).digest('hex'),
    head: head ? bookBackupIdentity(head) : null,
    pins,
  };
}
