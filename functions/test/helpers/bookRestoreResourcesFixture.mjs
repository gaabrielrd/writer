import { structureRestoreFixture } from './bookRestoreStructureFixture.mjs';
import { resource, record, hash, ordered } from './bookContentFixture.mjs';
import { legacyMutation as mutation } from './bookLegacyRestoreFixture.mjs';
import { BOOK_RESOURCE_KINDS } from '../../src/bookBackupResources.mjs';
export function resourcesRestoreFixture({ childFirst = true, duplicates = false } = {}) {
  const records = structureRestoreFixture(),
    at = records.findIndex((r) => r.kind === 'book-resources');
  const originalSceneIndex = records.findIndex((r) => r.kind === 'book-scene'),
    originalScene = JSON.parse(new TextDecoder().decode(records[originalSceneIndex].payload));
  originalScene.data.formerParentId = 'chapter';
  originalScene.data.revision = 9;
  records[originalSceneIndex] = record('book-scene', records[originalSceneIndex].id, originalScene);
  const extra = [];
  for (const [id, parentId, content] of [
    ['active', 'chapter', '\ufeffActive own 🌙'],
    ['unassigned', null, ''],
  ]) {
    extra.push(
      resource('scene', id, {
        ...ordered,
        parentId,
        stage: 'writing',
        archived: false,
        bodyHash: hash(content),
        bodyBytes: Buffer.byteLength(content),
        rankA: 'W',
        rankB: 'X',
      }),
    );
    extra.push(resource('scene-body', 'current', { content, hash: hash(content) }, id));
  }
  extra.push(
    resource(
      'scene-reference',
      'local-ref',
      { kind: 'book', scopeId: 'book', entityId: 'entity' },
      'active',
    ),
  );
  extra.push(
    resource('narrative-link', 'milestone-link', {
      source: { kind: 'milestone', arcId: 'arc', id: 'milestone' },
      reference: { kind: 'lore', reference: { kind: 'book', scopeId: 'book', entityId: 'entity' } },
    }),
  );
  extra.push(
    resource('narrative-link', 'event-link', {
      source: { kind: 'event', id: 'event' },
      reference: { kind: 'event', eventId: 'removed-event' },
    }),
  );
  if (duplicates) {
    extra.push(
      resource(
        'scene-reference',
        'duplicate-ref',
        { kind: 'book', scopeId: 'book', entityId: 'entity' },
        'active',
      ),
    );
    extra.push(
      resource('narrative-link', 'duplicate-link', {
        source: { kind: 'event', id: 'event' },
        reference: { kind: 'event', eventId: 'removed-event' },
      }),
    );
  }
  records.splice(at, 0, ...extra);
  const start = records.findIndex((r) => r.kind === 'book-lore'),
    end = records.findIndex((r) => r.kind === 'book-resources'),
    resources = records.slice(start, end);
  if (childFirst) {
    const first = (r) =>
      [
        'book-scene-body',
        'book-scene-planning',
        'book-scene-reference',
        'book-milestone',
        'book-narrative-link',
      ].includes(r.kind);
    resources.sort((a, b) => Number(first(b)) - Number(first(a)));
  }
  const counts = Object.fromEntries(
    BOOK_RESOURCE_KINDS.map((kind) => [
      kind,
      resources.filter((r) => r.kind === 'book-' + kind).length,
    ]),
  );
  records.splice(start, end - start, ...resources);
  records[end] = record('book-resources', 'book', { schemaVersion: 1, counts });
  return records;
}
export async function finishRestoreResources(
  factory,
  uid,
  id,
  progress,
  prefix = id + '-resources-',
) {
  let unit = 0;
  while (progress.preparation.phase !== 'resource-counts') {
    if (unit > 1000) throw new Error('Resources did not finish');
    progress = (
      await factory().advanceBookRestoreResources(uid, mutation(id, progress, prefix + unit++))
    ).progress;
  }
  return progress;
}
