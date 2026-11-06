import { digest, readWorkMetadata, workId } from './workProgressContracts.mjs';
import { literaryNativeBirth } from './literarySourceOrigins.mjs';
const same = (a, b) => a != null && b != null && digest(a) === digest(b);
export const LITERARY_IMPACT_SEQUENCE_MEMBERSHIP_FIELDS = [
  'jobId',
  'actorId',
  'bookBirth',
  'birth',
  'index',
  'chapters',
  'currentWorkflowId',
];
// The active child ID alone is not a proof. Its original registration receipt
// and inverse parent binding must agree with the exact native parent and child.
// This reader grants no execution, never opens prose, and preserves cancellation.
export async function readLiteraryImpactSequenceCurrent(
  tx,
  c,
  { id, data, recordBirth, bookBirth },
) {
  if (!data.currentWorkflowId) return null;
  const currentId = workId(data.currentWorkflowId);
  if (
    data.jobId !== id ||
    data.actorId !== c.uid ||
    !same(data.bookBirth, bookBirth) ||
    !same(data.birth, recordBirth) ||
    !Number.isSafeInteger(data.index) ||
    data.index < 0 ||
    !Array.isArray(data.chapters) ||
    data.index >= data.chapters.length ||
    data.chapters.length > 25 ||
    !data.chapters[data.index]
  )
    return null;
  const row = await readWorkMetadata(tx, c.db.doc(c.path + '/literaryWorkflowJobs/' + currentId), [
    'jobId',
    'actorId',
    'bookBirth',
    'chapterId',
    'chapterBirth',
    'workflowBirth',
    'fingerprint',
    'sequence.id',
    'sequence.birth',
    'sequence.index',
  ]);
  const receipt = await readWorkMetadata(
    tx,
    c.db.doc(c.path + '/literaryOperations/' + currentId),
    ['method', 'id', 'actorId', 'bookBirth', 'workflowBirth', 'fingerprint', 'status'],
  );
  if (!row.exists || !receipt.exists) return null;
  const value = row.data(),
    original = receipt.data(),
    birth = literaryNativeBirth(row);
  if (
    value.jobId !== currentId ||
    value.actorId !== c.uid ||
    !same(value.bookBirth, bookBirth) ||
    !same(value.workflowBirth, birth) ||
    value.chapterId !== data.chapters[data.index].id ||
    !same(value.chapterBirth, data.chapters[data.index].birth) ||
    value.sequence?.id !== id ||
    value.sequence.index !== data.index ||
    !same(value.sequence.birth, recordBirth) ||
    original.method !== 'startLiteraryWorkflow' ||
    original.id !== currentId ||
    original.actorId !== c.uid ||
    !same(original.bookBirth, bookBirth) ||
    !same(original.workflowBirth, birth) ||
    !['done', 'superseded'].includes(original.status) ||
    typeof value.fingerprint !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.fingerprint) ||
    original.fingerprint !== value.fingerprint
  )
    return null;
  return {
    birth,
    originToken: digest({
      domain: 'literary-impact-sequence-current-v1',
      uid: c.uid,
      target: c.target,
      bookBirth,
      sequenceId: id,
      sequenceBirth: recordBirth,
      index: data.index,
      chapterId: value.chapterId,
      chapterBirth: value.chapterBirth,
      workflowId: currentId,
      workflowBirth: birth,
      receiptBirth: literaryNativeBirth(receipt),
      fingerprint: original.fingerprint,
    }),
  };
}
