import {
  workScope,
  workProject,
  workId,
  workFail,
  workRevision,
  workDate,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { validateId } from './generation.mjs';
import { literaryNativeBirth } from './literarySourceOrigins.mjs';
import { prepareLiteraryDependencyWrite } from './literaryDependencyClock.mjs';
import { readLiteraryPublicationPolicy } from './literaryPublicationPolicy.mjs';
import { captureLiteraryPublicationPassage } from './literaryPublicationPassage.mjs';
import {
  readLiteraryIntegrationFence,
  readLiteraryIntegrationChapter,
  listLiteraryIntegrationChapters,
  orderLiteraryIntegrationChapters,
} from './literaryIntegrationSources.mjs';

const fail = (message) => workFail('failed-precondition', message, 'workflow-publication');
const collection = 'literaryPassageInspections';
const scope = (db, uid, data, keys) => {
  const c = workScope(db, uid, data, keys);
  if (c.target.kind !== 'book') workFail('invalid-argument', 'Escolha um livro.');
  return c;
};
const ref = (c, id) => c.db.doc(c.path + '/' + collection + '/' + validateId(id));
const before = (a, b) => a.id !== b.id && orderLiteraryIntegrationChapters([a, b])[0].id === a.id;
const seed = digest({ domain: 'literary-passage-order-inventory-v1' });
const scopeToken = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    workFail('invalid-argument', 'Confira a origem nativa da inspeção.');
  return value;
};
async function captureScope(tx, c, chapterId) {
  await workProject(tx, c);
  const book = await readWorkMetadata(tx, c.ref, []),
    chapter = await readLiteraryIntegrationChapter(tx, c, chapterId);
  return {
    chapterId,
    scopeToken: digest({
      domain: 'literary-passage-start-scope-v1',
      actorId: c.uid,
      target: c.target,
      bookBirth: literaryNativeBirth(book),
      chapterId,
      chapterIdentityToken: chapter.identityToken,
    }),
  };
}
const startFingerprint = (c, chapterId, publicationId, expectedScopeToken) =>
  digest({
    domain: 'literary-passage-start-v2',
    actorId: c.uid,
    target: c.target,
    chapterId,
    publicationId,
    expectedScopeToken,
  });

const actBirth = async (tx, c, chapter) =>
  chapter.actId
    ? literaryNativeBirth(
        await readWorkMetadata(tx, c.db.doc(c.path + '/acts/' + chapter.actId), []),
      )
    : null;
const publicationScope = (value) => {
  const previous = value.previous;
  if (!previous) return null;
  if (value.publicationMode === 'act' && previous.actId !== null) {
    if (previous.actId === value.chapter.actId) return null;
    return { kind: 'act', id: previous.actId };
  }
  return { kind: 'chapter', id: previous.id };
};
const editionIdentity = (proof) => ({
  publicationId: proof.publicationId,
  bookToken: proof.bookToken,
  publicationBirth: proof.publicationBirth,
  confirmationId: proof.confirmationId,
  confirmationBirth: proof.confirmationBirth,
  editionBirth: proof.editionBirth,
  editionHash: proof.editionHash,
});
const origin = (c, row, value) =>
  digest({
    domain: 'literary-passage-inspection-v1',
    actorId: c.uid,
    target: c.target,
    bookBirth: value.bookBirth,
    birth: literaryNativeBirth(row),
    inspectionId: row.id,
  });
