import {
  digest,
  workClosed,
  workId,
  workFail,
  workProject,
  workScope,
  readWorkMetadata,
} from './workProgressContracts.mjs';
export { digest, workFail };
export const CHUNK_BYTES = 64 * 1024;
export function historyScope(db, uid, data, fields) {
  const context = workScope(db, uid, data, fields);
  if (context.target.kind === 'campaign') workFail('invalid-argument', 'Projeto inválido.');
  return context;
}
export function historyResource(value, target) {
  workClosed(value, ['kind', 'id']);
  if (!(value.kind === 'scene' || (value.kind === 'chapter' && target.kind === 'book')))
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
    content = record.content ?? '';
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
export async function readHistoryVersion(tx, db, context, id) {
  const snapshot = await tx.get(versionRef(db, context, id)),
    value = snapshot.data();
  if (!value || value.deleting || digest(value.target) !== digest(context.target))
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
  return value;
}
export async function readHistoryChunk(tx, db, context, value, index) {
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
