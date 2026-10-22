import {
  digest,
  workFail,
  workConflict,
  workClosed,
  workId,
  workDate,
  workScope,
  workProject,
  workOperation,
  readWorkReceipt,
  writeWorkReceipt,
  readWorkMetadata,
} from './workProgressContracts.mjs';

import { readBookChapterText, BOOK_CHAPTER_TEXT_BYTES } from './bookChapterText.mjs';
import { createBookChapterBodyPlan } from './bookChapterStorage.mjs';

const presets = new Set([
  'preset-atmospheric',
  'preset-incisive',
  'preset-intimate',
  'preset-ironic',
  'preset-epic',
  'preset-unsettling',
]);
async function validateComplement(tx, db, uid, value) {
  if (value == null) return value;
  workClosed(value, ['personaId', 'overrides']);
  if (
    typeof value.personaId !== 'string' ||
    !Array.isArray(value.overrides) ||
    value.overrides.length > 16
  )
    workFail('invalid-argument', 'Complemento de persona inválido.');
  if (!presets.has(value.personaId)) {
    if (
      !/^custom-[a-zA-Z0-9-]{1,93}$/.test(value.personaId) ||
      !(await tx.get(db.doc('users/' + uid + '/aiPersonas/' + value.personaId))).exists
    )
      workFail('invalid-argument', 'Persona indisponível.');
  }
  const ids = new Set();
  for (const override of value.overrides) {
    workClosed(override, ['traitId', 'value']);
    if (
      typeof override.traitId !== 'string' ||
      !/^[-a-zA-Z0-9]{1,100}$/.test(override.traitId) ||
      ids.has(override.traitId) ||
      !Number.isInteger(override.value) ||
      override.value < 0 ||
      override.value > 100
    )
      workFail('invalid-argument', 'Atributo de persona inválido.');
    ids.add(override.traitId);
  }
  return value;
}
function contentText(value) {
  if (
    typeof value !== 'string' ||
    !value.isWellFormed() ||
    Buffer.byteLength(value) > BOOK_CHAPTER_TEXT_BYTES
  )
    workFail('invalid-argument', 'Texto inválido ou acima do limite.');
  return value;
}
function chapterTitle(value, order) {
  if (value === undefined) return 'Capítulo ' + order;
  if (typeof value !== 'string' || value.length > 300)
    workFail('invalid-argument', 'Título inválido.');
  return value.trim() || 'Capítulo ' + order;
}
function orderNumber(value) {
  if (!Number.isSafeInteger(value) || value < 1) workFail('invalid-argument', 'Ordem inválida.');
  return value;
}
function snapshotView(bookId, id, record) {
  return {
    id,
    bookId,
    title: record.title,
    order: record.order ?? 0,
    content: record.content ?? '',
    wordCount: record.wordCount ?? 0,
    ...(record.actId ? { actId: record.actId } : {}),
    ...(record.personaComplement ? { personaComplement: record.personaComplement } : {}),
    createdAt: record.createdAt ?? 0,
    updatedAt: record.updatedAt ?? 0,
  };
}
function currentCounter(root, before, after, plan) {
  if (plan.ready) return plan.wordCount;
  const total = Number.isSafeInteger(root.wordCount) && root.wordCount >= 0 ? root.wordCount : 0;
  return Math.max(0, total + after - before);
}
export async function prepareLegacyChapterTextWrite(
  tx,
  {
    db,
    now,
    countWords,
    ledger,
    context,
    root,
    id,
    stored,
    content,
    patch = {},
    operationId,
    bodies,
    preferredManifest,
    verifiedContent,
  },
) {
  contentText(content);
  if (!stored || stored.deleting) workFail('not-found', 'Capítulo indisponível.');
  if (stored.contentMode === 'scenes')
    workFail('failed-precondition', 'Abra a cena para alterar o texto deste capítulo.');
  // Callers may reuse content already verified from this snapshot in this transaction.
  const beforeContent =
      verifiedContent ??
      (await readBookChapterText(tx, db, {
        uid: context.uid,
        bookId: context.target.id,
        chapterId: id,
        chapter: stored,
      })),
    words = countWords(content),
    before = countWords(beforeContent),
    timestamp = workDate(now, Math.max(root.updatedAt ?? 0, stored.updatedAt ?? 0)),
    plan = await ledger.prepareChanges(tx, {
      target: context.target,
      root,
      changes: [{ kind: 'chapter', id, content }],
    });
  const bodyPlan =
      bodies ?? createBookChapterBodyPlan(tx, db, { uid: context.uid, bookId: context.target.id }),
    representation = await bodyPlan.replace({
      chapterId: id,
      stored,
      content,
      operationId,
      timestamp,
      preferredManifest,
    });
  return {
    result: { content, wordCount: words, updatedAt: timestamp },
    commit() {
      tx.update(db.doc(context.path + '/chapters/' + id), {
        ...patch,
        ...representation,
        wordCount: words,
        updatedAt: timestamp,
      });
      tx.update(context.ref, {
        wordCount: currentCounter(root, before, words, plan),
        updatedAt: timestamp,
      });
      plan.commit();
      if (!bodies) bodyPlan.commit();
    },
  };
}
export function addWorkProgressLegacy(api, { db, now, countWords, ledger }) {
  api.createLegacyChapter = async (uid, data) => {
    workClosed(data, ['bookId', 'operationId', 'input']);
    const bookId = workId(data.bookId),
      context = workScope(db, uid, { target: { kind: 'book', id: bookId } }, []);
    workClosed(data.input, ['title', 'content', 'order', 'actId', 'personaComplement']);
    const content = contentText(data.input.content ?? ''),
      actId = data.input.actId ?? null;
    if (actId !== null && workId(actId).length > 128) workFail('invalid-argument', 'Ato inválido.');
    if (data.input.order !== undefined) orderNumber(data.input.order);
    const op = workOperation(db, uid, 'createLegacyChapter', data, {
      bookId,
      input: { ...data.input, content },
    });
    return db.runTransaction(async (tx) => {
      const root = await workProject(tx, context),
        prior = await readWorkReceipt(tx, op),
        ref = db.doc(context.path + '/chapters/' + op.id),
        existing = (await tx.get(ref)).data();
      if (prior) {
        if (!existing || existing.deleting || existing.contentMode === 'scenes') workConflict();
        const content = await readBookChapterText(tx, db, {
          uid,
          bookId,
          chapterId: op.id,
          chapter: existing,
        });
        if (digest(content) !== digest(data.input.content ?? '')) workConflict();
        return snapshotView(bookId, op.id, { ...existing, content });
      }
      if (existing) workFail('already-exists', 'Identificador de capítulo já utilizado.');
      if (actId && !(await tx.get(db.doc(context.path + '/acts/' + actId))).exists)
        workFail('invalid-argument', 'O ato não pertence ao livro.');
      const complement = await validateComplement(tx, db, uid, data.input.personaComplement);
      let order = data.input.order;
      if (order === undefined) {
        let cursor = null,
          last = null;
        while (!last) {
          let query = db
            .collection(context.path + '/chapters')
            .orderBy('order', 'desc')
            .orderBy('__name__', 'desc')
            .limit(50);
          if (typeof query.select === 'function') query = query.select('order', 'actId');
          if (actId !== null) query = query.where('actId', '==', actId);
          if (cursor) query = query.startAfter(cursor.order, cursor.id);
          const page = await tx.get(query);
          const sibling = page.docs.find((item) => (item.data().actId ?? null) === actId);
          if (sibling) {
            last = sibling.data();
            break;
          }
          if (page.docs.length < 50) break;
          const final = page.docs.at(-1);
          cursor = { order: final.data().order, id: final.id };
        }
        order = orderNumber((last?.order ?? 0) + 1);
      }
      const wordCount = countWords(content),
        timestamp = workDate(now, root.updatedAt ?? 0),
        value = {
          id: op.id,
          bookId,
          title: chapterTitle(data.input.title, order),
          order,
          content,
          wordCount,
          createdAt: timestamp,
          updatedAt: timestamp,
          ...(actId ? { actId } : {}),
          ...(complement ? { personaComplement: complement } : {}),
        },
        plan = await ledger.prepareChanges(tx, {
          target: context.target,
          root,
          changes: [{ kind: 'chapter', id: op.id, content, contentMode: 'legacy' }],
          groupStates: [{ id: op.id, contentMode: 'legacy' }],
        });
      const bodies = createBookChapterBodyPlan(tx, db, { uid, bookId }),
        representation = await bodies.replace({
          chapterId: op.id,
          stored: null,
          content,
          operationId: digest({ kind: 'legacy-create', id: op.id }),
          timestamp,
        });
      tx.create(ref, { ...value, ...representation });
      bodies.commit();
      tx.update(context.ref, {
        wordCount: currentCounter(root, 0, wordCount, plan),
        updatedAt: timestamp,
      });
      plan.commit();
      writeWorkReceipt(tx, op, { id: op.id });
      return snapshotView(bookId, op.id, value);
    });
  };
  api.saveLegacyChapter = async (uid, data) => {
    workClosed(data, [
      'bookId',
      'chapterId',
      'operationId',
      'expectedContentHash',
      'content',
      'patch',
    ]);
    const bookId = workId(data.bookId),
      id = workId(data.chapterId),
      context = workScope(db, uid, { target: { kind: 'book', id: bookId } }, []),
      content = contentText(data.content),
      patch = { ...(data.patch ?? {}) };
    workClosed(patch, ['title', 'order', 'personaComplement']);
    if (
      typeof data.expectedContentHash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(data.expectedContentHash)
    )
      workFail('invalid-argument', 'Hash observado inválido.');
    if ('title' in patch) {
      if (typeof patch.title !== 'string' || !patch.title.trim() || patch.title.length > 300)
        workFail('invalid-argument', 'Título inválido.');
      patch.title = patch.title.trim();
    }
    if ('order' in patch) orderNumber(patch.order);
    const op = workOperation(db, uid, 'saveLegacyChapter', data, {
      bookId,
      id,
      expectedContentHash: data.expectedContentHash,
      content,
      patch,
    });
    return db.runTransaction(async (tx) => {
      const root = await workProject(tx, context),
        ref = db.doc(context.path + '/chapters/' + id),
        stored = (await tx.get(ref)).data(),
        previous = await readWorkReceipt(tx, op);
      if (!stored || stored.deleting) workFail('not-found', 'Capítulo indisponível.');
      if (stored.contentMode === 'scenes')
        workFail('failed-precondition', 'Abra a cena para alterar o texto deste capítulo.');
      const currentContent = await readBookChapterText(tx, db, {
        uid,
        bookId,
        chapterId: id,
        chapter: stored,
      });
      if (previous) {
        if (digest(currentContent) !== previous.afterHash) workConflict();
        return {
          content: currentContent,
          wordCount: stored.wordCount,
          updatedAt: stored.updatedAt,
        };
      }
      if (digest(currentContent) !== data.expectedContentHash) workConflict();
      if ('personaComplement' in patch)
        await validateComplement(tx, db, uid, patch.personaComplement);
      const plan = await prepareLegacyChapterTextWrite(tx, {
        db,
        now,
        countWords,
        ledger,
        context,
        root,
        id,
        stored,
        content,
        operationId: digest({ kind: 'legacy-save', id: op.id }),
        verifiedContent: currentContent,
        patch,
      });
      plan.commit();
      writeWorkReceipt(tx, op, { id, afterHash: digest(content) });
      return plan.result;
    });
  };
  api.deleteLegacyChapters = async (uid, data) => {
    workClosed(data, ['bookId', 'operationId', 'chapters']);
    const bookId = workId(data.bookId),
      context = workScope(db, uid, { target: { kind: 'book', id: bookId } }, []);
    if (!Array.isArray(data.chapters) || !data.chapters.length || data.chapters.length > 200)
      workFail('invalid-argument', 'Selecione entre 1 e 200 capítulos.');
    const chapters = data.chapters.map((value) => {
      workClosed(value, ['id', 'expectedUpdatedAt']);
      workId(value.id);
      if (
        !Number.isFinite(value.expectedUpdatedAt) ||
        value.expectedUpdatedAt < 0 ||
        value.expectedUpdatedAt > 8640000000000000
      )
        workFail('invalid-argument', 'Data observada inválida.');
      return value;
    });
    if (new Set(chapters.map((value) => value.id)).size !== chapters.length)
      workFail('invalid-argument', 'Capítulo repetido.');
    const op = workOperation(db, uid, 'deleteLegacyChapters', data, { bookId, chapters });
    return db.runTransaction(async (tx) => {
      const root = await workProject(tx, context),
        previous = await readWorkReceipt(tx, op);
      if (previous) return { deleted: previous.deleted };
      const stored = [],
        bodies = createBookChapterBodyPlan(tx, db, { uid, bookId });
      for (const selection of chapters) {
        const ref = db.doc(context.path + '/chapters/' + selection.id),
          value = (
            await readWorkMetadata(tx, ref, [
              'wordCount',
              'updatedAt',
              'contentMode',
              'deleting',
              'contentStorage',
              'ownerId',
              'bookId',
            ])
          ).data();
        if (
          !value ||
          value.deleting ||
          (value.bookId && value.bookId !== bookId) ||
          (value.ownerId && value.ownerId !== uid) ||
          value.contentMode === 'scenes' ||
          (value.updatedAt ?? 0) !== selection.expectedUpdatedAt
        )
          workConflict();
        if (value.contentStorage != null) await bodies.pin(selection.id, value.contentStorage, -1);
        stored.push({ ref, value, id: selection.id });
      }
      const plan = await ledger.prepareChanges(tx, {
        target: context.target,
        root,
        changes: stored.map((value) => ({ kind: 'chapter', id: value.id, removed: true })),
        disableGroups: stored.map((value) => value.id),
      });
      const before = stored.reduce(
          (sum, value) =>
            sum + (Number.isSafeInteger(value.value.wordCount) ? value.value.wordCount : 0),
          0,
        ),
        timestamp = workDate(now, root.updatedAt ?? 0);
      for (const value of stored) tx.delete(value.ref);
      bodies.commit();
      tx.update(context.ref, {
        wordCount: currentCounter(root, before, 0, plan),
        updatedAt: timestamp,
      });
      plan.commit();
      writeWorkReceipt(tx, op, { deleted: stored.length });
      return { deleted: stored.length };
    });
  };
}
