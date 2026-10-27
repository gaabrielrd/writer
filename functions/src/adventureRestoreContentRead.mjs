import {
  authorize,
  restoreId,
  restoreHash,
  integer,
  closed,
  inconsistent,
  digest,
  nativeToken,
  chunkId,
  sha256,
} from './adventureRestoreContracts.mjs';
import { createAdventureRestoreStore } from './adventureRestoreStore.mjs';
import {
  readAdventureValidationState,
  assertAdventureValidationPin,
} from './adventureRestoreValidationState.mjs';
import {
  completeAdventureRestoreValidation,
  readAdventureValidationItem,
} from './adventureRestoreValidationStep.mjs';
import { createAdventureContentHash } from './adventureContentHash.mjs';
import { createAdventureValidationSource } from './adventureRestoreValidationSource.mjs';
import { prepareAdventureRestoreRawStep } from './adventureRestoreRawRead.mjs';
import { createAdventureRestoreRemapper } from './adventureRestoreRemap.mjs';
import {
  adventureValidationIndexId,
  readAdventureValidationIndex,
} from './adventureRestoreValidationIndex.mjs';
import { ADVENTURE_RESOURCE_DEFINITIONS } from './adventureBackupResourceDefinitions.mjs';
import { contentId } from './adventureContentPrimitives.mjs';
const unusedIndex = Object.freeze({
  get() {
    inconsistent();
  },
  add() {
    inconsistent();
  },
});
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function finalReport(state, loaded, hash) {
  const report = completeAdventureRestoreValidation(state, { index: unusedIndex, hash }),
    summary = {
      sourceAdventureId: report.sourceAdventureId,
      totals: report.totals,
      warnings: report.warnings,
    };
  if (
    loaded.job.state !== 'content-verified' ||
    loaded.job.validation?.phase !== 'verified' ||
    loaded.job.validation.recheckedChunks !== loaded.job.checkedChunks ||
    digest(summary) !== digest(loaded.job.validation.summary) ||
    digest({ domain: 'writer-adventure-server-content-v1', source: loaded.job.source, report }) !==
      loaded.job.validation.reportHash
  )
    inconsistent();
  return summary;
}
/** Internal only. Source tokens and remapping are evidence, never credentials to write a project. */
export async function createVerifiedAdventureRestoreContent(input) {
  closed(input, ['db', 'uid', 'restoreId', 'jobToken']);
  const { db, uid } = input,
    id = restoreId(input.restoreId),
    token = restoreHash(input.jobToken);
  authorize(uid);
  const hash = await createAdventureContentHash(),
    store = createAdventureRestoreStore({ db }),
    initial = await db.runTransaction(async (tx) => {
      const loaded = await store.load(tx, uid, id, token);
      if (loaded.job.state !== 'content-verified') inconsistent();
      const saved = await readAdventureValidationState(store, tx, loaded),
        summary = finalReport(saved.state, loaded, hash);
      return { loaded, saved, summary };
    }),
    mapper = createAdventureRestoreRemapper({
      schemaVersion: 1,
      jobToken: token,
      sourceAdventureId: initial.summary.sourceAdventureId,
      adventureId: initial.loaded.job.adventureId,
    });
  async function pinned(tx) {
    const loaded = await store.load(tx, uid, id, token);
    assertAdventureValidationPin(loaded, initial.loaded);
    const saved = await readAdventureValidationState(store, tx, loaded);
    if (nativeToken(saved.snapshot) !== nativeToken(initial.saved.snapshot)) inconsistent();
    return loaded;
  }
  async function item(at) {
    const index = integer(at);
    if (index >= initial.saved.state.items) inconsistent();
    const observation = await db.runTransaction(async (tx) => {
        const loaded = await pinned(tx),
          ref = db.doc(loaded.ref.path + '/validationItems/' + chunkId(index)),
          snap = await tx.get(ref),
          value = await store.artifact(tx, loaded, 'validationItems', snap);
        closed(value, [
          'schemaVersion',
          'ownerId',
          'restoreId',
          'jobToken',
          'createdByOperationId',
          'index',
          'pointerJSON',
        ]);
        if (
          value.index !== index ||
          typeof value.pointerJSON !== 'string' ||
          Buffer.byteLength(value.pointerJSON) > 16384
        )
          inconsistent();
        const creator = await tx.get(store.refs.op(uid, value.createdByOperationId)),
          receipt = store.operation(creator, loaded);
        if (
          receipt.validation?.items !== index + 1 ||
          receipt.checkpoint > loaded.job.validation.snapshot.checkpoint
        )
          inconsistent();
        let pointer;
        try {
          pointer = JSON.parse(value.pointerJSON);
        } catch {
          inconsistent();
        }
        if (JSON.stringify(pointer) !== value.pointerJSON) inconsistent();
        return { ref, pointer, token: nativeToken(snap), hash: digest(value) };
      }),
      source = createAdventureValidationSource(store, initial.loaded),
      unit = await readAdventureValidationItem(source.source, observation.pointer, { hash }),
      sourceToken = digest({
        domain: 'writer-adventure-restore-unit-v1',
        uid,
        id,
        token,
        source: initial.loaded.job.source,
        reportHash: initial.loaded.job.validation.reportHash,
        stateToken: nativeToken(initial.saved.snapshot),
        index,
        itemToken: observation.token,
        pointerHash: observation.hash,
      });
    async function verify(tx) {
      const loaded = await pinned(tx),
        snap = await tx.get(observation.ref);
      if (
        !snap.exists ||
        nativeToken(snap) !== observation.token ||
        digest(await store.artifact(tx, loaded, 'validationItems', snap)) !== observation.hash
      )
        inconsistent();
      await source.verify(tx, loaded);
      return { index, sourceToken, contentHash: observation.pointer.contentHash };
    }
    await db.runTransaction(verify);
    return Object.freeze({
      index,
      sourceToken,
      record: freeze(structuredClone(unit.record)),
      value: freeze(structuredClone(unit.value)),
      raw: freeze(structuredClone(unit.raw)),
      contentHash: observation.pointer.contentHash,
      verify,
    });
  }
  async function findResource(kind, nativeId, parentId = null) {
    if (
      !Object.hasOwn(ADVENTURE_RESOURCE_DEFINITIONS, kind) ||
      !contentId(nativeId) ||
      (ADVENTURE_RESOURCE_DEFINITIONS[kind].parent ? !contentId(parentId) : parentId !== null)
    )
      inconsistent();
    const key = ['resource', kind, parentId ?? '', nativeId];
    const observed = await db.runTransaction(async (tx) => {
      const loaded = await pinned(tx),
        ref = db.doc(loaded.ref.path + '/validationIndex/' + adventureValidationIndexId(key)),
        snapshot = await tx.get(ref),
        value = await readAdventureValidationIndex(store, tx, loaded, snapshot, key),
        entry = snapshot.data(),
        at = entry.sourceItemIndex;
      if (!Number.isSafeInteger(at) || at < 0 || at >= initial.saved.state.items) inconsistent();
      const creator = await tx.get(store.refs.op(uid, entry.createdByOperationId));
      if (store.operation(creator, loaded).validation?.items !== at + 1) inconsistent();
      return { ref, token: nativeToken(snapshot), hash: digest(entry), at, value };
    });
    const unit = await item(observed.at);
    if (
      unit.record.kind !== 'adventure-resource' ||
      unit.value.kind !== kind ||
      unit.value.id !== nativeId ||
      unit.value.parentId !== parentId ||
      observed.value.unitHash !== unit.contentHash ||
      observed.value.present !== unit.value.present
    )
      inconsistent();
    const sourceToken = digest({
      domain: 'writer-adventure-resource-lookup-v1',
      key,
      index: observed.token,
      sourceToken: unit.sourceToken,
    });
    async function verify(tx) {
      const loaded = await pinned(tx),
        snapshot = await tx.get(observed.ref);
      if (
        !snapshot.exists ||
        nativeToken(snapshot) !== observed.token ||
        digest(snapshot.data()) !== observed.hash
      )
        inconsistent();
      await readAdventureValidationIndex(store, tx, loaded, snapshot, key);
      return { ...(await unit.verify(tx)), sourceToken };
    }
    await db.runTransaction(verify);
    return Object.freeze({ ...unit, sourceToken, verify });
  }
  async function raw(index, mapped) {
    const unit = await item(index);
    if (unit.raw === null) return null;
    const projection = mapped ? await mapper.mapJSON(unit.record, unit.value) : null,
      record = projection?.rawRecord ?? unit.raw.record,
      sourceToken = digest({
        domain: mapped ? 'writer-adventure-mapped-raw-v1' : 'writer-adventure-raw-v1',
        sourceToken: unit.sourceToken,
        raw: unit.raw,
        record,
      }),
      descriptor = freeze({ ...structuredClone(unit.raw), sourceToken });
    return Object.freeze({
      sourceToken,
      record: freeze(structuredClone(record)),
      sourceRecord: unit.raw.record,
      manifest: unit.raw.manifest,
      layout: unit.raw.layout,
      value: projection ? freeze(projection.value) : unit.value,
      verify: unit.verify,
      async readStep(saved = null) {
        const checkpoint = saved === null ? null : structuredClone(saved),
          source = createAdventureValidationSource(store, initial.loaded),
          part = await prepareAdventureRestoreRawStep(source.source, descriptor, checkpoint, {
            hash,
          }),
          bytes = Buffer.from(part.bytes),
          bytesHash = sha256(bytes),
          resultCheckpoint = freeze(structuredClone(part.checkpoint));
        async function verify(tx) {
          if (sha256(bytes) !== bytesHash) inconsistent();
          await unit.verify(tx);
          await source.verify(tx, await pinned(tx));
          return { sourceToken, contentHash: bytesHash, complete: part.done };
        }
        await db.runTransaction(verify);
        return Object.freeze({
          sourceToken,
          record: freeze({ ...record, part: part.record.part }),
          sourceRecord: freeze(part.record),
          bytes,
          checkpoint: resultCheckpoint,
          done: part.done,
          validation: part.validation,
          verify,
        });
      },
    });
  }
  return Object.freeze({
    adventureId: initial.loaded.job.adventureId,
    sourceAdventureId: initial.summary.sourceAdventureId,
    itemCount: initial.saved.state.items,
    summary: freeze(structuredClone(initial.summary)),
    readItem: item,
    findResource,
    openRaw: (index) => raw(index, false),
    openMappedRaw: (index) => raw(index, true),
    async readMappedItem(index) {
      const unit = await item(index),
        projection = freeze(await mapper.mapJSON(unit.record, unit.value));
      return Object.freeze({
        ...projection,
        sourceToken: unit.sourceToken,
        sourceRecord: unit.record,
        sourceContentHash: unit.contentHash,
        verify: unit.verify,
      });
    },
  });
}
