import type * as History from '../../../src/features/manuscript-history/model/workHistory';
import { countWords } from '../../../src/features/books/model/chapter';
import {
  fixtureReadBook,
  fixtureReadChapters,
  fixtureWriteBook,
  fixtureWriteChapter,
} from './bookService';
import { fixtureGet, fixtureOwner } from './studioStore';
import { fixtureContentHash, fixtureSceneState } from './sceneStore';
import { updateScene } from './sceneService';
import { FIXTURE_TIME } from './data';

type SavedVersion = { summary: History.VersionSummary; chunks: string[] };
type Receipt = { fingerprint: string; result: unknown; restoredHash?: string };
type State = { versions: [string, SavedVersion][]; receipts: [string, Receipt][]; clock: number };
const storageKey = 'writer.visual.work-history';
const initial = JSON.parse(
  sessionStorage.getItem(storageKey) ?? '{"versions":[],"receipts":[],"clock":0}',
) as State;
const versions = new Map(initial.versions);
const receipts = new Map(initial.receipts);
let clock = initial.clock;
const targetKey = (target: History.VersionTarget) =>
  `${fixtureOwner()}:${target.kind}:${target.id}`;
const versionKey = (target: History.VersionTarget, id: string) => `${targetKey(target)}:${id}`;
const sameResource = (a: History.VersionResource, b: History.VersionResource) =>
  a.kind === b.kind && a.id === b.id;
