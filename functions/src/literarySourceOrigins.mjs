import { digest, workId, workFail } from './workProgressContracts.mjs';
export function literaryNativeBirth(row) {
  const value = row.createTime;
  if (
    !row.exists ||
    !Number.isSafeInteger(value?.seconds) ||
    value.seconds < 0 ||
    !Number.isSafeInteger(value?.nanoseconds) ||
    value.nanoseconds < 0 ||
    value.nanoseconds >= 1e9
  )
    workFail('failed-precondition', 'A identidade nativa da fonte está indisponível.');
  return [value.seconds, value.nanoseconds];
}
export function literaryProseOriginToken(c, { book, chapterId, chapter, sceneId, scene }) {
  return digest({
    domain: 'literary-prose-origin-v1',
    uid: c.uid,
    target: c.target,
    book: literaryNativeBirth(book),
    chapter: { id: workId(chapterId), birth: literaryNativeBirth(chapter) },
    scene: { id: workId(sceneId), birth: literaryNativeBirth(scene) },
  });
}
export function literaryAutocompleteChapterIdentity(c, { book, chapterId, chapter }) {
  return digest({
    domain: 'literary-autocomplete-chapter-origin-v1',
    uid: c.uid,
    target: c.target,
    bookBirth: literaryNativeBirth(book),
    chapterId: workId(chapterId),
    birth: literaryNativeBirth(chapter),
  });
}
export function literaryFindingEditorialIdentity(c, { book, kind, id, row }) {
  if (!['plan', 'contract'].includes(kind) || (kind === 'contract' && id !== 'current'))
    workFail('invalid-argument', 'Origem editorial inválida.');
  return digest({
    domain: 'literary-finding-target-v1',
    uid: c.uid,
    target: c.target,
    bookBirth: literaryNativeBirth(book),
    kind,
    id: workId(id),
    birth: literaryNativeBirth(row),
  });
}
