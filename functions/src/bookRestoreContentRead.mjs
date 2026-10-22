import { digest } from './sceneContracts.mjs';
import { createBookRestoreRemapper, BOOK_RESTORE_RELATION_ITEMS } from './bookRestoreRemap.mjs';
import { inconsistent, integer } from './bookRestoreUploadContracts.mjs';
import {
  createVerifiedBookRestoreSource,
  assertRestoreObservation,
  nativeRestoreToken,
} from './bookRestoreIntegrityRead.mjs';
import { createBookRestoreValidationStore } from './bookRestoreValidationStore.mjs';
import { readBookRestoreValidationState } from './bookRestoreValidation.mjs';
import {
  completeBookValidation,
  bookRestoreValidationHash as hash,
} from './bookRestoreValidationStep.mjs';
import { completeBookLegacyValidation } from './bookRestoreLegacyValidation.mjs';
import { readBookLegacyNormalizedItem } from './bookLegacyNormalize.mjs';
import { BOOK_CONTENT_ITEM_BYTES } from './bookContentMachine.mjs';
import { readBookBackupFrame } from './bookBackupContainer.mjs';
import { decodeBookContentJSON, validateBookContentRawPart } from './bookBackupContent.mjs';

function finalReport(state, loaded, index) {
  if (
    state.phase !== 'done' ||
    state.items !== loaded.job.validationMeta.items ||
    state.recheck !== loaded.job.checkedChunks
  )
    inconsistent();
  const pending = { ...state, phase: 'recheck' },
    report = state.legacy
      ? completeBookLegacyValidation(pending, loaded.job.source.sha256, index)
      : completeBookValidation(pending, loaded.job.source.sha256, index),
    summary = {
      sourceBookId: report.sourceBookId,
      totals: report.totals,
      warnings: report.warnings,
      ...(report.source ? { source: report.source, legacyWarnings: report.legacyWarnings } : {}),
    };
  if (
    digest(report) !== loaded.job.validationMeta.reportHash ||
    digest(summary) !== digest(loaded.job.validationSummary)
  )
    inconsistent();
  return report;
}

