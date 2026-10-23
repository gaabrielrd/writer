import { digest, workFail } from './workProgressContracts.mjs';
import { GenerationError } from './generation.mjs';
import { born, bornEqual, closed } from './bookRestoreUploadContracts.mjs';
import { projectBookBackupResource } from './bookBackupResources.mjs';
import { validateBookBackupJSONItem } from './bookBackupSchema.mjs';
import {
  lorePayloadStorage,
  lorePayloadPointer,
  lorePayloadSegmentId,
} from './bookRestoreLorePayloadContracts.mjs';
import {
  openBookResourcePayload,
  readBookResourcePayloadPart,
} from './bookResourcePayloadRead.mjs';
import { loreChanged, loreReadInteger, loreTransportManifest } from './bookLoreReadContracts.mjs';
const transactions = new WeakMap();
const before = (snapshot, birth) => {
  const current = born(snapshot);
  return (
    current.seconds < birth.seconds ||
    (current.seconds === birth.seconds && current.nanoseconds <= birth.nanoseconds)
  );
};
const scoped = (c, id) => ({
  uid: c.uid,
  bookId: c.bookId,
  resource: { kind: 'lore', parentId: null, id },
});
function inline(c, id, value) {
  try {
    const data = projectBookBackupResource('lore', value);
    validateBookBackupJSONItem(
      'book-lore',
      { schemaVersion: 1, kind: 'lore', parentId: null, id, data },
      c.bookId,
    );
    const json = JSON.stringify(data),
      bytes = Buffer.from(json, 'utf8');
    return {
      data,
      bytes,
      manifest: {
        schemaVersion: 1,
        contentHash: digest(json),
        byteLength: bytes.length,
        chunkCount: Math.ceil(bytes.length / 65536),
      },
    };
  } catch {
    loreChanged();
  }
}
/** Internal opening only. The caller must authorize the book in this transaction first. */
export async function openBookLoreRecord(tx, c, snapshot) {
  try {
    const value = snapshot.data(),
      id = snapshot.id;
    if (
      !snapshot.exists ||
      snapshot.ref?.path !== c.path + '/lore/' + id ||
      !value ||
      (Object.hasOwn(value, 'deleting') && value.deleting !== false) ||
      (Object.hasOwn(value, 'rebalancing') && value.rebalancing !== false) ||
      (value.bookId !== undefined && value.bookId !== c.bookId) ||
      (value.ownerId !== undefined && value.ownerId !== c.uid) ||
      Object.hasOwn(value, 'universeId') ||
      Object.hasOwn(value, 'adventureId')
    )
      loreChanged();
    let opened;
    if (!Object.hasOwn(value, 'payloadStorage')) {
      const encoded = inline(c, id, value);
      opened = { c, id, snapshot, value, mode: 'inline', ...encoded, relations: null };
    } else {
      closed(value, ['bookId', 'createdAt', 'updatedAt', 'payloadStorage'], ['deleting']);
      const storage = lorePayloadStorage(value.payloadStorage);
      for (const key of ['createdAt', 'updatedAt']) {
        if (
          !Number.isSafeInteger(value[key]) ||
          value[key] < 0 ||
          !Number.isFinite(new Date(value[key]).getTime())
        )
          loreChanged();
      }
      const base = await openBookResourcePayload(tx, c.db, { ...scoped(c, id), ...storage.base });
      if (!before(base.header, storage.sealBirth)) loreChanged();
      opened = {
        c,
        id,
        snapshot,
        value,
        storage,
        mode: 'payload',
        base,
        manifest: loreTransportManifest(base.manifest),
        relations: storage.relations,
      };
    }
    transactions.set(opened, tx);
    return opened;
  } catch (error) {
    if (error instanceof GenerationError) loreChanged();
    throw error;
  }
}
export async function readBookLoreRecordPart(tx, opened, section, page, index) {
  if (transactions.get(opened) !== tx) loreChanged();
  loreReadInteger(index);
  loreReadInteger(page);
  if (!['base', 'relations'].includes(section))
    workFail('invalid-argument', 'Seção de lore inválida.');
  if (section === 'base') {
    if (page !== 0 || index >= opened.manifest.chunkCount)
      workFail('invalid-argument', 'Parte fora da ficha.');
    try {
      const bytes =
        opened.mode === 'inline'
          ? opened.bytes.subarray(index * 65536, (index + 1) * 65536)
          : await readBookResourcePayloadPart(tx, opened.c.db, opened.base, index);
      return { manifest: opened.manifest, offset: null, count: null, bytes };
    } catch (error) {
      if (error instanceof GenerationError) loreChanged();
      throw error;
    }
  }
  if (opened.mode !== 'payload' || page >= opened.storage.relations.pages)
    workFail('invalid-argument', 'Página de relações inválida.');
  const { c, id, storage } = opened,
    offset = page * 64,
    count = Math.min(64, storage.relations.count - offset);
  try {
    const snapshot = await tx.get(
        c.db.doc(
          c.path + '/bookLoreSegments/' + lorePayloadSegmentId(storage.generationId, offset),
        ),
      ),
      value = snapshot.data();
    if (
      !snapshot.exists ||
      !bornEqual(snapshot, { createTime: snapshot.updateTime }) ||
      !before(snapshot, storage.sealBirth)
    )
      loreChanged();
    closed(value, [
      'schemaVersion',
      'ownerId',
      'bookId',
      'loreId',
      'generationId',
      'offset',
      'count',
      'payload',
    ]);
    if (
      value.schemaVersion !== 1 ||
      value.ownerId !== c.uid ||
      value.bookId !== c.bookId ||
      value.loreId !== id ||
      value.generationId !== storage.generationId ||
      value.offset !== offset ||
      value.count !== count
    )
      loreChanged();
    const pointer = lorePayloadPointer(value.payload),
      body = await openBookResourcePayload(tx, c.db, { ...scoped(c, id), ...pointer });
    if (!before(body.header, born(snapshot))) loreChanged();
    if (index >= body.manifest.chunkCount)
      workFail(
        'invalid-argument',
        'Parte fora da página de relações.',
        'book-lore-part-out-of-range',
      );
    const bytes = await readBookResourcePayloadPart(tx, c.db, body, index);
    return { manifest: loreTransportManifest(body.manifest), offset, count, bytes };
  } catch (error) {
    if (error instanceof GenerationError && error.details?.reason !== 'book-lore-part-out-of-range')
      loreChanged();
    throw error;
  }
}
