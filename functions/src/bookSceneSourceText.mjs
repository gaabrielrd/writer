import { digest } from './sceneContracts.mjs';
import { createBookSceneSourceEncoding } from './bookSceneSourceEncoding.mjs';
import { prepareRestoredChapterText, readBookChapterText } from './bookChapterText.mjs';
import { inconsistent, restoreHash } from './bookRestoreUploadContracts.mjs';
function original(source) {
  if (!source?.original || typeof source.original !== 'object' || Array.isArray(source.original))
    inconsistent();
  restoreHash(source.hash);
  return source.original;
}
/** A frozen source is a chapter snapshot with its own pinned immutable generation. */
export function prepareRestoredBookSceneSource({
  uid,
  bookId,
  sourceId,
  operationId,
  timestamp,
  source,
}) {
  const chapter = original(source),
    content = chapter.content ?? '';
  if (
    Object.hasOwn(chapter, 'contentStorage') ||
    chapter.content === null ||
    typeof content !== 'string' ||
    digest(content) !== source.hash
  )
    inconsistent();
  const body = prepareRestoredChapterText({
    uid,
    bookId,
    chapterId: sourceId,
    operationId,
    timestamp,
    content,
  });
  if (body)
    body.writes[0].value.sceneSourceEncoding = createBookSceneSourceEncoding(
      sourceId,
      source,
      body.manifest,
      body.writes.slice(1).map((write) => write.value.bytes),
    );
  return body
    ? { value: { ...source, original: { ...chapter, ...body.patch } }, writes: body.writes }
    : { value: source, writes: [] };
}
/** Caller must authorize the project; missing/external text never becomes an empty source. */
export async function readBookSceneSource(tx, db, { uid, bookId, sourceId, source }) {
  const chapter = original(source),
    content = await readBookChapterText(tx, db, { uid, bookId, chapterId: sourceId, chapter });
  if (digest(content) !== source.hash) inconsistent();
  if (chapter.contentStorage == null) return source;
  const logical = { ...chapter, content };
  delete logical.contentStorage;
  return { ...source, original: logical };
}