function summary(c, row, value) {
  return {
    inspectionId: row.id,
    originToken: origin(c, row, value),
    chapterId: value.chapterId,
    expectedScopeToken: value.expectedScopeToken ?? null,
    chapterActId: value.chapter.actId,
    state: value.state,
    revision: value.revision,
    scanned: value.count,
    verified: value.verifiedCount,
    previous: value.state === 'ready' ? value.previous : null,
    previousActTail: value.state === 'ready' ? value.previousActTail : null,
    firstInAct: value.state === 'ready' ? value.firstInAct : null,
    inventoryHash: value.state === 'ready' ? value.inventoryHash : null,
    publicationId: value.publicationId ?? null,
    publicationMode: value.publicationMode ?? null,
    publicationChecked: value.publicationCount ?? 0,
    publication: value.state === 'ready' ? (value.publication ?? null) : null,
  };
}
async function read(tx, c, id) {
  await workProject(tx, c);
  const row = await tx.get(ref(c, id)),
    value = row.data(),
    book = await readWorkMetadata(tx, c.ref, []);
  if (!value || value.actorId !== c.uid) workFail('not-found', 'Inspeção indisponível.');
  if (digest(value.bookBirth) !== digest(literaryNativeBirth(book)))
    fail('O livro da inspeção foi recriado.');
  return { row, value };
}
async function current(tx, c, value) {
  const fence = await readLiteraryIntegrationFence(tx, c);
  if (fence.token !== value.sourceFence)
    fail('A estrutura mudou. Preserve a inspeção anterior e inicie uma nova.');
  const target = await readLiteraryIntegrationChapter(tx, c, value.chapterId);
  if (digest(target) !== digest(value.chapter))
    fail('O capítulo observado mudou. Inicie uma nova inspeção.');
}
/** Server-only: callers authorize the chapter and bind this native certificate to their own job. */
export async function readLiteraryPassageInspection(
  tx,
  c,
  inspectionId,
  chapterId,
  { entered = false } = {},
) {
  const { row, value } = await read(tx, c, inspectionId);
  const completedEntry =
    entered &&
    value.state === 'canceled' &&
    Number.isSafeInteger(value.completedAt) &&
    value.completedAt > 0;
  if (
    (value.state !== 'ready' && !completedEntry) ||
    value.chapterId !== chapterId ||
    value.count < 1 ||
    value.count !== value.verifiedCount ||
    value.inventoryHash !== value.verifiedHash
  )
    fail('Conclua a conferência integral da ordem do livro antes de avançar.');
  if (!entered) await current(tx, c, value);
  else {
    const target = await readLiteraryIntegrationChapter(tx, c, chapterId);
    if (
      target.identityToken !== value.chapter.identityToken ||
      target.order !== value.chapter.order ||
      target.actId !== value.chapter.actId ||
      target.actOrder !== value.chapter.actOrder ||
      digest(await actBirth(tx, c, target)) !== digest(value.chapterActBirth)
    )
      fail('A posição ou a origem da unidade admitida mudou.');
    for (const prior of [value.previous, value.previousActTail]) {
      if (!prior) continue;
      if ((await readLiteraryIntegrationChapter(tx, c, prior.id)).token !== prior.token)
        fail('A versão da predecessora observada mudou.');
    }
  }
  if (value.publication) {
    const actual = await captureLiteraryPublicationPassage(
      tx,
      c,
      value.publicationId,
      value.previous.id,
      { entered },
    );
    if (digest(actual) !== digest(value.publication.anchor))
      fail('A edição confirmada da inspeção mudou.');
    if (
      value.publication.count < 1 ||
      value.publication.censusCount !== value.count ||
      value.publication.censusHash !== value.inventoryHash
    )
      fail('A cobertura publicada da predecessora está incompleta.');
  }
  return {
    version: 1,
    inspectionId: row.id,
    birth: literaryNativeBirth(row),
    chapter: value.chapter,
    chapterActBirth: value.chapterActBirth,
    previous: value.previous,
    previousActTail: value.previousActTail,
    firstInAct: value.firstInAct,
    count: value.count,
    inventoryHash: value.inventoryHash,
    sourceFence: value.sourceFence,
    ...(value.publication ? { publication: value.publication } : {}),
  };
}
export function createLiteraryPassageInspectionService({ db, now = Date.now }) {
  return {
    async getLiteraryPassageInspectionScope(uid, data) {
      const c = scope(db, uid, data, ['chapterId']),
        chapterId = workId(data.chapterId);
      return db.runTransaction((tx) => captureScope(tx, c, chapterId));
    },
    async startLiteraryPassageInspection(uid, data) {
      const c = scope(db, uid, data, [
          'inspectionId',
          'chapterId',
          'publicationId',
          'expectedScopeToken',
        ]),
        id = validateId(data.inspectionId),
        chapterId = workId(data.chapterId),
        publicationId = data.publicationId == null ? null : validateId(data.publicationId),
        expectedScopeToken = scopeToken(data.expectedScopeToken),
        fingerprint = startFingerprint(c, chapterId, publicationId, expectedScopeToken);
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const row = await tx.get(ref(c, id)),
          previous = row.data(),
          book = await readWorkMetadata(tx, c.ref, []);
        if (previous) {
          if (
            previous.actorId !== uid ||
            previous.chapterId !== chapterId ||
            previous.startFingerprint !== fingerprint ||
            (previous.publicationId ?? null) !== publicationId ||
            digest(previous.bookBirth) !== digest(literaryNativeBirth(book))
          )
            fail('Este identificador já pertence a outra inspeção.');
          if (previous.state === 'canceled')
            fail('A inspeção foi encerrada; use um novo identificador.');
          return summary(c, row, previous);
        }
        if ((await captureScope(tx, c, chapterId)).scopeToken !== expectedScopeToken)
          fail(
            'O livro ou capítulo observado foi recriado. Obtenha uma nova origem antes de iniciar.',
          );
        const chapter = await readLiteraryIntegrationChapter(tx, c, chapterId),
          fence = await readLiteraryIntegrationFence(tx, c),
          clock = await prepareLiteraryDependencyWrite(tx, c);
        const chapterActBirth = await actBirth(tx, c, chapter);
        const policy = await readLiteraryPublicationPolicy(tx, c);
        const publicationMode = policy.policy?.unit === 'act' ? 'act' : 'chapter';
        const value = {
          chapterActBirth,
          publicationId,
          publicationMode,
          publicationCount: 0,
          publicationCensusCount: 0,
          publicationCensusHash: seed,
          publicationHash: seed,
          publicationEdition: null,
          publicationAnchor: null,
          expectedScopeToken,
          startFingerprint: fingerprint,
          version: 2,
          actorId: uid,
          chapterId,
          bookBirth: literaryNativeBirth(book),
          chapter,
          sourceFence: fence.token,
          state: 'scanning',
          revision: 0,
          cursor: null,
          count: 0,
          verifiedCount: 0,
          targetCount: 0,
          verifiedTargetCount: 0,
          inventoryHash: seed,
          verifiedHash: seed,
          previous: null,
          previousActTail: null,
          firstInAct: true,
          createdAt: workDate(now, 0),
        };
        tx.create(ref(c, id), value);
        clock.commit();
        // Creation ACK has no fabricated native birth. get obtains the committed origin.
        return { inspectionId: id, state: 'scanning', revision: 0 };
      });
    },
    async getLiteraryPassageInspection(uid, data) {
      const c = scope(db, uid, data, ['inspectionId']);
      return db.runTransaction(async (tx) => {
        const { row, value } = await read(tx, c, data.inspectionId);
        if (value.state !== 'canceled') {
          try {
            await current(tx, c, value);
          } catch (cause) {
            if (!['failed-precondition', 'not-found', 'permission-denied'].includes(cause.code))
              throw cause;
            return { ...summary(c, row, value), state: 'stale' };
          }
        }
        return summary(c, row, value);
      });
    },
    async advanceLiteraryPassageInspection(uid, data) {
      const c = scope(db, uid, data, ['inspectionId', 'expectedOriginToken', 'expectedRevision']),
        revision = workRevision(data.expectedRevision);
      return db.runTransaction(async (tx) => {
        const { row, value } = await read(tx, c, data.inspectionId);
        if (origin(c, row, value) !== data.expectedOriginToken || value.revision !== revision)
          fail('Confira o checkpoint atual da inspeção.');
        if (value.state === 'canceled') fail('A inspeção foi encerrada.');
        await current(tx, c, value);
        if (value.state === 'ready') return summary(c, row, value);
        if (value.state === 'publication') {
          let query = db
            .collection(c.path + '/chapters')
            .orderBy('__name__')
            .limit(5)
            .select();
          if (value.cursor !== null) query = query.startAfter(workId(value.cursor));
          const page = await tx.get(query),
            next = {
              ...value,
              revision: workRevision(value.revision + 1),
              cursor: page.docs.length === 5 ? page.docs.at(-1).id : null,
            };
          const selected = publicationScope(value);
          if (!selected || !value.publicationId)
            fail('A origem da conferência de publicação está incompleta.');
          for (const row of page.docs) {
            const chapter = await readLiteraryIntegrationChapter(tx, c, row.id);
            next.publicationCensusCount = workRevision(next.publicationCensusCount + 1);
            next.publicationCensusHash = digest({ previous: next.publicationCensusHash, chapter });
            if (
              selected.kind === 'act' ? chapter.actId !== selected.id : chapter.id !== selected.id
            )
              continue;
            const proof = await captureLiteraryPublicationPassage(
                tx,
                c,
                value.publicationId,
                chapter.id,
              ),
              edition = editionIdentity(proof);
            if (next.publicationEdition && digest(next.publicationEdition) !== digest(edition))
              fail('A edição mudou durante a conferência do ato.');
            next.publicationEdition = edition;
            next.publicationCount = workRevision(next.publicationCount + 1);
            next.publicationHash = digest({ previous: next.publicationHash, proof });
            if (chapter.id === value.previous.id) next.publicationAnchor = proof;
          }
          if (next.cursor === null) {
            if (
              !next.publicationCount ||
              !next.publicationAnchor ||
              next.publicationCensusCount !== value.count ||
              next.publicationCensusHash !== value.inventoryHash
            )
              fail('A edição não comprova o escopo integral da predecessora atual.');
            next.state = 'ready';
            next.completedAt = workDate(now, value.createdAt);
            next.publication = {
              mode: value.publicationMode,
              scope: selected,
              count: next.publicationCount,
              hash: next.publicationHash,
              censusCount: next.publicationCensusCount,
              censusHash: next.publicationCensusHash,
              edition: next.publicationEdition,
              anchor: next.publicationAnchor,
            };
          }
          const clock = await prepareLiteraryDependencyWrite(tx, c);
          tx.set(row.ref, next);
          clock.commit();
          return summary(c, row, next);
        }
        if (!['scanning', 'verifying'].includes(value.state)) fail('Estado de inspeção inválido.');
        const page = await listLiteraryIntegrationChapters(tx, c, {
            level: 'book',
            afterId: value.cursor,
          }),
          next = { ...value, revision: workRevision(value.revision + 1), cursor: page.nextAfterId };
        for (const item of page.items) {
          if (value.state === 'scanning') {
            next.count = workRevision(next.count + 1);
            next.inventoryHash = digest({ previous: next.inventoryHash, chapter: item });
            if (item.id === value.chapterId) next.targetCount++;
            if (before(item, value.chapter)) {
              if (!next.previous || before(next.previous, item)) next.previous = item;
              if (item.actId === value.chapter.actId) next.firstInAct = false;
              else if (!next.previousActTail || before(next.previousActTail, item))
                next.previousActTail = item;
            }
          } else {
            next.verifiedCount = workRevision(next.verifiedCount + 1);
            next.verifiedHash = digest({ previous: next.verifiedHash, chapter: item });
            if (item.id === value.chapterId) next.verifiedTargetCount++;
          }
        }
        if (page.nextAfterId === null) {
          if (value.state === 'scanning') {
            if (next.targetCount !== 1)
              fail('A inspeção não encontrou exatamente a origem do capítulo.');
            next.state = 'verifying';
          } else {
            if (
              next.count !== next.verifiedCount ||
              next.inventoryHash !== next.verifiedHash ||
              next.verifiedTargetCount !== 1
            )
              fail('O inventário mudou durante a reconferência; inicie uma nova inspeção.');
            next.state = value.publicationId && publicationScope(next) ? 'publication' : 'ready';
            if (next.state === 'ready') next.completedAt = workDate(now, value.createdAt);
          }
        }
        const clock = await prepareLiteraryDependencyWrite(tx, c);
        tx.set(row.ref, next);
        clock.commit();
        return summary(c, row, next);
      });
    },
    async cancelLiteraryPassageInspection(uid, data) {
      if (Object.hasOwn(data ?? {}, 'expectedScopeToken')) {
        const c = scope(db, uid, data, [
            'inspectionId',
            'chapterId',
            'publicationId',
            'expectedScopeToken',
          ]),
          id = validateId(data.inspectionId),
          chapterId = workId(data.chapterId),
          publicationId = data.publicationId == null ? null : validateId(data.publicationId),
          expectedScopeToken = scopeToken(data.expectedScopeToken),
          fingerprint = startFingerprint(c, chapterId, publicationId, expectedScopeToken);
        return db.runTransaction(async (tx) => {
          await workProject(tx, c);
          const row = await tx.get(ref(c, id)),
            value = row.data(),
            book = await readWorkMetadata(tx, c.ref, []);
          if (value) {
            if (
              value.actorId !== uid ||
              value.chapterId !== chapterId ||
              value.startFingerprint !== fingerprint ||
              digest(value.bookBirth) !== digest(literaryNativeBirth(book))
            )
              fail('O encerramento pertence a outro início de inspeção.');
            if (value.state === 'canceled') return summary(c, row, value);
            const clock = await prepareLiteraryDependencyWrite(tx, c),
              next = { ...value, state: 'canceled', revision: workRevision(value.revision + 1) };
            tx.set(row.ref, next);
            clock.commit();
            return summary(c, row, next);
          }
          // A permanent negative reservation wins against a start still in flight.
          // It grants no body, checkpoint or entry certificate and needs no chapter read.
          const clock = await prepareLiteraryDependencyWrite(tx, c);
          tx.create(ref(c, id), {
            version: 2,
            actorId: uid,
            chapterId,
            publicationId,
            expectedScopeToken,
            startFingerprint: fingerprint,
            bookBirth: literaryNativeBirth(book),
            chapter: { id: chapterId, actId: null },
            state: 'canceled',
            revision: 0,
            count: 0,
            verifiedCount: 0,
            inventoryHash: seed,
            verifiedHash: seed,
            createdAt: workDate(now, 0),
          });
          clock.commit();
          return { inspectionId: id, state: 'canceled', chapterId, expectedScopeToken };
        });
      }
      const c = scope(db, uid, data, ['inspectionId', 'expectedOriginToken', 'expectedRevision']);
      return db.runTransaction(async (tx) => {
        const { row, value } = await read(tx, c, data.inspectionId);
        if (
          origin(c, row, value) !== data.expectedOriginToken ||
          value.revision !== workRevision(data.expectedRevision)
        )
          fail('Confira o checkpoint da inspeção antes de encerrá-la.');
        if (value.state === 'canceled') return summary(c, row, value);
        // Closing never depends on the old structure still being current.
        const clock = await prepareLiteraryDependencyWrite(tx, c),
          next = { ...value, state: 'canceled', revision: workRevision(value.revision + 1) };
        tx.set(row.ref, next);
        clock.commit();
        return summary(c, row, next);
      });
    },
  };
}
