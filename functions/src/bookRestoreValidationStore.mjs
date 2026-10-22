import { digest } from './sceneContracts.mjs';
import { BookBackupFormatError } from './bookBackupContainer.mjs';
import {
  inconsistent,
  chunkId,
  bornEqual,
  restoreId,
  integer,
} from './bookRestoreUploadContracts.mjs';
import { nativeRestoreToken } from './bookRestoreIntegrityRead.mjs';
const utf8 = new TextEncoder();
const duplicate = () => {
  throw new BookBackupFormatError('invalid-record', 'Identidade repetida no backup.');
};
export function validationContext(value, loaded) {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.ownerId !== loaded.job.ownerId ||
    value.restoreId !== loaded.job.restoreId ||
    value.jobToken !== loaded.view.jobToken
  )
    inconsistent();
}
export function createBookRestoreValidationStore(db, loaded, operationId) {
  const reads = new Map(),
    writes = new Map();
  let itemIndex = null;
  const context = {
    schemaVersion: 1,
    ownerId: loaded.job.ownerId,
    restoreId: loaded.job.restoreId,
    jobToken: loaded.view.jobToken,
  };
  async function observe(ref) {
    if (reads.has(ref.path)) return reads.get(ref.path).data;
    const snapshot = await ref.get(),
      data = snapshot.data();
    reads.set(ref.path, {
      ref,
      exists: snapshot.exists,
      token: snapshot.exists ? nativeRestoreToken(snapshot) : null,
      hash: snapshot.exists ? digest(data) : null,
      data,
      snapshot,
    });
    return data;
  }
  async function immutable(ref, value) {
    if (!value) return;
    restoreId(value.createdByOperationId);
    const receiptRef = db.doc(
      'users/' + loaded.job.ownerId + '/bookRestoreOperations/' + value.createdByOperationId,
    );
    const operation = await observe(receiptRef),
      entry = reads.get(ref.path),
      receipt = reads.get(receiptRef.path);
    if (
      !operation ||
      operation.ownerId !== loaded.job.ownerId ||
      operation.restoreId !== loaded.job.restoreId ||
      operation.jobToken !== loaded.view.jobToken ||
      operation.receipt?.action !== 'advanceBookRestoreValidation' ||
      !bornEqual(entry.snapshot, receipt.snapshot) ||
      !bornEqual(entry.snapshot, { createTime: entry.snapshot.updateTime })
    )
      inconsistent();
  }
  function buffer(ref, data) {
    if (writes.has(ref.path)) duplicate();
    if (writes.size >= 96) inconsistent();
    writes.set(ref.path, { ref, data });
  }
  function address(key) {
    if (
      !Array.isArray(key) ||
      key.length < 1 ||
      key.length > 8 ||
      key.some((v) => typeof v !== 'string') ||
      utf8.encode(JSON.stringify(key)).length > 8192
    )
      inconsistent();
    return db.doc(loaded.ref.path + '/validationIndex/' + digest(key));
  }
  function entry(value, key) {
    validationContext(value, loaded);
    if (
      JSON.stringify(value.key) !== JSON.stringify(key) ||
      !value.value ||
      typeof value.value !== 'object' ||
      Array.isArray(value.value)
    )
      inconsistent();
    return structuredClone(value.value);
  }
  const index = {
    async add(key, value) {
      if (utf8.encode(JSON.stringify({ key, value })).length > 16384) inconsistent();
      const ref = address(key);
      if (writes.has(ref.path)) duplicate();
      const old = await observe(ref);
      if (old) {
        await immutable(ref, old);
        entry(old, key);
        duplicate();
      }
      buffer(ref, {
        ...context,
        key: structuredClone(key),
        value: structuredClone(value),
        sourceItemIndex: itemIndex,
        createdByOperationId: operationId,
      });
    },
    async get(key) {
      const ref = address(key),
        pending = writes.get(ref.path);
      if (pending) return entry(pending.data, key);
      const value = await observe(ref);
      await immutable(ref, value);
      return value ? entry(value, key) : undefined;
    },
  };
  return {
    index,
    reads,
    writes,
    setItemIndex(value) {
      itemIndex = value;
    },
    async getItem(index) {
      integer(index);
      const ref = db.doc(loaded.ref.path + '/validationItems/' + chunkId(index)),
        value = await observe(ref);
      if (!value || value.index !== index) inconsistent();
      validationContext(value, loaded);
      await immutable(ref, value);
      return structuredClone(value);
    },
    async addItem(index, value) {
      const ref = db.doc(loaded.ref.path + '/validationItems/' + chunkId(index));
      if (await observe(ref)) inconsistent();
      buffer(ref, {
        ...context,
        index,
        createdByOperationId: operationId,
        ...structuredClone(value),
      });
    },
    async verify(tx) {
      for (const observed of reads.values()) {
        const now = await tx.get(observed.ref);
        if (
          now.exists !== observed.exists ||
          (now.exists &&
            (nativeRestoreToken(now) !== observed.token || digest(now.data()) !== observed.hash))
        )
          inconsistent();
      }
    },
    commit(tx) {
      for (const write of writes.values()) tx.create(write.ref, write.data);
    },
  };
}
