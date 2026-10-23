import { personasWithDraftFixture } from './bookRestorePersonasFixture.mjs';
import { readyRestoreHistory, finishRestoreHistory } from './bookRestoreHistoryFixture.mjs';
import { record, utf8, hash } from './bookContentFixture.mjs';
import { splitHistoryContent } from '../../src/workHistoryContracts.mjs';
import { legacyMutation as mutation } from './bookLegacyRestoreFixture.mjs';
export function draftRestoreFixture({
  content = '\ufeff  Draft 🌙  ',
  chapterId = 'removed-draft',
  savedContent,
  none = false,
  exclusive = true,
  persona = true,
} = {}) {
  const fixture = personasWithDraftFixture({ exclusive }),
    { records } = fixture;
  if (savedContent !== undefined) {
    const at = records.findIndex((r) => r.kind === 'chapter' && r.id === chapterId),
      value = JSON.parse(new TextDecoder().decode(records[at].payload));
    value.content = savedContent;
    records[at] = record('chapter', chapterId, value);
  }
  const at = records.findIndex((r) => r.kind === 'book-draft'),
    end = records.findIndex((r) => r.kind === 'book-cover'),
    value = JSON.parse(new TextDecoder().decode(records[at].payload)),
    parts = splitHistoryContent(content);
  value.chapter = {
    ...value.chapter,
    id: chapterId,
    title: '  Draft title 🌙  ',
    order: 9,
    createdAt: 111,
    updatedAt: 222,
  };
  if (!persona) {
    value.persona = null;
    delete value.chapter.personaComplement;
  }
  Object.assign(value, {
    byteLength: Buffer.byteLength(content),
    chunkCount: parts.length,
    contentHash: hash(content),
  });
  records.splice(
    at,
    end - at,
    ...(none
      ? [record('book-draft', 'book', { schemaVersion: 1, state: 'none' })]
      : [
          record('book-draft', 'book', value),
          ...parts.map((part, index) => ({
            kind: 'book-draft-text',
            id: chapterId,
            part: index,
            payload: utf8(part),
          })),
        ]),
  );
  // JSON can span frames; raw text is already split on UTF-8 boundaries.
  return records.flatMap((r) =>
    r.payload.length <= 65536
      ? [r]
      : Array.from({ length: Math.ceil(r.payload.length / 65536) }, (_, i) => ({
          ...r,
          part: i,
          payload: r.payload.subarray(i * 65536, (i + 1) * 65536),
        })),
  );
}
export async function readyRestoreDraft(factory, uid, id, records = draftRestoreFixture()) {
  const p = await readyRestoreHistory(factory, uid, id, records);
  return finishRestoreHistory(factory, uid, id, p);
}
export async function finishRestoreDraft(factory, uid, id, progress, prefix = id + '-draft-') {
  let unit = 0;
  while (progress.preparation.phase !== 'draft-finalize') {
    if (unit > 10000) throw new Error('Draft did not finish');
    progress = (
      await factory().advanceBookRestoreDraft(uid, mutation(id, progress, prefix + unit++))
    ).progress;
  }
  return progress;
}
