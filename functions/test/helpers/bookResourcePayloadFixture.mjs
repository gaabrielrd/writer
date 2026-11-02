import { resourcePayloadChunkPath as payloadChunk } from '../../src/bookResourcePayloadPaths.mjs';
import { prepareBookResourcePayload } from '../../src/bookResourcePayload.mjs';
export const payloadInput = (
  value = {
    name: 'Literal',
    aliases: [],
    category: 'other',
    details: '\ufeffText 🌙',
    relations: [],
  },
) => ({
  uid: 'author',
  bookId: 'book',
  resource: { kind: 'lore', parentId: null, id: 'entity' },
  operationId: 'resource-payload-op01',
  timestamp: 1000,
  value,
});
/** Raw contract harness only. No product writer or restore authorization is implied. */
export async function seedResourcePayload(db, input = payloadInput()) {
  const prepared = prepareBookResourcePayload(input),
    path = 'books/' + input.bookId + '/bookResourceBodies/' + prepared.manifest.bodyId;
  for (let from = 0; from < prepared.manifest.chunkCount; from += 32)
    await db.runTransaction(async (tx) => {
      for (let index = from; index < Math.min(from + 32, prepared.manifest.chunkCount); index++)
        tx.create(
          db.doc(payloadChunk(input.bookId, prepared.manifest.bodyId, index)),
          prepared.part(index),
        );
    });
  await db.runTransaction(async (tx) => {
    tx.create(db.doc(path), prepared.header);
  });
  const snapshot = await db.runTransaction(async (tx) => tx.get(db.doc(path))),
    expectedBirth = {
      seconds: snapshot.createTime.seconds,
      nanoseconds: snapshot.createTime.nanoseconds,
    },
    opening = {
      uid: input.uid,
      bookId: input.bookId,
      resource: input.resource,
      manifest: prepared.manifest,
      expectedBirth,
    };
  return { path, prepared, opening };
}