function persist() {
  sessionStorage.setItem(
    storageKey,
    JSON.stringify({ versions: [...versions], receipts: [...receipts], clock }),
  );
}
function fail(message: string, code = 'failed-precondition', reason = 'revision-conflict'): never {
  throw Object.assign(new Error(message), { code: `functions/${code}`, details: { reason } });
}
async function authorize(target: History.VersionTarget) {
  const root =
    target.kind === 'book' ? fixtureReadBook(target.id) : await fixtureGet('adventure', target.id);
  const owner = root && ('authorId' in root ? root.authorId : root.ownerId);
  if (
    !root ||
    owner !== fixtureOwner() ||
    ('deleting' in root && root.deleting) ||
    sessionStorage.getItem('writer.visual.history-revoked-target') === `${target.kind}:${target.id}`
  )
    fail('Projeto indisponível.', 'not-found');
}
function splitBody(content: string) {
  const chunks: string[] = [];
  let part = '',
    size = 0;
  for (const character of content) {
    const bytes = new TextEncoder().encode(character).byteLength;
    if (size + bytes > 65_536) {
      chunks.push(part);
      part = '';
      size = 0;
    }
    part += character;
    size += bytes;
  }
  if (part || !chunks.length) chunks.push(part);
  return chunks;
}
async function source(
  target: History.VersionTarget,
  resource: History.VersionResource,
): Promise<History.VersionSource | null> {
  await authorize(target);
  let title: string, content: string, stamp: string, revision: number | null;
  if (resource.kind === 'chapter') {
    if (target.kind !== 'book') return null;
    const chapter = fixtureReadChapters(target.id).find((item) => item.id === resource.id);
    if (!chapter || chapter.deleting || chapter.contentMode === 'scenes') return null;
    title = chapter.title;
    content = chapter.content;
    stamp = String(chapter.updatedAt);
    revision = null;
  } else {
    const state = await fixtureSceneState(target),
      scene = state.scenes[resource.id];
    if (
      !scene ||
      ('deleting' in scene && scene.deleting) ||
      typeof state.bodies[resource.id] !== 'string'
    )
      return null;
    title = scene.title;
    content = state.bodies[resource.id];
    stamp = `${scene.updatedAt}:${scene.revision}`;
    revision = scene.revision;
  }
  const contentHash = await fixtureContentHash(content);
  return {
    target,
    resource,
    title,
    content,
    revision,
    contentHash,
    sourceToken: await fixtureContentHash(
      JSON.stringify([targetKey(target), resource, stamp, contentHash]),
    ),
  };
}
function saveVersion(
  current: History.VersionSource,
  id: string,
  reason: History.VersionSummary['reason'],
  label: string | null,
) {
  const chunks = splitBody(current.content);
  const summary: History.VersionSummary = {
    id,
    target: current.target,
    resource: current.resource,
    createdAt: FIXTURE_TIME + ++clock,
    reason,
    label,
    wordCount: countWords(current.content),
    byteLength: new TextEncoder().encode(current.content).byteLength,
    contentHash: current.contentHash,
    chunkCount: chunks.length,
  };
  versions.set(versionKey(current.target, id), { summary, chunks });
  return summary;
}
function savedVersion(target: History.VersionTarget, id: string) {
  const value = versions.get(versionKey(target, id));
  if (!value) fail('Versão indisponível.', 'not-found');
  return value;
}
function receipt<T>(input: { target: History.VersionTarget; operationId: string }, method: string) {
  const key = `${targetKey(input.target)}:${input.operationId}`;
  const fingerprint = JSON.stringify([method, input]);
  const previous = receipts.get(key);
  if (previous && previous.fingerprint !== fingerprint)
    fail('Operação usada com outros dados.', 'invalid-argument');
  return { key, fingerprint, previous, result: previous?.result as T | undefined };
}
function lostResponse(method: string) {
  if (sessionStorage.getItem('writer.visual.history-lost-response') === method) {
    sessionStorage.removeItem('writer.visual.history-lost-response');
    fail(
      'Não foi possível confirmar esta operação. Confirme o mesmo pedido antes de continuar.',
      'unavailable',
    );
  }
}
export const getWorkVersionSource = (input: {
  target: History.VersionTarget;
  resource: History.VersionResource;
}) => source(input.target, input.resource);
export async function createWorkVersion(
  input: History.CreateWorkVersionInput,
): Promise<{ version: History.VersionSummary }> {
  await authorize(input.target);
  const prior = receipt<{ version: History.VersionSummary }>(input, 'create');
  if (prior.result) return structuredClone(prior.result);
  const current = await source(input.target, input.resource);
  if (!current || current.sourceToken !== input.expectedSourceToken)
    fail('O texto salvo mudou. Compare a versão atual antes de continuar.');
  if (input.target.kind === 'book' && input.resource.kind === 'chapter')
    fixtureWriteBook(input.target.id, { hasProgressResources: true });
  const result = {
    version: saveVersion(current, input.operationId, 'manual', input.label?.trim() || null),
  };
  receipts.set(prior.key, { fingerprint: prior.fingerprint, result });
  persist();
  lostResponse('create');
  return structuredClone(result);
}
function cursorScope(target: History.VersionTarget, extra: unknown) {
  return JSON.stringify([targetKey(target), extra]);
}
export async function listWorkVersions(input: {
  target: History.VersionTarget;
  resource?: History.VersionResource;
  cursor?: string | null;
  limit?: number;
}): Promise<History.VersionPage> {
  await authorize(input.target);
  const seedKey = 'writer.visual.history-seeded:' + targetKey(input.target);
  if (
    !sessionStorage.getItem(seedKey) &&
    input.target.kind === 'book' &&
    (sessionStorage.getItem('writer.visual.history-pages') === 'true' ||
      sessionStorage.getItem('writer.visual.history-orphan') === 'true')
  ) {
    const chapter = fixtureReadChapters(input.target.id)[0];
    const current = chapter
      ? await source(input.target, { kind: 'chapter', id: chapter.id })
      : null;
    if (current) {
      if (sessionStorage.getItem('writer.visual.history-pages') === 'true')
        for (let index = 1; index <= 28; index++)
          saveVersion(
            current,
            'seed-version-' + String(index).padStart(2, '0'),
            'manual',
            'Versão guardada ' + index,
          );
      if (sessionStorage.getItem('writer.visual.history-orphan') === 'true')
        saveVersion(
          { ...current, resource: { kind: 'chapter', id: 'removed-chapter' } },
          'removed-source-version',
          'manual',
          'Capítulo removido',
        );
      sessionStorage.setItem(seedKey, 'true');
      persist();
    }
  }
  const scope = cursorScope(input.target, input.resource ?? null);
  const cursor = input.cursor
    ? (JSON.parse(input.cursor) as { scope: string; createdAt: number; id: string })
    : null;
  if (cursor && cursor.scope !== scope) fail('Página inválida.', 'invalid-argument');
  const limit = input.limit ?? 25;
  const rows = [...versions.entries()]
    .filter(
      ([key, value]) =>
        key.startsWith(targetKey(input.target) + ':') &&
        (!input.resource || sameResource(value.summary.resource, input.resource)),
    )
    .map(([, value]) => value.summary)
    .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
    .filter(
      (value) =>
        !cursor ||
        value.createdAt < cursor.createdAt ||
        (value.createdAt === cursor.createdAt && value.id.localeCompare(cursor.id) < 0),
    );
  const items = rows.slice(0, limit),
    last = items.at(-1);
  return structuredClone({
    items,
    nextCursor:
      rows.length > limit && last
        ? JSON.stringify({ scope, createdAt: last.createdAt, id: last.id })
        : null,
  });
}
export async function readWorkVersion(input: {
  target: History.VersionTarget;
  versionId: string;
  cursor?: string | null;
  limit?: number;
}): Promise<History.VersionBodyPage> {
  await authorize(input.target);
  const value = savedVersion(input.target, input.versionId),
    scope = cursorScope(input.target, input.versionId);
  const cursor = input.cursor
    ? (JSON.parse(input.cursor) as { scope: string; index: number })
    : { scope, index: 0 };
  if (cursor.scope !== scope) fail('Página inválida.', 'invalid-argument');
  const limit = input.limit ?? 4;
  const chunks = value.chunks
    .slice(cursor.index, cursor.index + limit)
    .map((content, index) => ({ index: cursor.index + index, content }));
  const next = cursor.index + chunks.length;
  return structuredClone({
    version: value.summary,
    chunks,
    nextCursor: next < value.chunks.length ? JSON.stringify({ scope, index: next }) : null,
  });
}
async function replaceSource(current: History.VersionSource, content: string, operationId: string) {
  if (current.resource.kind === 'chapter') {
    const chapter = fixtureReadChapters(current.target.id).find(
      (item) => item.id === current.resource.id,
    )!;
    fixtureWriteChapter({
      ...chapter,
      content,
      wordCount: countWords(content),
      updatedAt: Math.max(chapter.updatedAt + 1, FIXTURE_TIME + ++clock),
    });
    const book = fixtureReadBook(current.target.id)!;
    fixtureWriteBook(book.id, {
      wordCount: Math.max(0, book.wordCount + countWords(content) - chapter.wordCount),
    });
  } else {
    await updateScene({
      target: current.target,
      sceneId: current.resource.id,
      operationId,
      expectedRevision: current.revision!,
      patch: { content },
    });
  }
}
export async function restoreWorkVersion(
  input: History.RestoreWorkVersionInput,
): Promise<History.RestoreWorkVersionResult> {
  await authorize(input.target);
  const prior = receipt<History.RestoreWorkVersionResult>(input, 'restore');
  const current = await source(input.target, input.resource);
  if (!current) fail('O texto de origem está indisponível.');
  if (prior.result) {
    if (current.sourceToken !== prior.result.source.sourceToken)
      fail('A restauração já foi aplicada e o texto mudou depois. Compare a versão atual.');
    return structuredClone(prior.result);
  }
  if (current.sourceToken !== input.expectedSourceToken)
    fail('O texto salvo mudou. Compare a versão atual antes de continuar.');
  const selected = savedVersion(input.target, input.versionId);
  if (!sameResource(selected.summary.resource, input.resource))
    fail('A versão pertence a outro texto.', 'invalid-argument');
  await replaceSource(current, selected.chunks.join(''), input.operationId);
  const previousVersion = saveVersion(
    current,
    input.operationId + '-before',
    'before-restore',
    null,
  );
  const restored = await source(input.target, input.resource);
  if (!restored) fail('Texto indisponível.');
  const result = { source: restored, previousVersion };
  receipts.set(prior.key, {
    fingerprint: prior.fingerprint,
    result,
    restoredHash: restored.contentHash,
  });
  persist();
  lostResponse('restore');
  return structuredClone(result);
}
export async function deleteWorkVersion(
  input: History.DeleteWorkVersionInput,
): Promise<{ complete: boolean; processed: number }> {
  await authorize(input.target);
  const prior = receipt<{ complete: boolean; processed: number }>(input, 'delete');
  if (prior.result) return prior.result;
  const value = savedVersion(input.target, input.versionId);
  versions.delete(versionKey(input.target, input.versionId));
  const result = { complete: true, processed: value.chunks.length };
  receipts.set(prior.key, { fingerprint: prior.fingerprint, result });
  persist();
  lostResponse('delete');
  return result;
}
