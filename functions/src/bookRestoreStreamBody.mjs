import { createSHA256 } from 'hash-wasm';
import { digest } from './sceneContracts.mjs';
import {
  born,
  bornEqual,
  closed,
  chunkId,
  inconsistent,
  integer,
  restoreHash,
  restoreId,
} from './bookRestoreUploadContracts.mjs';
import { fieldTarget } from './bookLoreFieldUploadContracts.mjs';
import {
  resourcePayloadBodyId,
  resourcePayloadLeafHash as leaf,
  resourcePayloadBranchHash as branch,
  verifyBookResourcePayloadPart,
} from './bookResourcePayload.mjs';
import { resourcePayloadScope, resourcePayloadManifest } from './bookResourcePayloadContracts.mjs';
import { openBookResourcePayload } from './bookResourcePayloadRead.mjs';
import {
  readBookRestoreArtifact,
  readBookRestoreArtifactReceipt,
} from './bookRestoreArtifacts.mjs';
const kind = 'restore-lore-stream',
  limit = 65536;
const same = (a, b) => digest(a) === digest(b);
const atMost = (a, b) =>
  a.seconds < b.seconds || (a.seconds === b.seconds && a.nanoseconds <= b.nanoseconds);
function context(loaded, input) {
  closed(input, ['entityId', 'generationOperationId', 'sourceToken', 'target', 'timestamp']);
  if (!/^restore-[a-f0-9]{64}$/.test(input.entityId)) inconsistent();
  restoreId(input.generationOperationId);
  restoreHash(input.sourceToken);
  integer(input.timestamp);
  const target = fieldTarget(input.target),
    p = loaded.job.preparation;
  if (
    loaded.job.state !== 'content-verified' ||
    loaded.job.payloadInventoryVersion !== 1 ||
    loaded.job.cleanupVersion < 6 ||
    p?.phase !== 'resources' ||
    p.timestamp !== input.timestamp ||
    p.lorePayload?.entityId !== input.entityId ||
    p.lorePayload?.generationOperationId !== input.generationOperationId
  )
    inconsistent();
  const c = {
    ...structuredClone(input),
    target,
    ownerId: loaded.job.ownerId,
    bookId: loaded.job.bookId,
    jobToken: loaded.view.jobToken,
  };
  c.streamId = digest({ domain: kind, ...c });
  c.bodyOperationId = digest([kind, input.generationOperationId, target]);
  return c;
}
const scope = (c) =>
  resourcePayloadScope({
    uid: c.ownerId,
    bookId: c.bookId,
    resource: { kind: 'lore', parentId: null, id: c.entityId },
  });
