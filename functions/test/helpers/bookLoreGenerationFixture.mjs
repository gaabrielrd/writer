import { digest } from '../../src/sceneContracts.mjs';
import { born } from '../../src/bookRestoreUploadContracts.mjs';
import { resourcePayloadChunkPath } from '../../src/bookResourcePayloadPaths.mjs';
import { lorePayloadSegmentId } from '../../src/bookRestoreLorePayloadContracts.mjs';
import { seedResourcePayload } from './bookResourcePayloadFixture.mjs';
import { seedBookLoreRead } from './bookLoreReadFixture.mjs';
export async function seedGenerationField(db, c, field, value) {
  const body = await seedResourcePayload(db, {
    uid: c.uid,
    bookId: c.bookId,
    resource: { kind: 'lore', parentId: null, id: c.id },
    operationId: 'generation-field-' + c.id + '-' + field,
    timestamp: 2000,
    value,
  });
  const last = await db.runTransaction((tx) =>
    tx.get(
      db.doc(
        resourcePayloadChunkPath(
          c.bookId,
          body.prepared.manifest.bodyId,
          body.prepared.manifest.chunkCount - 1,
        ),
      ),
    ),
  );
  return {
    ...body,
    pointer: {
      manifest: body.prepared.manifest,
      expectedBirth: body.opening.expectedBirth,
      partSealBirth: born(last),
    },
  };
}
/** Explicit physical reader harness only. Does not implement adoption, CAS, inventory or GC. */
export async function seedBookLoreGeneration(
  db,
  {
    uid = 'author',
    bookId = 'book',
    id = 'entity',
    baseData = {
      name: 'Original',
      category: 'other',
      summary: 'before',
      details: 'untouched',
      aliases: ['same', 'same'],
      isPublic: true,
    },
    fields = { name: 'Renamed', summary: null, isPublic: false },
    noBase = false,
    dates = noBase ? { updatedAt: 2000 } : { createdAt: 1000, updatedAt: 2000 },
    relations,
    transform = (x) => x,
  } = {},
) {
  const base = await seedBookLoreRead(db, { uid, bookId, id, data: baseData, inline: noBase }),
    scope = { uid, bookId, id },
    bodies = {},
    pointers = {};
  let sealBirth = noBase
    ? born(await db.runTransaction((tx) => tx.get(db.doc(base.path))))
    : base.storage.sealBirth;
  const later = (stamp) => {
    if (
      stamp.seconds > sealBirth.seconds ||
      (stamp.seconds === sealBirth.seconds && stamp.nanoseconds > sealBirth.nanoseconds)
    )
      sealBirth = stamp;
  };
  for (const [field, value] of Object.entries(fields)) {
    if (value === null) pointers[field] = null;
    else {
      const body = await seedGenerationField(db, scope, field, value);
      bodies[field] = body;
      pointers[field] = body.pointer;
      later(body.pointer.expectedBirth);
    }
  }
  let relationStorage = noBase
    ? {
        present: false,
        count: 0,
        pages: 0,
        generationId: digest(['empty-relations', id]),
        sealBirth,
      }
    : {
        ...base.storage.relations,
        generationId: base.storage.generationId,
        sealBirth: base.storage.sealBirth,
      };
  const segments = [];
  if (relations !== undefined) {
    const generationId = digest(['new-generation-relations', bookId, id]);
    for (let offset = 0; offset < relations.length; offset += 64) {
      const body = await seedGenerationField(
          db,
          scope,
          'relations-' + offset,
          relations.slice(offset, offset + 64),
        ),
        path = base.bookPath + '/bookLoreSegments/' + lorePayloadSegmentId(generationId, offset);
      await db.runTransaction(async (tx) => {
        tx.create(db.doc(path), {
          schemaVersion: 2,
          ownerId: uid,
          bookId,
          loreId: id,
          generationId,
          offset,
          count: Math.min(64, relations.length - offset),
          payload: body.pointer,
        });
      });
      const stamp = born(await db.runTransaction((tx) => tx.get(db.doc(path))));
      later(stamp);
      segments.push({ path, body });
    }
    relationStorage = {
      present: true,
      count: relations.length,
      pages: Math.ceil(relations.length / 64),
      generationId,
      sealBirth,
    };
  }
  const storage = transform({
    schemaVersion: 2,
    generationId: digest(['generation-v2', bookId, id]),
    base: noBase ? null : base.storage.base,
    fields: pointers,
    dates,
    relations: relationStorage,
    sealBirth,
  });
  await db.runTransaction(async (tx) => {
    tx.set(db.doc(base.path), { bookId, ...dates, payloadStorage: storage });
  });
  return { ...base, storage, bodies, newSegments: segments };
}
export async function readGenerationSection(
  api,
  seed,
  view,
  section = 'field',
  field = 'name',
  page = 0,
) {
  const request = {
      bookId: seed.bookId,
      id: seed.id,
      readToken: view.readToken,
      section,
      page,
      ...(section === 'field' ? { field } : {}),
    },
    parts = [];
  let descriptor;
  for (let index = 0; !descriptor || index < descriptor.chunkCount; index++) {
    const part = await api.readBookLorePart(seed.uid, { ...request, index });
    descriptor ??= part.manifest;
    parts.push(Buffer.from(part.chunkBase64, 'base64'));
  }
  const bytes = Buffer.concat(parts),
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  if (digest(text) !== descriptor.contentHash) throw new Error('Invalid field hash');
  return JSON.parse(text);
}
