import { digest } from '../../src/sceneContracts.mjs';
import { seedResourcePayload } from './bookResourcePayloadFixture.mjs';
import { lorePayloadSegmentId } from '../../src/bookRestoreLorePayloadContracts.mjs';
const birth = (s) => ({ seconds: s.createTime.seconds, nanoseconds: s.createTime.nanoseconds });
export const loreReadData = () => ({
  name: 'Exact 🌙',
  aliases: ['', 'same', 'same'],
  category: 'character',
  summary: 'private summary',
  details: '\ufeff' + 'literal 🌙 '.repeat(80000),
  structuredDetails: { notes: 'literal' },
  createdAt: 1000,
  updatedAt: 1000,
  relations: Array.from({ length: 130 }, (_, index) => ({
    targetEntityId: index % 2 ? 'universe:gone:external' : 'target',
    relationType: 'knows',
    description: 'entry ' + index,
  })),
});
/** Physical post-preparation read harness. Creates native parts/headers; never an activation. */
export async function seedBookLoreRead(
  db,
  {
    uid = 'author',
    bookId = 'book',
    id = 'entity',
    data = loreReadData(),
    root = true,
    inline = false,
    olderLore = false,
    storageTransform = (s) => s,
    segmentTransform = (s) => s,
  } = {},
) {
  const bookPath = 'books/' + bookId,
    path = bookPath + '/lore/' + id;
  if (root)
    await db.runTransaction(async (tx) => {
      const ref = db.doc(bookPath),
        old = await tx.get(ref);
      if (!old.exists) tx.create(ref, { authorId: uid, deleting: false, localLoreVersion: 0 });
    });
  if (inline) {
    await db.runTransaction(async (tx) => {
      tx.create(db.doc(path), { bookId, ...data });
    });
    return { uid, bookId, id, path, bookPath, data };
  }
  if (olderLore)
    await db.runTransaction(async (tx) => {
      tx.create(db.doc(path), { bookId, name: 'old prefix', category: 'other' });
    });
  const { relations, ...fields } = data,
    baseValue = { ...fields, bookId, createdAt: 1000, updatedAt: 1000 },
    base = await seedResourcePayload(db, {
      uid,
      bookId,
      resource: { kind: 'lore', parentId: null, id },
      operationId: 'read-base-operation-' + id,
      timestamp: 1000,
      value: baseValue,
    }),
    generationId = digest(['book-lore-read-harness', bookId, id]),
    segments = [];
  let sealBirth = base.opening.expectedBirth;
  for (let offset = 0; offset < (relations?.length ?? 0); offset += 64) {
    const values = relations.slice(offset, offset + 64),
      payload = await seedResourcePayload(db, {
        uid,
        bookId,
        resource: { kind: 'lore', parentId: null, id },
        operationId: 'read-page-operation-' + id + '-' + offset,
        timestamp: 1000,
        value: values,
      }),
      segmentPath = bookPath + '/bookLoreSegments/' + lorePayloadSegmentId(generationId, offset),
      value = segmentTransform({
        schemaVersion: 1,
        ownerId: uid,
        bookId,
        loreId: id,
        generationId,
        offset,
        count: values.length,
        payload: {
          manifest: payload.prepared.manifest,
          expectedBirth: payload.opening.expectedBirth,
        },
      });
    await db.runTransaction(async (tx) => {
      tx.create(db.doc(segmentPath), value);
    });
    const snapshot = await db.runTransaction(async (tx) => tx.get(db.doc(segmentPath)));
    sealBirth = birth(snapshot);
    segments.push({ path: segmentPath, payload });
  }
  const storage = storageTransform({
    schemaVersion: 1,
    generationId,
    base: { manifest: base.prepared.manifest, expectedBirth: base.opening.expectedBirth },
    relations: {
      present: Object.hasOwn(data, 'relations'),
      count: relations?.length ?? 0,
      pages: segments.length,
    },
    sealBirth,
  });
  await db.runTransaction(async (tx) => {
    tx[olderLore ? 'set' : 'create'](db.doc(path), {
      bookId,
      createdAt: 1000,
      updatedAt: 1000,
      payloadStorage: storage,
    });
  });
  return { uid, bookId, id, path, bookPath, data, base, segments, storage };
}
/** Test consumer, not a product hydrator. Assembles exact bytes from the public service contract. */
export async function readLoreSection(api, uid, view, section = 'base', page = 0) {
  const input = { bookId: view.bookId, id: view.id, readToken: view.readToken, section, page },
    first = await api.readBookLorePart(uid, { ...input, index: 0 }),
    parts = [Buffer.from(first.chunkBase64, 'base64')];
  for (let index = 1; index < first.manifest.chunkCount; index++) {
    const next = await api.readBookLorePart(uid, { ...input, index });
    if (JSON.stringify(next.manifest) !== JSON.stringify(first.manifest))
      throw new Error('Mixed manifest');
    parts.push(Buffer.from(next.chunkBase64, 'base64'));
  }
  const bytes = Buffer.concat(parts);
  if (digest(bytes.toString('utf8')) !== first.manifest.contentHash) throw new Error('Invalid SHA');
  return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
}