const ids = (c) => ({
  control: digest([kind, c.streamId, 'control']),
  fragments: digest([kind, c.streamId, 'fragments']),
  packed: digest([kind, c.streamId, 'packed']),
  node: (level, index) => digest([kind, c.streamId, 'node', level, index]),
});
const chunk = (bodyId, index) => bodyId + ':' + chunkId(index);
function record(c, type, value) {
  return {
    schemaVersion: 1,
    stageKind: kind + '/' + type,
    ownerId: c.ownerId,
    bookId: c.bookId,
    streamId: c.streamId,
    ...value,
  };
}
function checkedRecord(c, type, value, keys) {
  closed(value, ['schemaVersion', 'stageKind', 'ownerId', 'bookId', 'streamId', ...keys]);
  if (
    value.schemaVersion !== 1 ||
    value.stageKind !== kind + '/' + type ||
    value.ownerId !== c.ownerId ||
    value.bookId !== c.bookId ||
    value.streamId !== c.streamId
  )
    inconsistent();
  return value;
}
async function hashState(encoded = null) {
  const h = await createSHA256();
  if (encoded !== null) {
    if (typeof encoded !== 'string' || encoded.length > 1024) inconsistent();
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.length !== h.save().length || bytes.toString('base64') !== encoded) inconsistent();
    try {
      h.load(bytes);
    } catch {
      inconsistent();
    }
  }
  return h;
}
function checkedProgress(p, c) {
  closed(p, [
    'schemaVersion',
    'contextHash',
    'phase',
    'fragments',
    'byteLength',
    'cursor',
    'summary',
    'pack',
    'tree',
    'manifest',
    'emitIndex',
    'verifyIndex',
    'lastPartOperationId',
    'partSealBirth',
    'pointer',
  ]);
  if (
    p.schemaVersion !== 1 ||
    p.contextHash !== digest(c) ||
    !['stage', 'pack', 'tree', 'emit', 'verify', 'header', 'pointer', 'done'].includes(p.phase) ||
    Buffer.byteLength(JSON.stringify(p)) > 24576
  )
    inconsistent();
  for (const name of ['fragments', 'byteLength', 'emitIndex', 'verifyIndex']) integer(p[name]);
  closed(p.pack, ['fragment', 'offset', 'index', 'byteLength', 'hashState']);
  for (const name of ['fragment', 'offset', 'index', 'byteLength']) integer(p.pack[name]);
  if (
    p.pack.fragment > p.fragments ||
    p.pack.offset > 81920 ||
    p.pack.byteLength > p.byteLength ||
    typeof p.pack.hashState !== 'string' ||
    p.pack.hashState.length > 1024
  )
    inconsistent();
  closed(p.tree, ['level', 'index', 'width']);
  for (const name of ['level', 'index', 'width']) integer(p.tree[name]);
  if (p.tree.level < 1 || p.tree.level > 48) inconsistent();
  if (p.cursor !== null) {
    if (
      p.cursor.contextToken !== c.sourceToken ||
      p.cursor.field !== c.target.field ||
      Buffer.byteLength(JSON.stringify(p.cursor)) > 16384
    )
      inconsistent();
  }
  if (p.summary !== null) {
    closed(p.summary, ['byteLength', 'contentHash'], ['relations']);
    integer(p.summary.byteLength, 1);
    restoreHash(p.summary.contentHash);
    if (
      p.summary.byteLength !== p.byteLength ||
      (c.target.field === 'relations'
        ? p.summary.relations !== c.target.count
        : Object.hasOwn(p.summary, 'relations'))
    )
      inconsistent();
  } else if (p.phase !== 'stage') inconsistent();
  if (p.manifest !== null) {
    resourcePayloadManifest(p.manifest);
    if (
      p.manifest.byteLength !== p.byteLength ||
      p.manifest.contentHash !== p.summary?.contentHash ||
      p.manifest.bodyId !==
        resourcePayloadBodyId(scope(c), {
          operationId: c.bodyOperationId,
          ...p.manifest,
        })
    )
      inconsistent();
  }
  if (['emit', 'verify', 'header', 'pointer', 'done'].includes(p.phase) && !p.manifest)
    inconsistent();
  if (p.manifest && (p.emitIndex > p.manifest.chunkCount || p.verifyIndex > p.emitIndex))
    inconsistent();
  if (p.lastPartOperationId !== null) restoreId(p.lastPartOperationId);
  if (p.partSealBirth !== null) born({ createTime: p.partSealBirth });
  if (p.phase === 'done' && p.pointer === null) inconsistent();
}
async function node(tx, db, loaded, c, level, index) {
  const r = await readBookRestoreArtifact(
      tx,
      db,
      loaded,
      'payload-body',
      ids(c).node(level, index),
    ),
    value = checkedRecord(c, 'node', r.value, ['level', 'index', 'hash']);
  if (
    value.level !== level ||
    value.index !== index ||
    !bornEqual(r.snapshot, { createTime: r.snapshot.updateTime })
  )
    inconsistent();
  restoreHash(value.hash);
  return value.hash;
}
function nodeWrite(c, level, index, hash) {
  return {
    kind: 'payload-body',
    id: ids(c).node(level, index),
    value: record(c, 'node', { level, index, hash }),
  };
}
function manifest(c, p, merkleRoot) {
  p.manifest = resourcePayloadManifest({
    schemaVersion: 1,
    byteLength: p.byteLength,
    chunkCount: Math.ceil(p.byteLength / limit),
    contentHash: p.summary.contentHash,
    merkleRoot,
    bodyId: resourcePayloadBodyId(scope(c), {
      operationId: c.bodyOperationId,
      contentHash: p.summary.contentHash,
      merkleRoot,
    }),
  });
  p.phase = 'emit';
}
/**
 * Internal, root-absent write plan. The host must commit returned writes through
 * prepareBookRestoreArtifacts with the native job/CAS/receipt in the same tx.
 * Staging shares the already-enrolled payload inventory; no staging pointer is readable.
 */
