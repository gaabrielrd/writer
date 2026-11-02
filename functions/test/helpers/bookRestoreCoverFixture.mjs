import { createHash } from 'node:crypto';
import {
  draftRestoreFixture,
  readyRestoreDraft,
  finishRestoreDraft,
} from './bookRestoreDraftFixture.mjs';
import { record } from './bookContentFixture.mjs';
import { legacyMutation as mutation } from './bookLegacyRestoreFixture.mjs';
export const coverPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a31AAAAAASUVORK5CYII=',
  'base64',
);
export function coverRestoreFixture({
  kind = 'library',
  bytes = coverPng,
  name = '\ufeff  Capa 🌙  ',
} = {}) {
  const records = draftRestoreFixture({ none: true }),
    imageId = 'cover-image-source-0001',
    metadata = records.findIndex((r) => r.kind === 'book-metadata'),
    value = JSON.parse(new TextDecoder().decode(records[metadata].payload)),
    cover =
      kind === 'library'
        ? {
            kind,
            imageId,
            name,
            createdAt: 3,
            updatedAt: 7,
            contentType: 'image/png',
            byteLength: bytes.length,
            chunkCount: Math.ceil(bytes.length / 65536),
            contentHash: createHash('sha256').update(bytes).digest('hex'),
          }
        : { kind };
  value.cover = kind === 'library' ? { kind, imageId } : { kind };
  if (kind === 'library') value.book.coverImageId = imageId;
  else delete value.book.coverImageId;
  records[metadata] = record('book-metadata', 'book', value);
  const at = records.findIndex((r) => r.kind === 'book-cover');
  records.splice(
    at,
    records.length - at,
    record('book-cover', 'book', { schemaVersion: 1, cover }),
    ...(kind === 'library'
      ? Array.from({ length: cover.chunkCount }, (_, part) => ({
          kind: 'book-cover-bytes',
          id: imageId,
          part,
          payload: bytes.subarray(part * 65536, (part + 1) * 65536),
        }))
      : []),
  );
  return records;
}
export async function readyRestoreCover(factory, uid, id, records = coverRestoreFixture()) {
  const draft = await finishRestoreDraft(
    factory,
    uid,
    id,
    await readyRestoreDraft(factory, uid, id, records),
  );
  return (
    await factory().finalizeBookRestoreDraft(uid, mutation(id, draft, id + '-finalize-draft'))
  ).progress;
}
export async function finishRestoreCover(factory, uid, id, progress, prefix = id + '-cover-') {
  let unit = 0;
  while (progress.preparation.phase !== 'cover-finalize') {
    if (unit > 1000) throw new Error('Cover did not finish');
    progress = (
      await factory().advanceBookRestoreCover(uid, mutation(id, progress, prefix + unit++))
    ).progress;
  }
  return progress;
}
