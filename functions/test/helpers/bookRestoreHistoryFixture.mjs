import { universeRestoreFixture } from './bookRestoreUniverseFixture.mjs';
import { readyRestorePersonas, finishRestorePersonas } from './bookRestorePersonasFixture.mjs';
import { legacyMutation as mutation } from './bookLegacyRestoreFixture.mjs';
import { record, utf8, hash } from './bookContentFixture.mjs';
import { splitHistoryContent } from '../../src/workHistoryContracts.mjs';
import { countVisibleWords } from '../../src/visibleWordCount.mjs';
export function historyRestoreFixture(
  versions = [
    {
      id: 'manual',
      content: '\ufeffOriginal 🌙',
      resource: { kind: 'chapter', id: 'removed' },
      label: '  Rótulo 🌙  ',
    },
    {
      id: 'backup',
      content: '',
      resource: { kind: 'scene', id: 'removed-scene' },
      reason: 'before-restore',
    },
  ],
) {
  const records = universeRestoreFixture(),
    start = records.findIndex((r) => r.kind === 'work-version'),
    end = records.findIndex((r) => r.kind === 'work-history'),
    items = [];
  let bytes = 0,
    parts = 0;
  for (const [index, v] of versions.entries()) {
    const chunks = v.parts ?? splitHistoryContent(v.content),
      value = {
        id: v.id,
        target: { kind: 'book', id: 'book' },
        resource: v.resource ?? { kind: 'chapter', id: 'removed' },
        createdAt: 10 + index,
        reason: v.reason ?? 'manual',
        label: v.label ?? null,
        wordCount: countVisibleWords(v.content),
        byteLength: Buffer.byteLength(v.content),
        contentHash: hash(v.content),
        chunkCount: chunks.length,
      };
    items.push(
      record('work-version', v.id, value),
      ...chunks.map((s, part) => ({
        kind: 'work-version-text',
        id: v.id,
        part,
        payload: utf8(s),
      })),
    );
    bytes += value.byteLength;
    parts += chunks.length;
  }
  items.push(
    record('work-history', 'book', {
      schemaVersion: 1,
      versions: versions.length,
      byteLength: bytes,
      chunkCount: parts,
    }),
  );
  records.splice(start, end - start + 1, ...items);
  return records;
}
export async function readyRestoreHistory(factory, uid, id, records = historyRestoreFixture()) {
  let p = await readyRestorePersonas(factory, uid, id, records);
  p = await finishRestorePersonas(factory, uid, id, p);
  return (await factory().advanceBookRestoreUniverse(uid, mutation(id, p, id + '-universe')))
    .progress;
}
export async function finishRestoreHistory(factory, uid, id, progress, prefix = id + '-history-') {
  let unit = 0;
  while (progress.preparation.phase !== 'draft') {
    if (unit > 10000) throw new Error('History did not finish');
    progress = (
      await factory().advanceBookRestoreHistory(uid, mutation(id, progress, prefix + unit++))
    ).progress;
  }
  return progress;
}
