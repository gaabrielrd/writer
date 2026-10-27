import {
  ADVENTURE_RESTORE_DOMAIN,
  chunkId,
  digest,
  closed,
  inconsistent,
  nativeToken,
} from './adventureRestoreContracts.mjs';
import { contentInvalid, contentCount } from './adventureContentPrimitives.mjs';
import { restoreContext } from './adventureRestoreChunks.mjs';
import { assertAdventureValidationPin } from './adventureRestoreValidationState.mjs';
function keyId(key) {
  if (
    !Array.isArray(key) ||
    !key.length ||
    key.length > 8 ||
    key.some((k) => typeof k !== 'string' || !k.isWellFormed()) ||
    Buffer.byteLength(JSON.stringify(key)) > 8192
  )
    inconsistent();
  return digest([ADVENTURE_RESTORE_DOMAIN, 'validation-index', key]);
}
export { keyId as adventureValidationIndexId };
function boundedJSON(value) {
  const text = JSON.stringify(value);
  if (typeof text !== 'string' || Buffer.byteLength(text) > 16384) inconsistent();
  return text;
}
export async function readAdventureValidationIndex(store, tx, loaded, snap, key) {
  const v = await store.artifact(tx, loaded, 'validationIndex', snap);
  closed(v, [
    'schemaVersion',
    'ownerId',
    'restoreId',
    'jobToken',
    'createdByOperationId',
    'key',
    'valueJSON',
    'sourceItemIndex',
  ]);
  if (
    snap.id !== keyId(v.key) ||
    digest(v.key) !== digest(key) ||
    typeof v.valueJSON !== 'string' ||
    Buffer.byteLength(JSON.stringify({ key: v.key, valueJSON: v.valueJSON })) > 16384 ||
    (v.sourceItemIndex !== null &&
      (!contentCount(v.sourceItemIndex) || v.sourceItemIndex >= loaded.job.validation.items))
  )
    inconsistent();
  let value;
  try {
    value = JSON.parse(v.valueJSON);
  } catch {
    inconsistent();
  }
  if (JSON.stringify(value) !== v.valueJSON) inconsistent();
  return value;
}
/** Nothing reaches Firestore until all observations and the checkpoint pass the final transaction. */
export function createAdventureValidationIndex(store, initial, request, state) {
  const reads = new Map(),
    writes = new Map();
  let indexEntries = 0,
    items = 0;
  async function observe(collection, id, key) {
    const path = collection + '/' + id;
    if (reads.has(path)) return reads.get(path);
    if (reads.size >= 384) inconsistent();
    const value = await store.db.runTransaction(async (tx) => {
      const loaded = await store.load(tx, initial.uid, initial.id, initial.view.jobToken);
      assertAdventureValidationPin(loaded, initial);
      const snap = await tx.get(store.db.doc(loaded.ref.path + '/' + path));
      return {
        ref: snap.ref,
        exists: snap.exists,
        token: snap.exists ? nativeToken(snap) : null,
        hash: snap.exists ? digest(snap.data()) : null,
        value:
          snap.exists && collection === 'validationIndex'
            ? await readAdventureValidationIndex(store, tx, loaded, snap, key)
            : undefined,
        key,
        collection,
      };
    });
    reads.set(path, value);
    return value;
  }
  function write(collection, id, value) {
    if (writes.size >= 96) inconsistent();
    writes.set(collection + '/' + id, { collection, id, value });
  }
  const index = {
    async get(key) {
      const id = keyId(key),
        buffered = writes.get('validationIndex/' + id);
      if (buffered) return structuredClone(JSON.parse(buffered.value.valueJSON));
      return structuredClone((await observe('validationIndex', id, structuredClone(key))).value);
    },
    async add(key, value) {
      const id = keyId(key),
        savedKey = structuredClone(key),
        valueJSON = boundedJSON(value);
      if (Buffer.byteLength(JSON.stringify({ key: savedKey, valueJSON })) > 16384) inconsistent();
      if (
        writes.has('validationIndex/' + id) ||
        (await observe('validationIndex', id, savedKey)).exists
      )
        contentInvalid();
      write('validationIndex', id, {
        ...restoreContext(initial, request.operationId),
        key: savedKey,
        valueJSON,
        sourceItemIndex: state.phase === 'frames' ? state.items : null,
      });
      indexEntries++;
    },
  };
  return {
    port: {
      index,
      async addItem(at, pointer) {
        if (at !== state.items || items !== 0 || !contentCount(at)) inconsistent();
        const id = chunkId(at);
        if ((await observe('validationItems', id)).exists) inconsistent();
        write('validationItems', id, {
          ...restoreContext(initial, request.operationId),
          index: at,
          pointerJSON: boundedJSON(pointer),
        });
        items++;
      },
    },
    get counts() {
      return { indexEntries, items };
    },
    async verify(tx, loaded) {
      assertAdventureValidationPin(loaded, initial);
      for (const o of reads.values()) {
        const snap = await tx.get(o.ref);
        if (snap.exists !== o.exists) inconsistent();
        if (snap.exists) {
          if (nativeToken(snap) !== o.token || digest(snap.data()) !== o.hash) inconsistent();
          if (o.collection !== 'validationIndex') inconsistent();
          await readAdventureValidationIndex(store, tx, loaded, snap, o.key);
        }
      }
    },
    effects: () => [...writes.values()].map((w) => store.effect(w.collection, w.id, w.value)),
    commit(tx) {
      for (const w of writes.values())
        tx.create(store.db.doc(initial.ref.path + '/' + w.collection + '/' + w.id), w.value);
    },
  };
}
