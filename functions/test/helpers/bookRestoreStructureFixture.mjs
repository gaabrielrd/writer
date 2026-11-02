import { fixture, record } from './bookContentFixture.mjs';
import { legacyMutation as mutation } from './bookLegacyRestoreFixture.mjs';
export function structureRestoreFixture(content = '\ufeffOne two 🌙') {
  const records = fixture(),
    at = records.findIndex((r) => r.kind === 'book-lore');
  records.splice(
    at,
    0,
    record('chapter', 'legacy-chapter', {
      title: 'Own legacy',
      order: 2,
      content,
      actId: 'act',
      contentMode: 'legacy',
    }),
  );
  const index = records.findIndex((r) => r.kind === 'book-personas'),
    value = JSON.parse(new TextDecoder().decode(records[index].payload));
  value.owners.chapter++;
  records[index] = record('book-personas', 'book', value);
  return records;
}
export async function finishRestoreStructure(
  factory,
  uid,
  id,
  progress,
  prefix = id + '-structure-',
) {
  let unit = 0;
  while (progress.preparation?.phase !== 'resources') {
    if (unit > 1000) throw new Error('Structure did not finish');
    progress = (
      await factory().advanceBookRestoreStructure(uid, mutation(id, progress, prefix + unit++))
    ).progress;
  }
  return progress;
}
