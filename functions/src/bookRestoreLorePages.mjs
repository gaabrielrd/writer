import { createSHA256 } from 'hash-wasm';
import { digest } from './sceneContracts.mjs';
import { closed, inconsistent, integer, restoreHash } from './bookRestoreUploadContracts.mjs';
import {
  createBookRestoreLoreTransform,
  checkBookRestoreLoreTransform,
  advanceBookRestoreLoreTransform,
} from './bookRestoreLoreTransform.mjs';
const algorithm = 'sha256/hash-wasm@4.12.0';
export const bookRestoreLorePageToken = (sourceToken, page) => {
  restoreHash(sourceToken);
  integer(page);
  return digest({ domain: 'writer-restore-lore-page', sourceToken, page });
};
function sourceStart(source, token, page, length) {
  if (page === 0) {
    if (source !== null) inconsistent();
    return { inputOffset: 0, transform: createBookRestoreLoreTransform() };
  }
  closed(source, ['schemaVersion', 'sourceToken', 'nextPage', 'inputOffset', 'transform']);
  if (source.schemaVersion !== 1 || source.sourceToken !== token || source.nextPage !== page)
    inconsistent();
  integer(source.inputOffset, 1);
  if (source.inputOffset >= length) inconsistent();
  checkBookRestoreLoreTransform(source.transform);
  if (
    source.transform.parser.byteLength !== source.inputOffset ||
    source.transform.parser.relationCount !== page * 64 ||
    source.transform.targets !== page * 64 ||
    source.transform.parser.mode !== 'syntax' ||
    source.transform.parser.stack.length !== 1 ||
    source.transform.parser.stack[0].phase !== 'after'
  )
    inconsistent();
  return { inputOffset: source.inputOffset, transform: structuredClone(source.transform) };
}
function checked(p, token, page, count, length) {
  closed(p, [
    'schemaVersion',
    'contextToken',
    'parentToken',
    'field',
    'page',
    'algorithm',
    'inputOffset',
    'outputBytes',
    'hashState',
    'transform',
    'started',
    'done',
  ]);
  if (
    p.schemaVersion !== 1 ||
    p.parentToken !== token ||
    p.contextToken !== bookRestoreLorePageToken(token, page) ||
    p.page !== page ||
    p.field !== 'relations' ||
    p.algorithm !== algorithm ||
    typeof p.started !== 'boolean' ||
    typeof p.done !== 'boolean' ||
    typeof p.hashState !== 'string' ||
    p.hashState.length > 1024 ||
    Buffer.byteLength(JSON.stringify(p)) > 16384
  )
    inconsistent();
  integer(p.inputOffset);
  integer(p.outputBytes);
  checkBookRestoreLoreTransform(p.transform);
  if (
    p.inputOffset > length ||
    p.transform.parser.byteLength !== p.inputOffset ||
    p.transform.targets < page * 64 ||
    p.transform.targets > Math.min(count, (page + 1) * 64) ||
    p.transform.parser.relationCount < page * 64 ||
    p.transform.parser.relationCount > Math.min(count, (page + 1) * 64)
  )
    inconsistent();
}
export function bookRestoreLoreNextPageSource(cursor) {
  if (cursor?.done !== true || cursor.field !== 'relations') inconsistent();
  return {
    schemaVersion: 1,
    sourceToken: cursor.parentToken,
    nextPage: cursor.page + 1,
    inputOffset: cursor.inputOffset,
    transform: structuredClone(cursor.transform),
  };
}
/** Source parser and all cursors require the host's native journal; no client cursor grants access. */
export async function readMappedBookRestoreLorePage({
  lore,
  sourceToken,
  page,
  cursor = null,
  source = null,
  limit = 65536,
  mapTarget,
}) {
  integer(page);
  integer(limit, 1);
  restoreHash(sourceToken);
  const count = lore.metadata.index.relations.count,
    pages = Math.ceil(count / 64),
    span = lore.metadata.index.ranges.relations;
  if (!span || page >= pages || limit > 65536) inconsistent();
  const saved = cursor === null ? null : structuredClone(cursor),
    origin = source === null ? null : structuredClone(source),
    h = await createSHA256(),
    end = Math.min(count, (page + 1) * 64),
    last = page === pages - 1;
  let p;
  if (saved === null) {
    const start = sourceStart(origin, sourceToken, page, span.byteLength);
    p = {
      schemaVersion: 1,
      contextToken: bookRestoreLorePageToken(sourceToken, page),
      parentToken: sourceToken,
      field: 'relations',
      page,
      algorithm,
      ...start,
      outputBytes: 0,
      hashState: Buffer.from(h.save()).toString('base64'),
      started: false,
      done: false,
    };
  } else p = saved;
  checked(p, sourceToken, page, count, span.byteLength);
  if (p.done) inconsistent();
  const hash = Buffer.from(p.hashState, 'base64');
  if (hash.length !== h.save().length || hash.toString('base64') !== p.hashState) inconsistent();
  try {
    h.load(hash);
  } catch {
    inconsistent();
  }
  const unit = await lore.readField('relations', { offset: p.inputOffset, limit }),
    result = await advanceBookRestoreLoreTransform(
      p.transform,
      unit.bytes,
      mapTarget,
      last ? {} : { relationEnd: end },
    );
  if (result.consumed < 1) inconsistent();
  const bytes = Buffer.from(result.bytes);
  if (!p.started) {
    const expected = page === 0 ? 91 : 44;
    if (unit.bytes[0] !== expected || bytes[0] !== expected) inconsistent();
    bytes[0] = 91;
    p.started = true;
  }
  p.inputOffset += result.consumed;
  p.transform = result.state;
  p.done = last ? result.done : result.boundary;
  let output = bytes;
  if (p.done) {
    if (p.transform.targets !== end || p.transform.parser.relationCount !== end) inconsistent();
    if (last) {
      if (p.inputOffset !== span.byteLength || result.consumed !== unit.bytes.length)
        inconsistent();
    } else {
      if (result.done || p.inputOffset >= span.byteLength) inconsistent();
      output = Buffer.concat([bytes, Buffer.from(']')]);
    }
  }
  if (output.length > 81920) inconsistent();
  p.outputBytes += output.length;
  h.update(output);
  p.hashState = Buffer.from(h.save()).toString('base64');
  checked(p, sourceToken, page, count, span.byteLength);
  return {
    field: 'relations',
    present: true,
    bytes: output,
    cursor: p,
    done: p.done,
    references: result.references,
    summary: p.done
      ? { byteLength: p.outputBytes, contentHash: h.digest(), relations: end - page * 64 }
      : null,
    verify: unit.verify,
  };
}
