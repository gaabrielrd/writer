import {
  workScope,
  workProject,
  workFail,
  workId,
  workRevision,
  workConflict,
  workDate,
  workLimit,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { validateId } from './generation.mjs';
import {
  captureLiteraryWritingSnapshot,
  authorizeLiteraryWritingManifest,
  literaryWritingIsCurrent,
} from './literaryWritingContext.mjs';
import {
  LITERARY_GATE_CRITERIA,
  normalizeLiteraryGate,
  literaryGateReady,
  verifyLiteraryGateEvidence,
} from './literaryGateProtocol.mjs';

const headerFields = [
  'chapterId',
  'revision',
  'updatedAt',
  'stateToken',
  'manifest',
  'ready',
  'authorAccepted',
  'gateDigest',
];
const hash = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    workFail('invalid-argument', 'Confira as fontes atuais da preparação.');
  return value;
};
function scope(db, uid, data, keys) {
  const context = workScope(db, uid, data, keys);
  if (context.target.kind !== 'book') workFail('invalid-argument', 'Escolha um livro.');
  return context;
}
function gateValue(value) {
  try {
    return normalizeLiteraryGate(value);
  } catch (cause) {
    workFail('invalid-argument', cause.message);
  }
}
function preparationDocuments(snapshot) {
  return [
    {
      id: 'contract',
      label: 'Guia e decisões editoriais',
      text: snapshot.instruction,
      revision: snapshot.manifest.contractRevision,
    },
    ...snapshot.documents,
  ];
}
async function capture(tx, context, chapterId, planIds) {
  if (!Array.isArray(planIds) || planIds.length < 3)
    workFail('invalid-argument', 'Escolha ficha, cenas e worldbuilding local já salvos.');
  const snapshot = await captureLiteraryWritingSnapshot(
    tx,
    context,
    { kind: 'chapter', id: chapterId },
    { planIds, mode: 'chat' },
  );
  if (!snapshot)
    workFail('failed-precondition', 'Salve o planejamento antes de conferir a preparação.');
  const kinds = new Set();
  for (const document of snapshot.documents)
    if (document.id.startsWith('plan:')) {
      const plan = JSON.parse(document.text);
      if (['chapterBrief', 'scenePreparation', 'localWorldbuilding'].includes(plan.kind)) {
        if (
          !plan.references.some(
            (reference) =>
              reference.kind === 'chapter' &&
              reference.id === chapterId &&
              reference.purpose === 'subject',
          )
        )
          workFail(
            'failed-precondition',
            'Ficha, cenas e mundo local precisam identificar este capítulo como unidade planejada.',
          );
        if (plan.status === 'gap')
          workFail('failed-precondition', 'Complete os documentos marcados como lacuna.');
        kinds.add(plan.kind);
      }
    }
  if (!['chapterBrief', 'scenePreparation', 'localWorldbuilding'].every((kind) => kinds.has(kind)))
    workFail(
      'failed-precondition',
      'O pacote precisa de ficha, planejamento de cenas e worldbuilding local deste capítulo.',
    );
  return snapshot;
}
export function createLiteraryPreparationService({ db, now = Date.now }) {
  return {
    async getLiteraryPreparationContext(uid, data) {
      const context = scope(db, uid, data, ['chapterId', 'planIds']);
      const chapterId = workId(data.chapterId);
      return db.runTransaction(async (tx) => {
        const snapshot = await capture(tx, context, chapterId, data.planIds);
        return {
          snapshot,
          documents: preparationDocuments(snapshot),
          criteria: LITERARY_GATE_CRITERIA,
        };
      });
    },
    async saveLiteraryPreparationGate(uid, data) {
      const context = scope(db, uid, data, [
        'chapterId',
        'planIds',
        'stateToken',
        'gate',
        'expectedRevision',
        'operationId',
      ]);
      const chapterId = workId(data.chapterId),
        expectedRevision = workRevision(data.expectedRevision);
      const operationId = validateId(data.operationId),
        stateToken = hash(data.stateToken),
        gate = gateValue(data.gate);
      const fingerprint = digest({
        method: 'saveLiteraryPreparationGate',
        chapterId,
        planIds: data.planIds,
        stateToken,
        gate,
        expectedRevision,
      });
      const ref = db.doc(context.path + '/literaryPreparationGates/' + chapterId);
      const receiptRef = db.doc(context.path + '/literaryOperations/' + operationId);
      return db.runTransaction(async (tx) => {
        const root = await workProject(tx, context);
        const previous = (await tx.get(receiptRef)).data();
        if (previous) {
          if (previous.fingerprint !== fingerprint)
            workFail('invalid-argument', 'Operação usada por outro pedido.');
          return { chapterId, revision: previous.revision, updatedAt: previous.updatedAt };
        }
        const current = await readWorkMetadata(tx, ref, headerFields);
        const saved = current.data();
        if ((saved?.revision ?? 0) !== expectedRevision) workConflict();
        const snapshot = await capture(tx, context, chapterId, data.planIds);
        if (snapshot.stateToken !== stateToken) workConflict();
        try {
          verifyLiteraryGateEvidence(gate, preparationDocuments(snapshot));
        } catch (cause) {
          workFail('invalid-argument', cause.message);
        }
        const gateDigest = digest({ stateToken, gate });
        if (saved?.gateDigest === gateDigest) {
          const result = { chapterId, revision: saved.revision, updatedAt: saved.updatedAt };
          tx.create(receiptRef, {
            method: 'saveLiteraryPreparationGate',
            fingerprint,
            id: chapterId,
            revision: saved.revision,
            updatedAt: saved.updatedAt,
            noOp: true,
          });
          return result;
        }
        const revision = workRevision(expectedRevision + 1);
        const updatedAt = workDate(now, Math.max(root.updatedAt ?? 0, saved?.updatedAt ?? 0));
        const value = {
          schemaVersion: 1,
          chapterId,
          revision,
          updatedAt,
          stateToken,
          manifest: snapshot.manifest,
          ready: literaryGateReady(gate),
          authorAccepted: gate.authorAccepted,
          gate,
          gateDigest,
          assessment: 'author',
        };
        tx.set(ref, value);
        tx.create(
          db.doc(
            context.path +
              '/literaryPreparationGateVersions/' +
              digest({ id: chapterId, revision }),
          ),
          value,
        );
        tx.create(receiptRef, {
          method: 'saveLiteraryPreparationGate',
          fingerprint,
          id: chapterId,
          revision,
          updatedAt,
        });
        tx.update(context.ref, {
          updatedAt,
          hasLiteraryResources: true,
          literaryRevision: workRevision((root.literaryRevision ?? 0) + 1),
        });
        return { chapterId, revision, updatedAt };
      });
    },
    async getLiteraryPreparationGate(uid, data) {
      const context = scope(db, uid, data, ['chapterId', 'revision']);
      const chapterId = workId(data.chapterId);
      const revision = data.revision == null ? null : workRevision(data.revision);
      const ref = db.doc(
        revision === null
          ? context.path + '/literaryPreparationGates/' + chapterId
          : context.path +
              '/literaryPreparationGateVersions/' +
              digest({ id: chapterId, revision }),
      );
      return db.runTransaction(async (tx) => {
        await workProject(tx, context);
        const header = await readWorkMetadata(tx, ref, headerFields);
        if (!header.exists) return null;
        const metadata = header.data();
        // Authorize origins before reading any quotation or assessment body.
        await authorizeLiteraryWritingManifest(tx, context, metadata.manifest);
        const current = await literaryWritingIsCurrent(tx, context, metadata.manifest);
        const value = (await tx.get(ref)).data();
        return {
          ...value,
          current,
          ready: current && value.ready,
          authorAccepted: current && value.authorAccepted,
          recordedReady: value.ready,
          recordedAuthorAccepted: value.authorAccepted,
        };
      });
    },
    async listLiteraryPreparationGateVersions(uid, data) {
      const context = scope(db, uid, data, ['chapterId', 'beforeRevision', 'limit']);
      const chapterId = workId(data.chapterId),
        limit = workLimit(data.limit);
      const before = data.beforeRevision == null ? null : workRevision(data.beforeRevision);
      return db.runTransaction(async (tx) => {
        await workProject(tx, context);
        let query = db
          .collection(context.path + '/literaryPreparationGateVersions')
          .where('chapterId', '==', chapterId)
          .orderBy('revision', 'desc')
          .limit(limit)
          .select('chapterId', 'revision', 'updatedAt');
        if (before !== null) query = query.startAfter(before);
        const page = await tx.get(query);
        return {
          items: page.docs.map((row) => row.data()),
          nextBeforeRevision: page.docs.length === limit ? page.docs.at(-1).data().revision : null,
        };
      });
    },
  };
}
