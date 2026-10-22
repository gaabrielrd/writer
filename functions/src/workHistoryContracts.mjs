import {
  digest,
  workClosed,
  workId,
  workFail,
  workProject,
  workScope,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { adventureBlockState } from './adventureBlocksState.mjs';
import {
  readBookChapterText,
  openBookChapterText,
  readBookChapterTextPart,
  chapterTextManifest,
  BOOK_CHAPTER_TEXT_PART_BYTES,
} from './bookChapterText.mjs';
import { readAdventureResource, readAdventureBody } from './adventureBlocksContracts.mjs';
export { digest, workFail };
export const CHUNK_BYTES = 64 * 1024;
export function historyScope(db, uid, data, fields) {
  const context = workScope(db, uid, data, fields);
  if (context.target.kind === 'campaign') workFail('invalid-argument', 'Projeto inválido.');
  return context;
}
export function historyResource(value, target) {
  workClosed(value, ['kind', 'id']);
  if (!(
    value.kind === 'scene' ||
    (value.kind === 'chapter' && target.kind === 'book') ||
    (value.kind === 'block' && target.kind === 'adventure')
  ))
    workFail('invalid-argument', 'Fonte inválida para este projeto.');
  return { kind: value.kind, id: workId(value.id) };
}
export function sourceToken(value) {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    workFail('invalid-argument', 'Versão observada inválida.');
  return value;
}
function timestamp(snapshot) {
  const value = snapshot.updateTime;
  if (
    !value ||
    !Number.isSafeInteger(value.seconds) ||
    !Number.isInteger(value.nanoseconds) ||
    value.nanoseconds < 0 ||
    value.nanoseconds >= 1e9
  )
    workFail('failed-precondition', 'Não foi possível verificar a versão salva.');
  return { seconds: value.seconds, nanoseconds: value.nanoseconds };
}
export async function readHistorySource(tx, db, context, resource) {
  if (resource.kind === 'block') {
    let value;
    try {
      value = await readAdventureResource(tx, db, context, resource);
    } catch (cause) {
      if (cause.code === 'not-found') return null;
      throw cause;
    }
    const body = await readAdventureBody(tx, db, value),
      contentHash = digest(body.content),
      token = digest({
        version: 1,
        uid: context.uid,
        target: context.target,
        resource,
        metadata: timestamp(value.blockSnapshot),
        body: timestamp(body.snapshot),
        contentHash,
        revision: value.block.revision,
      });
    return {
      root: value.root,
      snapshot: value.blockSnapshot,
      record: value.block,
      source: {
        target: context.target,
        resource,
        title: value.block.title,
        content: body.content,
        sourceToken: token,
        contentHash,
        revision: value.block.revision,
        sceneWordCount: value.state.total,
      },
      marker: {
        contentHash,
        updatedAt: value.block.updatedAt ?? 0,
        revision: value.block.revision,
      },
    };
  }
  const root = await workProject(tx, context),
    ref = db.doc(
      context.path +
        '/' +
        (resource.kind === 'chapter' ? 'chapters' : 'scenes') +
        '/' +
        resource.id,
    ),
    snapshot = await tx.get(ref),
    record = snapshot.data();
  if (
    !record ||
    record.deleting ||
    (record.bookId && record.bookId !== context.target.id) ||
    (resource.kind === 'chapter' && record.contentMode === 'scenes') ||
    (resource.kind === 'scene' && record.ownerId !== context.uid)
  )
    return null;
  let bodySnapshot = null,
    content =
      resource.kind === 'chapter'
        ? await readBookChapterText(tx, db, {
            uid: context.uid,
            bookId: context.target.id,
            chapterId: resource.id,
            chapter: record,
          })
        : (record.content ?? '');
  if (resource.kind === 'scene') {
    if (record.parentId !== null) {
      const parent = (
        await readWorkMetadata(
          tx,
          db.doc(
            context.path +
              '/' +
              (context.target.kind === 'book' ? 'chapters' : 'parts') +
              '/' +
              workId(record.parentId),
          ),
          ['ownerId', 'contentMode', 'deleting'],
        )
      ).data();
      if (
        !parent ||
        (parent.ownerId && parent.ownerId !== context.uid) ||
        (parent.deleting && !record.archived) ||
        (context.target.kind === 'book' && parent.contentMode !== 'scenes')
      )
        return null;
    }
    bodySnapshot = await tx.get(db.doc(ref.path + '/body/current'));
    const body = bodySnapshot.data();
    if (
      !body ||
      typeof body.content !== 'string' ||
      digest(body.content) !== body.hash ||
      body.hash !== record.bodyHash
    )
      workFail('failed-precondition', 'Texto salvo inconsistente.');
    content = body.content;
  }
  if (typeof content !== 'string') workFail('failed-precondition', 'Texto salvo indisponível.');
  const contentHash = digest(content),
    token = digest({
      version: 1,
      uid: context.uid,
      target: context.target,
      resource,
      metadata: timestamp(snapshot),
      contentHash,
      ...(bodySnapshot ? { body: timestamp(bodySnapshot), revision: record.revision } : {}),
    });
  return {
    root,
    snapshot,
    record,
    source: {
      target: context.target,
      resource,
      title: record.title ?? '',
      content,
      sourceToken: token,
      contentHash,
      revision: resource.kind === 'scene' ? record.revision : null,
      ...(context.target.kind === 'adventure'
        ? { sceneWordCount: adventureBlockState(record).total }
        : {}),
    },
    marker: {
      contentHash,
      updatedAt: record.updatedAt ?? 0,
      ...(resource.kind === 'scene' ? { revision: record.revision } : {}),
    },
  };
}
export function splitHistoryContent(content) {
  const bytes = Buffer.from(content, 'utf8'),
    result = [];
  let start = 0;
  while (start < bytes.length) {
    let end = Math.min(bytes.length, start + CHUNK_BYTES);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    result.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
  }
  if (!result.length) result.push('');
  if (result.join('') !== content)
    workFail('failed-precondition', 'A codificação do texto não pôde ser preservada.');
  return result;
}
export const versionRef = (db, context, id) => db.doc(context.path + '/workVersions/' + workId(id));
export const chunkRef = (db, context, id, index) =>
  db.doc(context.path + '/workVersionBodies/' + digest({ versionId: id, index }));
export function versionSummary(value) {
  return Object.fromEntries(
    [
      'id',
      'target',
      'resource',
      'createdAt',
      'reason',
      'label',
      'wordCount',
      'byteLength',
      'contentHash',
      'chunkCount',
    ].map((key) => [key, value[key]]),
  );
}
export function historyBodyReference(value) {
  if (value.schemaVersion !== 2) {
    if (
      ![undefined, 1].includes(value.schemaVersion) ||
      value.contentStorage != null ||
      value.partLengths !== undefined
    )
      workFail('failed-precondition', 'Formato da versão inconsistente.');
    return null;
  }
  const manifest = chapterTextManifest(value.contentStorage),
    lengths = value.partLengths;
  if (
    value.target?.kind !== 'book' ||
    value.resource?.kind !== 'chapter' ||
    manifest.byteLength !== value.byteLength ||
    manifest.contentHash !== value.contentHash ||
    !Array.isArray(lengths) ||
    lengths.length !== value.chunkCount ||
    lengths.length > 129 ||
    lengths.some((n) => !Number.isSafeInteger(n) || n < 1 || n > CHUNK_BYTES) ||
    lengths.reduce((sum, n) => sum + n, 0) !== value.byteLength
  )
    workFail('failed-precondition', 'Referência da versão inconsistente.');
  return manifest;
}
export async function readHistoryVersion(tx, db, context, id) {
  const snapshot = await tx.get(versionRef(db, context, id)),
    value = snapshot.data();
  if (
    !value ||
    value.id !== id ||
    value.deleting ||
    digest(value.target) !== digest(context.target)
  )
    workFail('not-found', 'Versão indisponível.');
  historyResource(value.resource, context.target);
  if (
    !Number.isSafeInteger(value.chunkCount) ||
    value.chunkCount < 1 ||
    !Number.isSafeInteger(value.byteLength) ||
    value.byteLength < 0 ||
    value.chunkCount > Math.max(1, Math.ceil(value.byteLength / (CHUNK_BYTES - 3)))
  )
    workFail('failed-precondition', 'Versão inconsistente.');
  historyBodyReference(value);
  return value;
}
export async function readHistoryChunk(tx, db, context, value, index) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= value.chunkCount)
    workFail('invalid-argument', 'Parte inválida.');
  const manifest = historyBodyReference(value);
  if (manifest) {
    const opened = await openBookChapterText(tx, db, {
        uid: context.uid,
        bookId: context.target.id,
        chapterId: value.resource.id,
        chapter: {
          bookId: context.target.id,
          ownerId: context.uid,
          content: null,
          contentStorage: manifest,
        },
      }),
      start = value.partLengths.slice(0, index).reduce((sum, n) => sum + n, 0),
      end = start + value.partLengths[index],
      first = Math.floor(start / BOOK_CHAPTER_TEXT_PART_BYTES),
      last = Math.floor((end - 1) / BOOK_CHAPTER_TEXT_PART_BYTES),
      parts = [];
    for (let i = first; i <= last; i++)
      parts.push(await readBookChapterTextPart(tx, db, opened, i));
    const bytes = Buffer.concat(parts).subarray(
      start % BOOK_CHAPTER_TEXT_PART_BYTES,
      (start % BOOK_CHAPTER_TEXT_PART_BYTES) + end - start,
    );
    try {
      return {
        index,
        content: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes),
      };
    } catch {
      workFail('failed-precondition', 'Texto da versão inconsistente.');
    }
  }
  const chunk = (await tx.get(chunkRef(db, context, value.id, index))).data();
  if (
    !chunk ||
    chunk.versionId !== value.id ||
    chunk.index !== index ||
    typeof chunk.content !== 'string' ||
    Buffer.byteLength(chunk.content) > CHUNK_BYTES
  )
    workFail('failed-precondition', 'Texto da versão indisponível.');
  return { index, content: chunk.content };
}
export function historyCursor(value, scope) {
  if (value == null) return null;
  let cursor;
  try {
    if (typeof value !== 'string' || value.length > 12000 || !/^[A-Za-z0-9_-]+$/.test(value))
      throw new Error();
    cursor = JSON.parse(Buffer.from(value, 'base64url').toString());
  } catch {
    workFail('invalid-argument', 'Página inválida.');
  }
  workClosed(cursor, ['version', 'scope', 'date', 'id', 'index']);
  if (cursor.version !== 1 || digest(cursor.scope) !== digest(scope))
    workFail('invalid-argument', 'Página pertence a outro escopo.');
  return cursor;
}
export const encodeHistoryCursor = (value) =>
  Buffer.from(JSON.stringify({ version: 1, ...value })).toString('base64url');
