import {
  BOOK_EDITORIAL_CAPTURE_DEFINITIONS,
  BOOK_EDITORIAL_CAPTURE_FAMILIES,
  BOOK_EDITORIAL_CAPTURE_CATALOG_VERSION,
} from './bookEditorialCaptureCatalog.mjs';
import { readBookEditorialImpactCapture } from './bookEditorialImpactCapture.mjs';
import { readBookEditorialOrchestrationCapture } from './bookEditorialOrchestrationCapture.mjs';
import { readBookEditorialCheckpointCapture } from './bookEditorialCheckpointCapture.mjs';
import { readBookEditorialPublicationCapture } from './bookEditorialPublicationCapture.mjs';
import { readBookEditorialIntegrationCapture } from './bookEditorialIntegrationCapture.mjs';
import { readBookEditorialReviewCapture } from './bookEditorialReviewCapture.mjs';
import { readBookEditorialGenerationCapture } from './bookEditorialGenerationCapture.mjs';
import { readBookEditorialProseCapture } from './bookEditorialProseCapture.mjs';
import { readBookEditorialDecisionCapture } from './bookEditorialDecisionCapture.mjs';
import { readBookEditorialPreparationCapture } from './bookEditorialPreparationCapture.mjs';
import {
  readLiteraryProgressArtifactMetadata,
  LITERARY_PROGRESS_STAGES,
} from './literaryProgress.mjs';
import {
  bookBackupScope,
  bookBackupToken,
  bookBackupIdentity,
  bookBackupChanged,
  readBookBackupSource,
} from './bookBackupContext.mjs';
import { readLiteraryBackupFence } from './literaryBackupFence.mjs';
import {
  workClosed,
  workFail,
  workId,
  workLimit,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { createLiteraryReferenceReader } from './literaryReferences.mjs';
import { literaryReference } from './literaryPlanningSchema.mjs';
import {
  projectBookEditorialContract,
  projectBookEditorialPlan,
  projectBookEditorialProgressNote,
  bookEditorialRecordIdentity,
} from './bookEditorialProjection.mjs';
import { createHash } from 'node:crypto';
const definitions = BOOK_EDITORIAL_CAPTURE_DEFINITIONS;
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
const bytesHash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = () =>
  workFail('failed-precondition', 'O registro editorial está inconsistente. Preserve a origem.');
function family(value) {
  if (!Object.hasOwn(definitions, value))
    workFail('invalid-argument', 'Família editorial inválida.');
  return definitions[value];
}
function versionPayload(value, kind) {
  const common = {
    revision: value.revision,
    ...(Object.hasOwn(value, 'createdAt') ? { createdAt: value.createdAt } : {}),
    ...(Object.hasOwn(value, 'updatedAt') ? { updatedAt: value.updatedAt } : {}),
  };
  return kind === 'progress'
    ? {
        ...common,
        version: value.version,
        nativeOrigin: value.nativeOrigin,
        artifact: value.artifact,
        sourceToken: value.sourceToken,
        notes: value.notes,
        blockerCount: value.blockerCount,
        hasNextStep: value.hasNextStep,
      }
    : { ...common, [kind]: value[kind] };
}
/** Internal bounded reader, deliberately not registered in a callable or producer.
 * Saved editorial records only; never certifies the complete editorial book.
 */
export function createBookEditorialCaptureService({ db }) {
  const scope = (uid, data, keys) => bookBackupScope(db, uid, data, keys);
  const request = (data) => ({
    bookSourceToken: bookBackupToken(data.bookSourceToken),
    editorialSourceToken: bookBackupToken(data.editorialSourceToken),
  });
  async function current(tx, c, r) {
    const source = await readBookBackupSource(tx, c, r.bookSourceToken),
      fence = await readLiteraryBackupFence(tx, c, r.editorialSourceToken),
      root = await readWorkMetadata(tx, c.ref, []);
    return { source, fence, birth: bookBackupIdentity(root).created };
  }
  const nativeToken = (c, r, type, row) =>
    digest({
      domain: 'writer-editorial-capture-item-v1',
      uid: c.uid,
      bookId: c.target.id,
      ...r,
      family: type,
      id: row.id,
      native: bookBackupIdentity(row),
    });
  const base = (c, r) => ({
    schemaVersion: 1,
    bookId: c.target.id,
    ...r,
    coverage: 'saved-editorial-records-only',
  });
  function cursor(value, c, r, type) {
    if (value == null) return null;
    let parsed;
    if (typeof value !== 'string' || value.length > 16000 || !/^[A-Za-z0-9_-]+$/.test(value))
      workFail('invalid-argument', 'Página editorial inválida.');
    try {
      parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    } catch {
      workFail('invalid-argument', 'Página editorial inválida.');
    }
    workClosed(parsed, [
      'version',
      'uid',
      'bookId',
      'bookSourceToken',
      'editorialSourceToken',
      'family',
      'id',
    ]);
    if (
      Buffer.from(JSON.stringify(parsed)).toString('base64url') !== value ||
      parsed.version !== 1 ||
      parsed.uid !== c.uid ||
      parsed.bookId !== c.target.id ||
      parsed.bookSourceToken !== r.bookSourceToken ||
      parsed.editorialSourceToken !== r.editorialSourceToken ||
      parsed.family !== type
    )
      workFail('invalid-argument', 'Página de outra captura.');
    return workId(parsed.id);
  }
  async function progressReferences(tx, c, observed, value, pins) {
    const source = value.artifact;
    if (!source || !LITERARY_PROGRESS_STAGES.includes(source.stage)) fail();
    const originalId = workId(source.id);
    let item = null;
    try {
      item = await readLiteraryProgressArtifactMetadata(tx, c, source.stage, originalId);
    } catch (error) {
      if (!['not-found', 'permission-denied'].includes(error.code)) throw error;
    }
    pins.push({
      noteSource: item ? { origin: item.nativeOrigin, version: item.sourceToken } : null,
    });
    const exact =
      item && item.nativeOrigin === value.nativeOrigin && item.sourceToken === value.sourceToken;
    let associatedId = digest({
        domain: 'writer-editorial-unavailable-progress-source-v1',
        bookId: c.target.id,
        bookBirth: observed.birth,
        stage: source.stage,
        id: originalId,
        origin: value.nativeOrigin,
        version: value.sourceToken,
      }),
      associatedState = 'unavailable';
    if (
      exact &&
      ['contract', 'planning'].includes(source.stage) &&
      Number.isSafeInteger(item.revision) &&
      item.revision > 0
    ) {
      associatedId = bookEditorialRecordIdentity({
        bookId: c.target.id,
        bookBirth: observed.birth,
        kind: source.stage === 'contract' ? 'contract' : 'plan',
        id: source.stage === 'contract' ? 'current' : originalId,
        revision: item.revision,
      }).id;
      associatedState = 'recorded';
    }
    const association = {
        kind: 'artifact',
        id: associatedId,
        parentId: null,
        scope: { kind: 'book', id: c.target.id },
        revision: null,
        contentHash: null,
        state: associatedState,
        purpose: 'subject',
      },
      resource = source.resource;
    if (!resource || !['book', 'chapter', 'act'].includes(resource.kind)) fail();
    workId(resource.id);
    let resourceState = 'unavailable';
    if (resource.kind === 'book') {
      if (resource.id === c.target.id) resourceState = 'recorded';
    } else {
      const row = await readWorkMetadata(
          tx,
          db.doc(
            c.path + '/' + (resource.kind === 'chapter' ? 'chapters' : 'acts') + '/' + resource.id,
          ),
          ['ownerId', 'bookId', 'deleting', 'deleted', 'archived'],
        ),
        data = row.data();
      if (
        row.exists &&
        !data.deleting &&
        !data.deleted &&
        !data.archived &&
        (data.ownerId == null || data.ownerId === c.uid) &&
        (data.bookId == null || data.bookId === c.target.id)
      )
        resourceState = 'recorded';
      pins.push({ noteResource: bookBackupIdentity(row), state: resourceState });
    }
    return { association, resourceState };
  }
  async function projection(tx, c, r, type, id, itemToken) {
    const definition = family(type),
      observed = await current(tx, c, r);
    if (definition.singleton && id !== definition.singleton)
      workFail('invalid-argument', 'Registro editorial inválido.');
    if (
      [
        'preparation',
        'decision',
        'prose',
        'generation',
        'review',
        'integration',
        'publication',
        'checkpoint',
        'orchestration',
        'impact-map',
      ].includes(definition.kind)
    ) {
      const reader =
        definition.kind === 'preparation'
          ? readBookEditorialPreparationCapture
          : definition.kind === 'prose'
            ? readBookEditorialProseCapture
            : definition.kind === 'generation'
              ? readBookEditorialGenerationCapture
              : definition.kind === 'review'
                ? readBookEditorialReviewCapture
                : definition.kind === 'integration'
                  ? readBookEditorialIntegrationCapture
                  : definition.kind === 'publication'
                    ? readBookEditorialPublicationCapture
                    : definition.kind === 'checkpoint'
                      ? readBookEditorialCheckpointCapture
                      : definition.kind === 'orchestration'
                        ? readBookEditorialOrchestrationCapture
                        : definition.kind === 'impact-map'
                          ? readBookEditorialImpactCapture
                          : readBookEditorialDecisionCapture;
      const value = await reader(tx, c, {
        id,
        role: definition.role,
        family:
          definition.impactFamily ??
          definition.orchestrationFamily ??
          definition.checkpointFamily ??
          definition.publicationFamily ??
          definition.integrationFamily ??
          definition.reviewFamily ??
          definition.decisionFamily,
        bookBirth: observed.birth,
        root: observed.source.root,
        itemToken,
        tokenForRow: (row) => nativeToken(c, r, type, row),
      });
      const projectionToken = digest({
        domain: 'writer-editorial-capture-projection-v1',
        uid: c.uid,
        bookId: c.target.id,
        ...r,
        family: type,
        id,
        itemToken,
        head: value.head,
        references: value.pins,
        state: value.state,
        contentHash: value.contentHash,
      });
      return { ...value, projectionToken };
    }
    const row = await tx.get(db.doc(c.path + '/' + definition.collection + '/' + id)),
      value = row.data();
    if (!row.exists || nativeToken(c, r, type, row) !== itemToken) bookBackupChanged(true);
    const nativeId =
      definition.kind === 'contract'
        ? 'current'
        : definition.kind === 'progress'
          ? digest({
              domain: 'literary-progress-note-v1',
              nativeOrigin: bookBackupToken(value.nativeOrigin),
            })
          : workId(value.id);
    let head = null,
      state = 'artifact';
    if (definition.kind === 'progress') {
      if (value.version !== 1) fail();
      bookBackupToken(value.sourceToken);
    }
    if (definition.kind !== 'contract' && definition.role === 'current' && nativeId !== id) fail();
    if (definition.role === 'version') {
      if (
        definition.kind === 'contract'
          ? String(value.revision) !== id
          : digest({ id: nativeId, revision: value.revision }) !== id
      )
        fail();
      head = await tx.get(
        db.doc(
          c.path +
            '/' +
            {
              contract: 'literaryProduction',
              plan: 'literaryPlans',
              progress: 'literaryProgressNotes',
            }[definition.kind] +
            '/' +
            nativeId,
        ),
      );
      if (head.exists) {
        const saved = head.data();
        if (!Number.isSafeInteger(saved.revision) || saved.revision < value.revision) fail();
        if (definition.kind === 'plan' && saved.plan?.kind !== value.plan?.kind) fail();
        if (saved.revision === value.revision) {
          if (
            stable(versionPayload(saved, definition.kind)) !==
            stable(versionPayload(value, definition.kind))
          )
            fail();
          state = 'current-alias';
        }
      }
    }
    const states = [],
      pins = [];
    if (definition.kind === 'plan') {
      const refs = value.plan?.references;
      if (!Array.isArray(refs) || refs.length > 12) fail();
      const read = await createLiteraryReferenceReader(tx, c, observed.source.root);
      for (const input of refs) {
        const ref = literaryReference(input),
          found = await read(ref),
          matches =
            !!found &&
            found.reference.sourceToken === ref.sourceToken &&
            (ref.purpose === 'subject' || found.reference.revision === ref.revision);
        states.push(matches ? 'recorded' : 'unavailable');
        pins.push({
          original: stable(ref),
          identity: found?.identityToken ?? null,
          version: found?.versionToken ?? null,
          matches,
        });
      }
    }
    const progress =
      definition.kind === 'progress'
        ? await progressReferences(tx, c, observed, value, pins)
        : null;
    const args = {
      bookId: c.target.id,
      bookBirth: observed.birth,
      value: state === 'current-alias' ? head.data() : value,
      role: state === 'current-alias' ? 'current' : definition.role,
    };
    let artifact;
    try {
      artifact =
        definition.kind === 'contract'
          ? projectBookEditorialContract(args)
          : definition.kind === 'progress'
            ? projectBookEditorialProgressNote({ ...args, id: nativeId, ...progress })
            : projectBookEditorialPlan({
                ...args,
                id: nativeId,
                universeId: observed.source.root.universeId ?? null,
                referenceStates: states,
              });
    } catch (error) {
      if (error.code) throw error;
      fail();
    }
    const bytes = Buffer.from(JSON.stringify(artifact), 'utf8'),
      contentHash = bytesHash(bytes),
      projectionToken = digest({
        domain: 'writer-editorial-capture-projection-v1',
        uid: c.uid,
        bookId: c.target.id,
        ...r,
        family: type,
        id,
        itemToken,
        head: head ? bookBackupIdentity(head) : null,
        references: pins,
        state,
        contentHash,
      });
    return { artifact, bytes, state, contentHash, projectionToken };
  }
  function recordRequest(uid, data, extra) {
    const c = scope(uid, data, [
        'bookSourceToken',
        'editorialSourceToken',
        'family',
        'id',
        'itemToken',
        'projectionToken',
        ...extra,
      ]),
      r = request(data),
      type = data.family;
    family(type);
    return {
      c,
      r,
      type,
      id: workId(data.id),
      itemToken: bookBackupToken(data.itemToken),
      expected: Object.hasOwn(data, 'projectionToken')
        ? bookBackupToken(data.projectionToken)
        : null,
    };
  }
  const metadata = (c, r, type, id, itemToken, value) => ({
    ...base(c, r),
    family: type,
    id,
    itemToken,
    state: value.state,
    artifactId: value.artifact.id,
    projectionToken: value.projectionToken,
    contentHash: value.contentHash,
    ...(value.artifacts
      ? { payload: 'editorial-bundle', recordCount: value.artifacts.length }
      : { payload: 'editorial-artifact', recordCount: 1 }),
  });
  return {
    async getBookEditorialCaptureSource(uid, data) {
      const c = scope(uid, data, ['expectedBookSourceToken']),
        expected = Object.hasOwn(data, 'expectedBookSourceToken')
          ? bookBackupToken(data.expectedBookSourceToken)
          : undefined;
      return db.runTransaction(async (tx) => {
        const source = await readBookBackupSource(tx, c, expected),
          fence = await readLiteraryBackupFence(tx, c);
        return base(c, {
          bookSourceToken: source.result.sourceToken,
          editorialSourceToken: fence.token,
        });
      });
    },
    async getBookEditorialCaptureCatalog(uid, data) {
      const c = scope(uid, data, ['bookSourceToken', 'editorialSourceToken']),
        r = request(data);
      return db.runTransaction(async (tx) => {
        const observed = await current(tx, c, r);
        return {
          ...base(c, r),
          catalogVersion: BOOK_EDITORIAL_CAPTURE_CATALOG_VERSION,
          catalogToken: digest({ version: BOOK_EDITORIAL_CAPTURE_CATALOG_VERSION, definitions }),
          families: [...BOOK_EDITORIAL_CAPTURE_FAMILIES],
          fenceCoverage: observed.fence.coverage,
        };
      });
    },
    async inspectBookEditorialCaptureRecord(uid, data) {
      const { c, r, type, id, itemToken, expected } = recordRequest(uid, data, []);
      return db.runTransaction(async (tx) => {
        const value = await projection(tx, c, r, type, id, itemToken);
        if (expected !== null && value.projectionToken !== expected) bookBackupChanged(true);
        return metadata(c, r, type, id, itemToken, value);
      });
    },
    async listBookEditorialCaptureRecords(uid, data) {
      const c = scope(uid, data, [
          'bookSourceToken',
          'editorialSourceToken',
          'family',
          'cursor',
          'limit',
        ]),
        r = request(data),
        type = data.family,
        definition = family(type),
        limit = workLimit(data.limit),
        after = cursor(data.cursor, c, r, type);
      if (definition.singleton && after !== null)
        workFail('invalid-argument', 'Registro único sem páginas.');
      return db.runTransaction(async (tx) => {
        await current(tx, c, r);
        let selected,
          more = false;
        if (definition.singleton) {
          const row = await readWorkMetadata(
            tx,
            db.doc(c.path + '/' + definition.collection + '/' + definition.singleton),
            [],
          );
          selected = row.exists ? [row] : [];
        } else {
          let query = db
            .collection(c.path + '/' + definition.collection)
            .orderBy('__name__')
            .limit(limit + 1)
            .select(...(definition.listFields ?? []));
          if (after !== null) query = query.startAfter(after);
          const page = await tx.get(query);
          selected = page.docs.slice(0, limit);
          more = page.docs.length > limit;
        }
        return {
          ...base(c, r),
          family: type,
          items: selected
            .filter((row) => definition.decisionFamily !== 'impact' || row.data().uid === c.uid)
            .map((row) => ({ id: row.id, itemToken: nativeToken(c, r, type, row) })),
          lastId: selected.at(-1)?.id ?? null,
          nextCursor: more
            ? Buffer.from(
                JSON.stringify({
                  version: 1,
                  uid: c.uid,
                  bookId: c.target.id,
                  ...r,
                  family: type,
                  id: selected.at(-1).id,
                }),
              ).toString('base64url')
            : null,
        };
      });
    },
    async readBookEditorialCaptureRecord(uid, data) {
      const { c, r, type, id, itemToken, expected } = recordRequest(uid, data, ['index']),
        index = data.index;
      if (!Number.isSafeInteger(index) || index < 0 || (index > 0 && expected === null))
        workFail('invalid-argument', 'Parte editorial inválida.');
      return db.runTransaction(async (tx) => {
        const value = await projection(tx, c, r, type, id, itemToken);
        if (expected !== null && expected !== value.projectionToken) bookBackupChanged(true);
        const result = metadata(c, r, type, id, itemToken, value);
        if (value.state === 'current-alias') {
          if (index !== 0) workFail('invalid-argument', 'Alias sem partes.');
          return result;
        }
        const chunkCount = Math.ceil(value.bytes.length / 65536);
        if (index >= chunkCount) workFail('invalid-argument', 'Parte fora do registro.');
        const part = value.bytes.subarray(index * 65536, (index + 1) * 65536);
        return {
          ...result,
          index,
          byteLength: value.bytes.length,
          chunkCount,
          chunkHash: bytesHash(part),
          chunkBase64: part.toString('base64'),
        };
      });
    },
    async verifyBookEditorialCaptureRecord(uid, data) {
      const { c, r, type, id, itemToken, expected } = recordRequest(uid, data, []);
      if (expected === null) workFail('invalid-argument', 'Informe a projeção original.');
      return db.runTransaction(async (tx) => {
        const value = await projection(tx, c, r, type, id, itemToken);
        if (value.projectionToken !== expected) bookBackupChanged(true);
        return metadata(c, r, type, id, itemToken, value);
      });
    },
    async verifyBookEditorialCaptureSource(uid, data) {
      const c = scope(uid, data, ['bookSourceToken', 'editorialSourceToken']),
        r = request(data);
      return db.runTransaction(async (tx) => {
        await current(tx, c, r);
        return base(c, r);
      });
    },
  };
}