export async function prepareBookRestoreStreamBody(tx, db, loaded, request, input, unit = null) {
  const c = context(loaded, input),
    stableRequest = {
      operationId: restoreId(request.operationId),
      expectedCheckpoint: integer(request.expectedCheckpoint),
    },
    a = ids(c);
  if (unit !== null) {
    if (
      !unit?.present ||
      !(unit.bytes instanceof Uint8Array) ||
      unit.bytes.length > 81920 ||
      typeof unit.verify !== 'function'
    )
      inconsistent();
    unit = {
      field: unit.field,
      present: unit.present,
      done: unit.done,
      bytes: new Uint8Array(unit.bytes),
      cursor: structuredClone(unit.cursor),
      summary: unit.summary === null ? null : structuredClone(unit.summary),
      verify: unit.verify,
    };
  }
  const root = await tx.get(db.doc('books/' + c.bookId));
  if (root.exists) inconsistent();
  if (stableRequest.expectedCheckpoint !== loaded.job.checkpoint) inconsistent();
  const old = await readBookRestoreArtifact(tx, db, loaded, 'payload-body', a.control, {
      optional: true,
    }),
    p = old
      ? structuredClone(checkedRecord(c, 'control', old.value, ['progress']).progress)
      : {
          schemaVersion: 1,
          contextHash: digest(c),
          phase: 'stage',
          fragments: 0,
          byteLength: 0,
          cursor: null,
          summary: null,
          pack: {
            fragment: 0,
            offset: 0,
            index: 0,
            byteLength: 0,
            hashState: Buffer.from((await hashState()).save()).toString('base64'),
          },
          tree: { level: 1, index: 0, width: 0 },
          manifest: null,
          emitIndex: 0,
          verifyIndex: 0,
          lastPartOperationId: null,
          partSealBirth: null,
          pointer: null,
        },
    writes = [];
  checkedProgress(p, c);
  const previous = digest(p);
  if (p.phase === 'stage') {
    if (
      !unit?.present ||
      !(unit.bytes instanceof Uint8Array) ||
      unit.bytes.length > 81920 ||
      typeof unit.done !== 'boolean' ||
      typeof unit.verify !== 'function' ||
      unit.field !== c.target.field ||
      unit.cursor?.contextToken !== c.sourceToken ||
      unit.cursor?.field !== c.target.field ||
      unit.cursor.inputOffset <= (p.cursor?.inputOffset ?? 0) ||
      unit.cursor.outputBytes !== p.byteLength + unit.bytes.length
    )
      inconsistent();
    // Capture the bytes/cursor before async verification; no mutable caller input reaches writes.
    const bytes = Buffer.from(unit.bytes),
      cursor = structuredClone(unit.cursor),
      summary = unit.summary === null ? null : structuredClone(unit.summary),
      done = unit.done;
    await unit.verify(tx);
    writes.push({
      kind: 'payload-chunk',
      id: chunk(a.fragments, p.fragments),
      value: record(c, 'fragment', {
        bodyId: a.fragments,
        index: p.fragments,
        offset: p.byteLength,
        bytes,
      }),
    });
    p.fragments++;
    p.byteLength += bytes.length;
    p.cursor = cursor;
    if (done) {
      p.summary = summary;
      p.phase = 'pack';
      p.tree.width = Math.ceil(p.byteLength / limit);
    } else if (summary !== null) inconsistent();
  } else {
    if (unit !== null) inconsistent();
    if (p.phase === 'pack') {
      if (p.pack.fragment >= p.fragments) inconsistent();
      const f = await readBookRestoreArtifact(
          tx,
          db,
          loaded,
          'payload-chunk',
          chunk(a.fragments, p.pack.fragment),
        ),
        source = checkedRecord(c, 'fragment', f.value, ['bodyId', 'index', 'offset', 'bytes']),
        packed = await readBookRestoreArtifact(
          tx,
          db,
          loaded,
          'payload-chunk',
          chunk(a.packed, p.pack.index),
          { optional: true },
        );
      if (
        source.bodyId !== a.fragments ||
        source.index !== p.pack.fragment ||
        !(source.bytes instanceof Uint8Array) ||
        source.bytes.length > 81920 ||
        source.offset + p.pack.offset !== p.pack.byteLength ||
        p.pack.offset > source.bytes.length ||
        !bornEqual(f.snapshot, { createTime: f.snapshot.updateTime })
      )
        inconsistent();
      let before = Buffer.alloc(0);
      if (packed) {
        const v = checkedRecord(c, 'packed', packed.value, ['bodyId', 'index', 'closed', 'bytes']);
        if (
          v.bodyId !== a.packed ||
          v.index !== p.pack.index ||
          v.closed !== false ||
          !(v.bytes instanceof Uint8Array) ||
          v.bytes.length < 1 ||
          v.bytes.length >= limit
        )
          inconsistent();
        before = Buffer.from(v.bytes);
      }
      if (before.length !== p.pack.byteLength - p.pack.index * limit) inconsistent();
      const take = Math.min(limit - before.length, source.bytes.length - p.pack.offset),
        bytes = Buffer.concat([
          before,
          Buffer.from(source.bytes.subarray(p.pack.offset, p.pack.offset + take)),
        ]),
        h = await hashState(p.pack.hashState);
      h.update(source.bytes.subarray(p.pack.offset, p.pack.offset + take));
      p.pack.hashState = Buffer.from(h.save()).toString('base64');
      p.pack.byteLength += take;
      p.pack.offset += take;
      if (p.pack.offset === source.bytes.length) {
        p.pack.fragment++;
        p.pack.offset = 0;
      }
      const end = p.pack.fragment === p.fragments,
        complete = bytes.length === limit || end;
      if (bytes.length && (take > 0 || complete))
        writes.push({
          kind: 'payload-chunk',
          id: chunk(a.packed, p.pack.index),
          ...(packed ? { replace: true } : {}),
          value: record(c, 'packed', {
            bodyId: a.packed,
            index: p.pack.index,
            closed: complete,
            bytes,
          }),
        });
      if (complete) {
        if (!bytes.length) inconsistent();
        writes.push(nodeWrite(c, 0, p.pack.index, leaf(p.pack.index, bytes)));
        p.pack.index++;
      }
      if (end) {
        if (
          p.pack.byteLength !== p.byteLength ||
          p.pack.index !== p.tree.width ||
          h.digest() !== p.summary.contentHash
        )
          inconsistent();
        p.phase = 'tree';
      }
    } else if (p.phase === 'tree') {
      const t = p.tree;
      if (t.width === 1) manifest(c, p, await node(tx, db, loaded, c, t.level - 1, 0));
      else {
        const left = await node(tx, db, loaded, c, t.level - 1, t.index * 2),
          right =
            t.index * 2 + 1 < t.width
              ? await node(tx, db, loaded, c, t.level - 1, t.index * 2 + 1)
              : left,
          hash = branch(left, right);
        writes.push(nodeWrite(c, t.level, t.index, hash));
        t.index++;
        if (t.index === Math.ceil(t.width / 2)) {
          t.width = Math.ceil(t.width / 2);
          t.index = 0;
          t.level++;
          if (t.width === 1) manifest(c, p, hash);
        }
      }
    } else if (p.phase === 'emit') {
      const i = p.emitIndex,
        m = p.manifest,
        staged = await readBookRestoreArtifact(tx, db, loaded, 'payload-chunk', chunk(a.packed, i)),
        v = checkedRecord(c, 'packed', staged.value, ['bodyId', 'index', 'closed', 'bytes']),
        proof = [];
      if (
        v.bodyId !== a.packed ||
        v.index !== i ||
        v.closed !== true ||
        !(v.bytes instanceof Uint8Array) ||
        leaf(i, v.bytes) !== (await node(tx, db, loaded, c, 0, i))
      )
        inconsistent();
      let width = m.chunkCount,
        position = i,
        level = 0;
      while (width > 1) {
        const sibling = position % 2 === 0 ? Math.min(position + 1, width - 1) : position - 1;
        proof.push(await node(tx, db, loaded, c, level, sibling));
        position = Math.floor(position / 2);
        width = Math.ceil(width / 2);
        level++;
      }
      const bytes = verifyBookResourcePayloadPart(m, { index: i, bytes: v.bytes, proof });
      writes.push({
        kind: 'payload-chunk',
        id: chunk(m.bodyId, i),
        value: {
          schemaVersion: 1,
          ownerId: c.ownerId,
          bookId: c.bookId,
          bodyId: m.bodyId,
          index: i,
          bytes,
          proof,
        },
      });
      p.emitIndex++;
      p.lastPartOperationId = stableRequest.operationId;
      if (p.emitIndex === m.chunkCount) p.phase = 'verify';
    } else if (p.phase === 'verify') {
      const barrier = await readBookRestoreArtifactReceipt(tx, db, loaded, p.lastPartOperationId);
      p.partSealBirth = born(barrier);
      const end = Math.min(p.verifyIndex + 16, p.manifest.chunkCount);
      for (let i = p.verifyIndex; i < end; i++) {
        const part = await readBookRestoreArtifact(
          tx,
          db,
          loaded,
          'payload-chunk',
          chunk(p.manifest.bodyId, i),
          { metadataOnly: true },
        );
        if (
          !bornEqual(part.snapshot, { createTime: part.snapshot.updateTime }) ||
          !atMost(born(part.snapshot), p.partSealBirth)
        )
          inconsistent();
      }
      p.verifyIndex = end;
      if (end === p.manifest.chunkCount) p.phase = 'header';
    } else if (p.phase === 'header') {
      if (p.verifyIndex !== p.manifest.chunkCount || !p.partSealBirth) inconsistent();
      await readBookRestoreArtifactReceipt(tx, db, loaded, p.lastPartOperationId);
      writes.push({
        kind: 'payload-body',
        id: p.manifest.bodyId,
        value: {
          ...p.manifest,
          ownerId: c.ownerId,
          bookId: c.bookId,
          resource: scope(c).resource,
          createdAt: c.timestamp,
        },
      });
      p.phase = 'pointer';
    } else if (p.phase === 'pointer' || p.phase === 'done') {
      const header = await readBookRestoreArtifact(
          tx,
          db,
          loaded,
          'payload-body',
          p.manifest.bodyId,
        ),
        expected = {
          ...p.manifest,
          ownerId: c.ownerId,
          bookId: c.bookId,
          resource: scope(c).resource,
          createdAt: c.timestamp,
        },
        pointer = {
          manifest: p.manifest,
          expectedBirth: born(header.snapshot),
          partSealBirth: p.partSealBirth,
        };
      if (!same(header.value, expected)) inconsistent();
      await openBookResourcePayload(tx, db, { ...scope(c), ...pointer });
      p.pointer = pointer;
      p.phase = 'done';
    }
  }
  checkedProgress(p, c);
  if (previous !== digest(p) || !old)
    writes.push({
      kind: 'payload-body',
      id: a.control,
      ...(old ? { replace: true } : {}),
      value: record(c, 'control', { progress: p }),
    });
  return { writes, progress: p, pointer: p.pointer, controlId: a.control };
}