/** Internal only. Consumers must await verify(tx) before staging writes in that transaction. */
export async function createVerifiedBookRestoreContent({ db, uid, id, token, load }) {
  const stateRef = db.doc('users/' + uid + '/bookRestores/' + id + '/validationState/current');
  const initial = await db.runTransaction(async (tx) => {
    const loaded = await load(tx, uid, id, token);
    if (loaded.job.state !== 'content-verified') inconsistent();
    const snapshot = await tx.get(stateRef),
      state = await readBookRestoreValidationState(tx, snapshot, loaded, db);
    finalReport(state, loaded, createBookRestoreValidationStore(db, loaded, null).index);
    const birthRef = db.doc(
        'users/' + uid + '/bookRestoreOperations/' + loaded.job.validationBirthOperationId,
      ),
      birth = await tx.get(birthRef);
    return {
      loaded,
      state,
      snapshotToken: nativeRestoreToken(snapshot),
      birthRef,
      birthToken: nativeRestoreToken(birth),
    };
  });
  const jobToken = nativeRestoreToken(initial.loaded.snapshot);
  async function pinned(tx, actor = uid, restoreId = id, restoreToken = token) {
    const current = await load(tx, actor, restoreId, restoreToken);
    if (
      current.job.state !== 'content-verified' ||
      nativeRestoreToken(current.snapshot) !== jobToken
    )
      inconsistent();
    const [snapshot, birth] = await Promise.all([tx.get(stateRef), tx.get(initial.birthRef)]);
    if (
      !snapshot.exists ||
      nativeRestoreToken(snapshot) !== initial.snapshotToken ||
      !birth.exists ||
      nativeRestoreToken(birth) !== initial.birthToken
    )
      inconsistent();
    return current;
  }
  function observationSet() {
    const values = new Map();
    return {
      observe(items) {
        for (const item of items) {
          const old = values.get(item.proof.index);
          if (old && digest(old) !== digest(item)) inconsistent();
          values.set(item.proof.index, item);
        }
      },
      async verify(tx, loaded) {
        for (const item of values.values()) await assertRestoreObservation(tx, db, loaded, item);
      },
    };
  }
  async function bytesSource(observed) {
    return createVerifiedBookRestoreSource({
      db,
      uid,
      id,
      token,
      load: pinned,
      allowedStates: ['content-verified'],
      onRead: observed.observe,
    });
  }
  const mapper = createBookRestoreRemapper({
    schemaVersion: 1,
    jobToken: initial.loaded.view.jobToken,
    sourceBookId: initial.loaded.job.validationSummary.sourceBookId,
    bookId: initial.loaded.job.bookId,
  });
  const api = {
    itemCount: initial.state.items,
    bookId: initial.loaded.job.bookId,
    sourceBookId: initial.loaded.job.validationSummary.sourceBookId,
    async readMappedItem(index) {
      const item = await api.readItem(index),
        mapped = mapper.mapJSON(item.record, item.value);
      let rawIdentity = null;
      if (item.raw) {
        const source =
          item.record.kind === 'work-version'
            ? { kind: 'work-version-text', id: item.value.id }
            : item.record.kind === 'book-draft'
              ? { kind: 'book-draft-text', id: item.value.chapter.id }
              : { kind: 'book-cover-bytes', id: item.value.cover.imageId };
        rawIdentity = mapper.rawIdentity({ ...source, part: 0 });
      }
      const loreRelations =
        mapped.relations === null
          ? null
          : Object.freeze({
              count: mapped.relations.length,
              async read(offset, limit = BOOK_RESTORE_RELATION_ITEMS) {
                integer(offset);
                integer(limit, 1);
                if (offset > mapped.relations.length || limit > BOOK_RESTORE_RELATION_ITEMS)
                  inconsistent();
                const store = createBookRestoreValidationStore(db, initial.loaded, null),
                  end = Math.min(offset + limit, mapped.relations.length),
                  values = [];
                for (let at = offset; at < end; at++)
                  values.push(
                    await mapper.mapLoreRelation(
                      mapped.relations[at],
                      async (original) =>
                        (await store.index.get(['node', 'lore', '', original])) !== undefined,
                    ),
                  );
                async function verify(tx) {
                  await item.verify(tx);
                  await store.verify(tx);
                }
                await db.runTransaction(verify);
                return { offset, values, done: end === mapped.relations.length, verify };
              },
            });
      return {
        record: mapped.record,
        value: mapped.value,
        raw: item.raw,
        rawIdentity,
        loreRelations,
        verify: item.verify,
      };
    },
    async readItem(index) {
      integer(index);
      if (index >= initial.state.items) inconsistent();
      const store = createBookRestoreValidationStore(db, initial.loaded, null),
        pointer = await store.getItem(index),
        observed = observationSet(),
        source = await bytesSource(observed);
      async function verify(tx) {
        const current = await pinned(tx);
        await store.verify(tx);
        await observed.verify(tx, current);
      }
      let value;
      if (initial.state.legacy) {
        if (!pointer.legacy || pointer.spans || pointer.raw) inconsistent();
        const item = await readBookLegacyNormalizedItem(
          source,
          initial.state.legacy.catalog,
          pointer.legacy.cursor,
          { record: pointer.record, valueHash: pointer.valueHash },
          { index: store.index, hash },
        );
        if (
          item.bytes.length !== pointer.byteLength ||
          digest(item.origin) !== digest(pointer.legacy.origin)
        )
          inconsistent();
        value = item.value;
      } else {
        if (
          pointer.legacy ||
          !Array.isArray(pointer.spans) ||
          pointer.spans.length < 1 ||
          pointer.spans.length > 128 ||
          !Number.isSafeInteger(pointer.byteLength) ||
          pointer.byteLength < 1 ||
          pointer.byteLength > BOOK_CONTENT_ITEM_BYTES
        )
          inconsistent();
        const bytes = new Uint8Array(pointer.byteLength);
        let position = 0;
        for (let part = 0; part < pointer.spans.length; part++) {
          const span = pointer.spans[part];
          if (
            !Number.isSafeInteger(span.offset) ||
            span.offset < 0 ||
            !Number.isSafeInteger(span.length) ||
            span.length < 1 ||
            span.length > 65536 ||
            (part < pointer.spans.length - 1 && span.length !== 65536) ||
            position + span.length > bytes.length
          )
            inconsistent();
          bytes.set(await source.read(span.offset, span.length), position);
          position += span.length;
        }
        if (position !== bytes.length) inconsistent();
        value = decodeBookContentJSON(bytes);
      }
      // Never return bytes prepared against an already-stale pointer/control.
      await db.runTransaction(verify);
      const raw = pointer.raw
        ? () =>
            readRaw(pointer.raw, async () => {
              const observations = observationSet();
              return {
                source: await bytesSource(observations),
                async verify(tx) {
                  const current = await pinned(tx);
                  await store.verify(tx);
                  await observed.verify(tx, current);
                  await observations.verify(tx, current);
                },
              };
            })
        : null;
      return { record: structuredClone(pointer.record), value, raw, verify };
    },
  };
  return Object.freeze(api);
}

async function* readRaw(raw, open) {
  const manifest = raw.manifest,
    hasher = hash.create();
  let cursor = structuredClone(raw.cursor),
    byteLength = 0;
  try {
    for (let part = 0; part < manifest.chunkCount; part++) {
      const unit = await open(),
        step = await readBookBackupFrame(unit.source, cursor),
        bytes = validateBookContentRawPart(manifest, step.record, part);
      cursor = step.cursor;
      byteLength += bytes.length;
      if (byteLength > manifest.byteLength) inconsistent();
      hasher.update(bytes);
      const done = part === manifest.chunkCount - 1;
      if (done && (byteLength !== manifest.byteLength || hasher.digest() !== manifest.contentHash))
        inconsistent();
      // A raw unit has its own bounded proof set; no accumulation across the stream.
      yield { part, bytes, done, verify: unit.verify };
    }
  } finally {
    hasher.destroy();
  }
}
