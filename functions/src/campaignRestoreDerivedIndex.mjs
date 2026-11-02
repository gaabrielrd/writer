import { seal, open } from './campaignRestoreCrypto.mjs';
import {
  RESTORE_DOMAIN,
  closed,
  integer,
  hash,
  id,
  chunkId,
  digest,
  bad,
  immutable,
  sameBirth,
} from './campaignRestoreContracts.mjs';
import { DERIVED_SECTIONS, DERIVED_ROW_BYTES } from './campaignRestoreDerivedFormat.mjs';
export const DERIVED_ROW_META = [
  'schemaVersion',
  'ownerId',
  'restoreId',
  'campaignId',
  'jobToken',
  'index',
  'section',
  'position',
  'identityHash',
  'imageHash',
  'ledgerHash',
  'loreHash',
  'byteLength',
  'cipherHash',
  'createdByOperationId',
];
const POINT_META = [
  'schemaVersion',
  'ownerId',
  'restoreId',
  'campaignId',
  'jobToken',
  'index',
  'section',
  'position',
  'rowHash',
];
const identity = (section, key) => digest(['derived', section, key]);
const reverseHash = (kind, key) => digest(['derived-reverse', kind, key]);
const aad = (l, n) => [RESTORE_DOMAIN, l.uid, l.rid, l.token, 'derived-row', n];
function witnesses(row) {
  const { section, value: v } = row,
    m = v.meta,
    live = v.unit?.outcome === 'available';
  return {
    imageHash:
      live && section === 'base:item' && m?.kind === 'block' && m.image !== null
        ? reverseHash('image', m.image)
        : null,
    ledgerHash:
      live && section === 'base:loreReferences' ? reverseHash('ledger', m.targetKey) : null,
    loreHash:
      live && section === 'base:links' && m.target.kind === 'lore'
        ? reverseHash('lore', m.target.sourceKey)
        : null,
  };
}
export function createCampaignRestoreDerivedIndex(store) {
  const { db } = store,
    rows = (l) => db.collection(l.ref.path + '/derivedRows'),
    positions = (l) => db.collection(l.ref.path + '/derivedPositions'),
    ref = (l, n) => db.doc(l.ref.path + '/derivedRows/' + chunkId(n)),
    point = (l, section, p) =>
      db.doc(l.ref.path + '/derivedPositions/' + section + '-' + chunkId(p));
  function rowShape(row) {
    closed(row, ['index', 'section', 'key', 'position', 'value'], ['location']);
    if (row.location) {
      const loc = closed(row.location, ['id', 'start']),
        c = closed(loc.start, [
          'schemaVersion',
          'size',
          'offset',
          'records',
          'payloadBytes',
          'previous',
          'done',
        ]);
      if (
        typeof loc.id !== 'string' ||
        !/^[0-9]+$/.test(loc.id) ||
        String(integer(Number(loc.id), 0, 0xffffffff)) !== loc.id ||
        c.schemaVersion !== 1 ||
        c.done !== false
      )
        bad();
      integer(c.size, 16);
      integer(c.offset, 16, c.size);
      integer(c.records, 1, 0xffffffff);
      integer(c.payloadBytes);
      hash(c.previous);
      if (Buffer.byteLength(JSON.stringify(loc)) > 2048) bad();
    }
    integer(row.index, 0, 0xfffffffe);
    integer(row.position, 0, 0xfffffffe);
    if (
      !DERIVED_SECTIONS.includes(row.section) ||
      typeof row.key !== 'string' ||
      row.key.length > 4096
    )
      bad();
    const k = JSON.parse(row.key);
    if (
      !Array.isArray(k) ||
      k.length !== 2 ||
      JSON.stringify(k) !== row.key ||
      (k[0] !== null && !/^[a-f0-9]{64}$/.test(k[0])) ||
      (k[1] !== null && typeof k[1] !== 'string')
    )
      bad();
  }
  function draft(l, key, row, oid) {
    rowShape(row);
    const bytes = Buffer.from(JSON.stringify(row));
    if (bytes.length > DERIVED_ROW_BYTES) bad();
    const payload = seal(key.bytes, bytes, aad(l, row.index)),
      meta = {
        schemaVersion: 1,
        ownerId: l.uid,
        restoreId: l.rid,
        campaignId: l.job.campaignId,
        jobToken: l.token,
        index: row.index,
        section: row.section,
        position: row.position,
        identityHash: identity(row.section, row.key),
        ...witnesses(row),
        byteLength: bytes.length,
        cipherHash: digest(payload),
        createdByOperationId: oid,
      },
      pointer = {
        schemaVersion: 1,
        ownerId: l.uid,
        restoreId: l.rid,
        campaignId: l.job.campaignId,
        jobToken: l.token,
        index: row.index,
        section: row.section,
        position: row.position,
        rowHash: digest(meta),
      };
    return {
      ref: ref(l, row.index),
      pointer: point(l, row.section, row.position),
      value: { ...meta, payload },
      pointerValue: pointer,
      proof: { index: row.index, metadataHash: digest(meta), pointerHash: digest(pointer) },
    };
  }
  async function verify(tx, l, snapshot, full = false) {
    if (!snapshot.exists) bad();
    const v = closed(snapshot.data(), full ? [...DERIVED_ROW_META, 'payload'] : DERIVED_ROW_META);
    if (
      v.schemaVersion !== 1 ||
      v.ownerId !== l.uid ||
      v.restoreId !== l.rid ||
      v.campaignId !== l.job.campaignId ||
      v.jobToken !== l.token ||
      !DERIVED_SECTIONS.includes(v.section) ||
      snapshot.id !== chunkId(v.index) ||
      v.index >= (l.job.derivedIndex?.rows ?? 0) ||
      integer(v.position) >= (l.job.derivedIndex?.sizes[v.section] ?? 0)
    )
      bad();
    integer(v.byteLength, 1, DERIVED_ROW_BYTES);
    hash(v.identityHash);
    hash(v.cipherHash);
    for (const k of ['imageHash', 'ledgerHash', 'loreHash']) if (v[k] !== null) hash(v[k]);
    immutable(snapshot);
    const pointer = await tx.get(point(l, v.section, v.position));
    if (!pointer.exists) bad();
    immutable(pointer);
    const p = closed(pointer.data(), POINT_META),
      op = await store.operation(tx, l, id(v.createdByOperationId)),
      proofs = op?.value.effect?.rows,
      meta = Object.fromEntries(DERIVED_ROW_META.map((k) => [k, v[k]])),
      expected = {
        schemaVersion: 1,
        ownerId: l.uid,
        restoreId: l.rid,
        campaignId: l.job.campaignId,
        jobToken: l.token,
        index: v.index,
        section: v.section,
        position: v.position,
        rowHash: digest(meta),
      };
    if (
      digest(p) !== digest(expected) ||
      !sameBirth(pointer, snapshot) ||
      !op ||
      op.value.action !== 'index-derived' ||
      !sameBirth(snapshot, op.snapshot) ||
      !Array.isArray(proofs) ||
      proofs.length < 1 ||
      proofs.length > 25 ||
      proofs.filter(
        (x) =>
          x.index === v.index && x.metadataHash === digest(meta) && x.pointerHash === digest(p),
      ).length !== 1
    )
      bad();
    if (full && v.cipherHash !== digest(v.payload)) bad();
    return { value: v, pointer };
  }
  function decode(l, key, v, withLocation = false) {
    let row;
    try {
      row = JSON.parse(
        open(key.bytes, v.payload, aad(l, v.index), DERIVED_ROW_BYTES).toString('utf8'),
      );
      rowShape(row);
    } catch {
      bad();
    }
    if (
      row.index !== v.index ||
      row.position !== v.position ||
      row.section !== v.section ||
      identity(row.section, row.key) !== v.identityHash ||
      digest(witnesses(row)) !==
        digest({ imageHash: v.imageHash, ledgerHash: v.ledgerHash, loreHash: v.loreHash }) ||
      Buffer.byteLength(JSON.stringify(row)) !== v.byteLength
    )
      bad();
    if (row.location && row.location.start.size !== l.job.source.byteLength) bad();
    return withLocation
      ? row
      : Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'location'));
  }
  async function get(tx, l, key, n) {
    return decode(l, key, (await verify(tx, l, await tx.get(ref(l, n)), true)).value);
  }
  async function byPosition(tx, l, key, section, p) {
    integer(p, 0, (l.job.derivedIndex?.sizes[section] ?? 0) - 1);
    const s = await tx.get(point(l, section, p));
    if (!s.exists) bad();
    const v = closed(s.data(), POINT_META);
    integer(v.index, 0, l.job.derivedIndex.rows - 1);
    const row = await get(tx, l, key, v.index);
    if (row.section !== section || row.position !== p) bad();
    return row;
  }
  async function lookup(tx, l, key, section, logicalKey) {
    if (
      !DERIVED_SECTIONS.includes(section) ||
      typeof logicalKey !== 'string' ||
      logicalKey.length > 4096
    )
      bad();
    const found = (
      await tx.get(rows(l).where('identityHash', '==', identity(section, logicalKey)).limit(2))
    ).docs;
    if (found.length > 1) bad();
    if (found.length) {
      const row = decode(l, key, (await verify(tx, l, found[0], true)).value);
      if (row.section !== section || row.key !== logicalKey) bad();
      return row;
    }
    if (!['base:item', 'variant'].includes(section)) bad();
    let low = 0,
      high = l.job.derivedIndex.sizes[section] ?? 0;
    while (low < high) {
      const mid = Math.floor((low + high) / 2),
        r = await byPosition(tx, l, key, section, mid);
      if (r.key === logicalKey) bad(); // An empty query cannot hide authenticated membership.
      if (r.key < logicalKey) low = mid + 1;
      else high = mid;
    }
    const size = l.job.derivedIndex.sizes[section] ?? 0,
      before = low ? await byPosition(tx, l, key, section, low - 1) : null,
      after = low < size ? await byPosition(tx, l, key, section, low) : null;
    if (
      (before && (before.key >= logicalKey || before.position + 1 !== low)) ||
      (after && (after.key <= logicalKey || after.position !== low))
    )
      bad();
    return { before, after };
  }
  async function reverse(tx, l, key, kind, target) {
    if (!['image', 'ledger', 'lore'].includes(kind)) bad();
    hash(target);
    const found = (
      await tx.get(
        rows(l)
          .where(kind + 'Hash', '==', reverseHash(kind, target))
          .limit(1),
      )
    ).docs;
    if (found.length !== 1) bad();
    return decode(l, key, (await verify(tx, l, found[0], true)).value);
  }
  async function page(tx, l, key, start, limit) {
    integer(start);
    integer(limit, 1, 25);
    if (start + limit > l.job.derivedIndex.rows) bad();
    const snapshots = await Promise.all(
        Array.from({ length: limit }, (_, n) => tx.get(ref(l, start + n))),
      ),
      verified = await Promise.all(snapshots.map((s) => verify(tx, l, s, true)));
    return verified.map((s) => decode(l, key, s.value));
  }
  async function available(tx, l, drafts) {
    for (const d of drafts)
      if (
        (await tx.get(d.ref)).exists ||
        (await tx.get(d.pointer)).exists ||
        (await tx.get(rows(l).where('identityHash', '==', d.value.identityHash).select().limit(1)))
          .docs.length
      )
        bad();
  }
  async function cleanup(tx, l, request, fp) {
    const snapshots = (
        await tx.get(
          rows(l)
            .orderBy('__name__')
            .select(...DERIVED_ROW_META)
            .limit(request.limit + 1),
        )
      ).docs,
      control = l.job.derivedIndex ?? {
        schemaVersion: 1,
        rows: 0,
        cleanedRows: 0,
        sizes: {},
        sealed: false,
      },
      count = Math.min(snapshots.length, request.limit),
      from = control.cleanedRows;
    if (from + count > control.rows || (!snapshots.length && from !== control.rows)) bad();
    if (!snapshots.length) {
      if ((await tx.get(positions(l).select().limit(1))).docs.length) bad();
      return false;
    }
    const pairs = [];
    for (let n = 0; n < count; n++) {
      if (snapshots[n].id !== chunkId(from + n)) bad();
      pairs.push(await verify(tx, l, snapshots[n]));
    }
    if (from + count === control.rows && snapshots.length !== count) bad();
    store.commit(tx, l, request, 'cleanup', fp, {
      derivedIndex: { ...control, cleanedRows: from + count },
    });
    for (let n = 0; n < count; n++) {
      tx.delete(snapshots[n].ref);
      tx.delete(pairs[n].pointer.ref);
    }
    return true;
  }
  async function locate(tx, l, key, section, k) {
    const row = await lookup(tx, l, key, section, k);
    if (!row) return null;
    const raw = decode(
      l,
      key,
      (await verify(tx, l, await tx.get(ref(l, row.index)), true)).value,
      true,
    );
    return raw.location ?? null;
  }
  return { draft, page, lookup, reverse, available, cleanup, locate };
}
