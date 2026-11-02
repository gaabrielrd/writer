import { resourcesRestoreFixture, finishRestoreResources } from './bookRestoreResourcesFixture.mjs';
import { resource, record, hash, ordered } from './bookContentFixture.mjs';
import { uploadArchiveRestore } from './bookRestoreContentFixture.mjs';
import { finishRestoreStructure } from './bookRestoreStructureFixture.mjs';
import { finishRestoreLore } from './bookRestoreLoreFixture.mjs';
import { finishLegacyRestore, legacyMutation as mutation } from './bookLegacyRestoreFixture.mjs';
import { BOOK_RESOURCE_KINDS } from '../../src/bookBackupResources.mjs';
export function countsRestoreFixture() {
  const records = resourcesRestoreFixture({ duplicates: true });
  for (let i = 0; i < records.length; i++) {
    if (!['book-scene', 'book-scene-body'].includes(records[i].kind)) continue;
    const value = JSON.parse(new TextDecoder().decode(records[i].payload));
    const content = 'Unassigned own prose';
    if (value.kind === 'scene' && value.id === 'unassigned') {
      value.data.bodyHash = hash(content);
      value.data.bodyBytes = Buffer.byteLength(content);
      records[i] = record(records[i].kind, records[i].id, value);
    } else if (value.kind === 'scene-body' && value.parentId === 'unassigned') {
      value.data.content = content;
      value.data.hash = hash(content);
      records[i] = record(records[i].kind, records[i].id, value);
    }
  }
  const extra = [];
  for (const [id, parentId, archived, content] of [
    ['archived-attached', 'chapter', true, 'Archived prose remains'],
    ['orphan', 'removed-chapter', false, 'Orphan words remain'],
    ['empty', 'chapter', false, ''],
  ]) {
    extra.push(
      resource('scene', id, {
        ...ordered,
        parentId,
        archived,
        stage: 'planned',
        rankA: id === 'empty' ? 'Y' : 'W',
        rankB: id === 'empty' ? 'Z' : 'X',
        bodyHash: hash(content),
        bodyBytes: Buffer.byteLength(content),
      }),
    );
    extra.push(resource('scene-body', 'current', { content, hash: hash(content) }, id));
  }
  extra.push(
    resource('narrative-link', 'missing-source-link', {
      source: { kind: 'arc', id: 'missing-arc' },
      reference: { kind: 'event', eventId: 'event' },
    }),
  );
  const end = records.findIndex((r) => r.kind === 'book-resources');
  records.splice(end, 0, ...extra);
  const start = records.findIndex(
      (r) => r.kind.startsWith('book-') && !['book-metadata'].includes(r.kind),
    ),
    manifest = records.findIndex((r) => r.kind === 'book-resources'),
    resources = records.slice(start, manifest);
  resources.sort(
    (a, b) => Number(a.kind.endsWith('-control')) - Number(b.kind.endsWith('-control')),
  );
  records.splice(start, manifest - start, ...resources);
  const counts = Object.fromEntries(
    BOOK_RESOURCE_KINDS.map((kind) => [
      kind,
      resources.filter((r) => r.kind === 'book-' + kind).length,
    ]),
  );
  records[manifest] = record('book-resources', 'book', { schemaVersion: 1, counts });
  return records;
}
export async function readyRestoreCounts(factory, uid, id, records = countsRestoreFixture()) {
  const { progress } = await uploadArchiveRestore(factory(), uid, id, records),
    validated = await finishLegacyRestore(factory, uid, id, progress),
    structure = await finishRestoreStructure(factory, uid, id, validated),
    lore = await finishRestoreLore(factory, uid, id, structure);
  return finishRestoreResources(factory, uid, id, lore);
}
export async function finishRestoreCounts(factory, uid, id, progress, prefix = id + '-counts-') {
  let unit = 0;
  while (progress.preparation.phase !== 'personas') {
    if (unit > 1000) throw new Error('Counts did not finish');
    progress = (
      await factory().advanceBookRestoreCounts(uid, mutation(id, progress, prefix + unit++))
    ).progress;
  }
  return progress;
}
