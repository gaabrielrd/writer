import {
  prepareRestoredChapterText,
  openBookChapterText,
  chapterTextManifest,
} from './bookChapterText.mjs';
import { digest, workFail } from './workProgressContracts.mjs';

/** One accumulator per transaction attempt, shared by every chapter/version change. */
export function createBookChapterBodyPlan(tx, db, { uid, bookId }) {
  const pins = new Map(),
    created = new Map();
  let committed = false;
  async function pin(chapterId, descriptor, delta) {
    if (!Number.isSafeInteger(delta))
      workFail('failed-precondition', 'Referência de texto inválida.');
    const manifest = chapterTextManifest(descriptor);
    let entry = pins.get(manifest.bodyId);
    if (!entry) {
      const opened = await openBookChapterText(tx, db, {
        uid,
        bookId,
        chapterId,
        chapter: { bookId, ownerId: uid, content: null, contentStorage: manifest },
      });
      entry = { opened, delta: 0 };
      pins.set(manifest.bodyId, entry);
    }
    if (entry.opened.chapterId !== chapterId || digest(entry.opened.manifest) !== digest(manifest))
      workFail('failed-precondition', 'Origem do texto inconsistente.');
    entry.delta += delta;
    const next = entry.opened.body.data().pins + entry.delta;
    if (!Number.isSafeInteger(next) || next < 0)
      workFail('failed-precondition', 'Referências do texto inconsistentes.');
    return manifest;
  }
  async function replace({
    chapterId,
    stored,
    content,
    operationId,
    timestamp,
    preferredManifest,
  }) {
    const previous = stored?.contentStorage ?? null;
    let patch;
    if (preferredManifest != null) {
      const manifest = chapterTextManifest(preferredManifest);
      if (
        digest(content) !== manifest.contentHash ||
        Buffer.byteLength(content) !== manifest.byteLength
      )
        workFail('failed-precondition', 'Texto da versão inconsistente.');
      const same = previous?.bodyId === manifest.bodyId;
      await pin(chapterId, manifest, same ? 0 : 1);
      patch = { content: null, contentStorage: manifest };
    } else if (
      previous &&
      digest(content) === previous.contentHash &&
      Buffer.byteLength(content) === previous.byteLength
    ) {
      patch = { content: null, contentStorage: await pin(chapterId, previous, 0) };
    } else {
      const plan = prepareRestoredChapterText({
        uid,
        bookId,
        chapterId,
        operationId,
        timestamp,
        content,
      });
      if (plan) {
        const ref = db.doc('books/' + bookId + '/bookTextBodies/' + plan.manifest.bodyId);
        if (created.has(ref.path) || (await tx.get(ref)).exists)
          workFail('already-exists', 'Identidade do corpo de texto já utilizada.');
        created.set(ref.path, plan);
        patch = plan.patch;
      } else patch = { content, ...(previous ? { contentStorage: null } : {}) };
    }
    if (previous && previous.bodyId !== patch.contentStorage?.bodyId)
      await pin(chapterId, previous, -1);
    return patch;
  }
  return {
    pin,
    replace,
    commit() {
      if (committed) workFail('failed-precondition', 'Plano de texto já confirmado.');
      for (const { opened, delta } of pins.values())
        if (delta !== 0) {
          const next = opened.body.data().pins + delta;
          tx.update(opened.body.ref, { pins: next, state: next === 0 ? 'unreferenced' : 'ready' });
        }
      for (const plan of created.values())
        for (const write of plan.writes) {
          const [id, index] = write.id.split(':');
          tx.create(
            db.doc('books/' + bookId + '/bookTextBodies/' + id + (index ? '/chunks/' + index : '')),
            write.value,
          );
        }
      committed = true;
    },
  };
}
