import { loreRestoreFixture, finishRestoreLore } from './bookRestoreLoreFixture.mjs';
import { resource } from './bookContentFixture.mjs';
import { uploadArchiveRestore } from './bookRestoreContentFixture.mjs';
import { finishLegacyRestore, legacyMutation as mutation } from './bookLegacyRestoreFixture.mjs';
import { finishRestoreStructure } from './bookRestoreStructureFixture.mjs';
export const largeLoreData = () => ({
  name: 'Exact name 🌙',
  category: 'character',
  aliases: ['', 'A', 'A'],
  summary: 'literal summary',
  details: '\ufeff' + 'lore text 🌙 '.repeat(100000),
  structuredDetails: { notes: 'unchanged', history: '' },
  isPublic: false,
  relations: Array.from({ length: 130 }, (_, index) => ({
    targetEntityId: index % 2 ? 'universe:gone:external' : 'entity',
    relationType: 'knows',
    description: 'literal ' + index,
  })),
});
export function largeLoreRecords(data = largeLoreData()) {
  const records = loreRestoreFixture({ relations: 0 }),
    index = records.findIndex((r) => r.kind === 'book-lore');
  records[index] = resource('lore', 'entity', data);
  return records.flatMap((r) =>
    r.payload.length <= 65536
      ? [r]
      : Array.from({ length: Math.ceil(r.payload.length / 65536) }, (_, part) => ({
          ...r,
          part,
          payload: r.payload.subarray(part * 65536, (part + 1) * 65536),
        })),
  );
}
export async function readyLargeLore(factory, uid, id, data = largeLoreData()) {
  const { progress } = await uploadArchiveRestore(factory(), uid, id, largeLoreRecords(data));
  const validated = await finishLegacyRestore(factory, uid, id, progress);
  return finishRestoreStructure(factory, uid, id, validated);
}
export async function finishLargeLore(factory, uid, id, p, prefix = id + '-large-') {
  let unit = 0;
  while (p.preparation.phase !== 'scenes') {
    if (unit > 10000) throw new Error('Lore payload did not finish');
    p = (await factory().advanceBookRestoreLore(uid, mutation(id, p, prefix + unit++))).progress;
  }
  return p;
}
export { mutation, finishRestoreLore };
