import { structureRestoreFixture } from './bookRestoreStructureFixture.mjs';
import { record, resource } from './bookContentFixture.mjs';
import { legacyMutation as mutation } from './bookLegacyRestoreFixture.mjs';

export function loreRestoreFixture({ relations = 130, interleaved = true } = {}) {
  const records = structureRestoreFixture(),
    position = records.findIndex((r) => r.kind === 'book-lore'),
    data = {
      name: 'Ana',
      category: 'character',
      aliases: ['A', 'Ana 🌙'],
      summary: 'Own summary',
      details: '\ufeffOwn entity text 🌙',
      structuredDetails: { notes: 'Literal universe:gone:secret' },
      isPublic: true,
      createdAt: 3,
      updatedAt: 4,
      relations: Array.from({ length: relations }, (_, i) => ({
        targetEntityId:
          i % 3 === 0 ? 'entity' : i % 3 === 1 ? 'missing-lore' : 'universe:gone:secret',
        relationType: 'knows',
        description: 'Literal entity book ' + i,
      })),
    };
  records[position] = resource('lore', 'entity', data);
  const extra = [
    resource('lore', 'absent', { name: 'Absent', category: 'other', details: '' }),
    resource('lore', 'empty', { name: 'Empty', category: 'other', relations: [] }),
  ];
  records.splice(
    interleaved ? records.findIndex((r) => r.kind === 'book-resources') : position + 1,
    0,
    ...extra,
  );
  const end = records.findIndex((r) => r.kind === 'book-resources'),
    manifest = JSON.parse(new TextDecoder().decode(records[end].payload));
  manifest.counts.lore = 3;
  records[end] = record('book-resources', 'book', manifest);
  return records;
}
export async function finishRestoreLore(factory, uid, id, progress, prefix = id + '-lore-') {
  let unit = 0;
  while (progress.preparation.phase !== 'scenes') {
    if (unit > 1000) throw new Error('Lore did not finish');
    progress = (
      await factory().advanceBookRestoreLore(uid, mutation(id, progress, prefix + unit++))
    ).progress;
  }
  return progress;
}
