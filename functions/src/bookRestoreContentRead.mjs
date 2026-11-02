import { digest } from './sceneContracts.mjs';
import { validateBookRestoreRawPosition } from './bookRestoreHistoryContracts.mjs';
import { createBookRestoreRemapper, BOOK_RESTORE_RELATION_ITEMS } from './bookRestoreRemap.mjs';
import { inconsistent, integer, chunkId } from './bookRestoreUploadContracts.mjs';
import { BOOK_PORTABLE_LORE_FIELDS } from './bookPortableLoreIndex.mjs';
import { readMappedBookRestoreLoreField } from './bookRestoreLoreProjection.mjs';
import { readMappedBookRestoreLorePage } from './bookRestoreLorePages.mjs';
import {
  bookRestoreIndexedLore,
  readBookRestoreLoreRange,
  freezeBookRestoreLoreMetadata,
} from './bookRestoreLoreRead.mjs';
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

/** Compatibility API only: full-item reads retain their existing bounded allocation. */
async function readIndexedLoreBytes(source, pointer) {
  const lore = pointer.lore;
  if (
    pointer.record.kind !== 'book-lore' ||
    pointer.legacy ||
    pointer.spans ||
    pointer.raw !== null ||
    !Number.isSafeInteger(pointer.byteLength) ||
    pointer.byteLength < 1 ||
    pointer.byteLength > BOOK_CONTENT_ITEM_BYTES ||
    !lore ||
    lore.schemaVersion !== 1 ||
    lore.chunkCount !== Math.ceil(pointer.byteLength / 65536) ||
    !/^[a-f0-9]{64}$/.test(lore.contentHash) ||
    lore.metadata?.byteLength !== pointer.byteLength
  )
    inconsistent();
  validateBookRestoreRawPosition(lore.cursor);
  const bytes = new Uint8Array(pointer.byteLength),
    hasher = hash.create();
  let cursor = structuredClone(lore.cursor),
    position = 0;
  try {
    for (let part = 0; part < lore.chunkCount; part++) {
      const step = await readBookBackupFrame(source, cursor),
        record = step.record;
      if (
        !record ||
        record.kind !== pointer.record.kind ||
        record.id !== pointer.record.id ||
        record.part !== part ||
        record.payload.length !== Math.min(65536, bytes.length - position)
      )
        inconsistent();
      bytes.set(record.payload, position);
      position += record.payload.length;
      hasher.update(record.payload);
      cursor = step.cursor;
    }
    if (position !== bytes.length || hasher.digest() !== lore.contentHash) inconsistent();
    return bytes;
  } finally {
    hasher.destroy();
  }
}
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
    async openIndexedLore(index) {
      integer(index);
      if (index >= initial.state.items) inconsistent();
      const store = createBookRestoreValidationStore(db, initial.loaded, null),
        pointer = await store.getItem(index);
      async function verifyMetadata(tx) {
        await pinned(tx);
        await store.verify(tx);
      }
      await db.runTransaction(verifyMetadata);
      if (pointer.record?.kind !== 'book-lore' || !Object.hasOwn(pointer, 'lore')) return null;
      if (initial.state.legacy) inconsistent();
      const descriptor = bookRestoreIndexedLore(pointer),
        observedPointer = store.reads.get(
          initial.loaded.ref.path + '/validationItems/' + chunkId(index),
        );
      if (!observedPointer?.token) inconsistent();
      const sourceToken = digest({
        domain: 'writer-indexed-lore-restore-source',
        uid,
        restoreId: id,
        jobToken: initial.loaded.view.jobToken,
        sourceSha256: initial.loaded.job.source.sha256,
        index,
        pointer: observedPointer.token,
        validation: initial.snapshotToken,
        birth: initial.birthToken,
        contentHash: descriptor.contentHash,
      });
      async function readRange(offset, length) {
        integer(offset);
        integer(length);
        if (
          length > 65536 ||
          !Number.isSafeInteger(offset + length) ||
          offset + length > descriptor.byteLength
        )
          inconsistent();
        const observed = observationSet(),
          source = await bytesSource(observed),
          bytes = await readBookRestoreLoreRange(source, descriptor, offset, length);
        async function verify(tx) {
          const current = await pinned(tx);
          await store.verify(tx);
          await observed.verify(tx, current);
        }
        await db.runTransaction(verify);
        return {
          offset,
          nextOffset: offset + bytes.length,
          done: offset + bytes.length === descriptor.byteLength,
          bytes,
          verify,
        };
      }
      async function readField(field, { offset = 0, limit = 65536 } = {}) {
        if (!BOOK_PORTABLE_LORE_FIELDS.includes(field)) inconsistent();
        integer(offset);
        integer(limit, 1);
        if (limit > 65536) inconsistent();
        const span = descriptor.metadata.index.ranges[field];
        if (!span) {
          if (offset !== 0) inconsistent();
          await db.runTransaction(verifyMetadata);
          return { field, present: false, verify: verifyMetadata };
        }
        if (offset > span.byteLength) inconsistent();
        const unit = await readRange(
          descriptor.metadata.dataOffset + span.offset + offset,
          Math.min(limit, span.byteLength - offset),
        );
        return {
          ...unit,
          field,
          present: true,
          offset,
          nextOffset: offset + unit.bytes.length,
          done: offset + unit.bytes.length === span.byteLength,
        };
      }
      return Object.freeze({
        schemaVersion: 1,
        sourceToken,
        record: freezeBookRestoreLoreMetadata(descriptor.record),
        metadata: freezeBookRestoreLoreMetadata(descriptor.metadata),
        contentHash: descriptor.contentHash,
        verify: verifyMetadata,
        readRange,
        readField,
      });
    },
    async openMappedIndexedLore(index) {
      const lore = await api.openIndexedLore(index);
      if (lore === null) return null;
      const id = mapper.identity('lore', lore.metadata.id),
        sourceToken = digest({
          domain: 'writer-book-restore-lore-projection',
          sourceToken: lore.sourceToken,
          bookId: api.bookId,
          id,
        });
      async function project(read) {
        const store = createBookRestoreValidationStore(db, initial.loaded, null),
          unit = await read(async (targetEntityId) => {
            const value = await mapper.mapLoreRelation(
              { targetEntityId, relationType: '' },
              async (original) =>
                (await store.index.get(['node', 'lore', '', original])) !== undefined,
            );
            return value.targetEntityId;
          });
        async function verify(tx) {
          await unit.verify(tx);
          await store.verify(tx);
        }
        await db.runTransaction(verify);
        return { ...unit, verify };
      }
      return Object.freeze({
        schemaVersion: 1,
        sourceToken,
        sourceId: lore.metadata.id,
        id,
        record: Object.freeze({ kind: 'book-lore', id: digest(['lore', null, id]), part: 0 }),
        sourceMetadata: lore.metadata,
        verify: lore.verify,
        async readField(field, { cursor = null, limit = 65536 } = {}) {
          return project((mapTarget) =>
            readMappedBookRestoreLoreField({
              lore,
              contextToken: sourceToken,
              field,
              cursor,
              limit,
              mapTarget,
            }),
          );
        },
        async readRelationPage(page, { cursor = null, source = null, limit = 65536 } = {}) {
          return project((mapTarget) =>
            readMappedBookRestoreLorePage({
              lore,
              sourceToken,
              page,
              cursor,
              source,
              limit,
              mapTarget,
            }),
          );
        },
      });
    },
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
        readRawPart: item.readRawPart,
        rawIdentity,
        loreRelations,
        lorePayloadRequired:
          item.record.kind === 'book-lore' &&
          Buffer.byteLength(JSON.stringify(item.value)) +
            (mapped.relations?.length ?? 0) * 72 +
            1024 >
            512 * 1024,
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
      } else if (pointer.lore) {
        value = decodeBookContentJSON(await readIndexedLoreBytes(source, pointer));
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
      async function rawSource() {
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
      }
      const raw = pointer.raw ? () => readRaw(pointer.raw, rawSource) : null;
      const readRawPart = pointer.raw
        ? async ({ part, cursor = null }) => {
            integer(part);
            if (part >= pointer.raw.manifest.chunkCount || (part === 0) !== (cursor === null))
              inconsistent();
            if (cursor !== null) validateBookRestoreRawPosition(cursor);
            const unit = await rawSource(),
              step = await readBookBackupFrame(
                unit.source,
                part === 0 ? pointer.raw.cursor : cursor,
              ),
              bytes = validateBookContentRawPart(pointer.raw.manifest, step.record, part);
            return {
              part,
              bytes,
              cursor: step.cursor,
              done: part === pointer.raw.manifest.chunkCount - 1,
              verify: unit.verify,
            };
          }
        : null;
      return { record: structuredClone(pointer.record), value, raw, readRawPart, verify };
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
