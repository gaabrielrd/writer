import {
  digest,
  workClosed,
  workFail,
  workId,
  workRevision,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { normalizeLiteraryReaderGuide } from './literaryReaderGuideProtocol.mjs';
import { readLiteraryPublicationBook, publicationStamp } from './literaryPublicationContracts.mjs';
import { prepareLiteraryDependencyWrite } from './literaryDependencyClock.mjs';

export const LITERARY_GUIDE_DEPENDENCY_FIELDS = [
  'version',
  'jobId',
  'id',
  'revision',
  'bookToken',
  'versionId',
  'entryHash',
  'deleted',
  'chapterIds',
  'targetIds',
  'mode',
  'sourceBirth',
  'sourceChanged',
  'sourceToken',
  'indexHash',
];
const sourceFields = [
  'version',
  'jobId',
  'id',
  'revision',
  'bookToken',
  'entryHash',
  'deleted',
  'dependencyIndexHash',
];
export const guideDependencyVersionId = (value) =>
  digest({ jobId: value.jobId, id: value.id, revision: value.revision });
export const guideDependencyIndexRef = (c, id) =>
  c.db.doc(c.path + '/literaryPublicationGuideDependencies/' + workId(id));
const hash = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    workFail('failed-precondition', 'Hash do guia indisponível.');
  return value;
};
const indexContent = (value) =>
  Object.fromEntries(
    LITERARY_GUIDE_DEPENDENCY_FIELDS.filter((key) => key !== 'indexHash').map((key) => [
      key,
      value[key],
    ]),
  );
const indexHash = (value) =>
  digest({ domain: 'literary-guide-dependencies-v1', ...indexContent(value) });
const fail = () =>
  workFail('failed-precondition', 'O índice de dependências do guia precisa ser reconferido.');
const same = (a, b) => a != null && b != null && digest(a) === digest(b);

// Input is the canonical version being saved, not provider output. No prose or
// literal quotation enters the metadata index.
export function createLiteraryGuideDependencyIndex(value, origin = null) {
  const { jobId, id, bookToken, revision, entryHash, deleted, guide } = value;
  workId(jobId);
  workId(id);
  hash(bookToken);
  hash(entryHash);
  workRevision(revision);
  if (
    value.version !== 1 ||
    revision < 1 ||
    typeof deleted !== 'boolean' ||
    deleted !== (guide === null) ||
    digest(guide) !== entryHash
  )
    fail();
  const chapterIds =
    guide === null
      ? []
      : [
          guide.revealAfterChapterId,
          ...guide.evidence.map((value) => value.chapterId),
          ...guide.facts.map((value) => value.chapterId),
          ...guide.relationships.map((value) => value.chapterId),
          ...guide.appearances.map((value) => value.chapterId),
        ];
  const targetIds = guide === null ? [] : guide.relationships.map((value) => value.targetId);
  const index = {
    version: 1,
    jobId,
    id,
    bookToken,
    revision,
    entryHash,
    deleted,
    versionId: guideDependencyVersionId(value),
    chapterIds: [...new Set(chapterIds.map(workId))].sort(),
    targetIds: [...new Set(targetIds.map(workId))].sort(),
    mode: origin ? 'native-backfill' : 'co-created',
    sourceBirth: origin?.birth ?? null,
    sourceChanged: origin?.changed ?? null,
    sourceToken: origin?.sourceToken ?? null,
  };
  if (index.chapterIds.length > 57 || index.targetIds.length > 12) fail();
  return { ...index, indexHash: indexHash(index) };
}

async function sourceMetadata(tx, c, versionId) {
  const { bookToken } = await readLiteraryPublicationBook(tx, c);
  const row = await readWorkMetadata(
    tx,
    c.db.doc(c.path + '/literaryPublicationGuideVersions/' + workId(versionId)),
    sourceFields,
  );
  const value = row.data();
  if (
    !value ||
    value.version !== 1 ||
    value.bookToken !== bookToken ||
    value.revision < 1 ||
    typeof value.deleted !== 'boolean' ||
    guideDependencyVersionId(value) !== versionId
  )
    fail();
  workId(value.id);
  workId(value.jobId);
  workRevision(value.revision);
  hash(value.entryHash);
  const job = await readWorkMetadata(
    tx,
    c.db.doc(c.path + '/literaryPublications/' + value.jobId),
    ['jobId', 'bookToken'],
  );
  if (!job.exists || job.data().jobId !== value.jobId || job.data().bookToken !== bookToken) fail();
  const stamp = publicationStamp(row);
  return {
    row,
    value,
    stamp,
    sourceToken: digest({
      domain: 'literary-guide-dependency-source-v1',
      uid: c.uid,
      target: c.target,
      versionId,
      bookToken,
      stamp,
      entryHash: value.entryHash,
      deleted: value.deleted,
    }),
  };
}
export async function readLiteraryGuideDependencyBackfillSource(tx, c, versionId) {
  const source = await sourceMetadata(tx, c, versionId);
  return { versionId, sourceToken: source.sourceToken };
}

// A null result is an explicit census gap, not permission to read guide prose or
// silently rebuild it. Both index and original version are native and reauthorized.
export async function readLiteraryGuideDependencyIndex(tx, c, versionId) {
  const source = await sourceMetadata(tx, c, versionId);
  const row = await readWorkMetadata(
    tx,
    guideDependencyIndexRef(c, versionId),
    LITERARY_GUIDE_DEPENDENCY_FIELDS,
  );
  if (!row.exists) return null;
  const value = row.data();
  workClosed(value, LITERARY_GUIDE_DEPENDENCY_FIELDS);
  if (
    Object.keys(value).length !== LITERARY_GUIDE_DEPENDENCY_FIELDS.length ||
    value.version !== 1 ||
    value.versionId !== versionId ||
    value.bookToken !== source.value.bookToken ||
    value.jobId !== source.value.jobId ||
    value.id !== source.value.id ||
    value.revision !== source.value.revision ||
    value.entryHash !== source.value.entryHash ||
    value.deleted !== source.value.deleted ||
    !Array.isArray(value.chapterIds) ||
    value.chapterIds.length > 57 ||
    !Array.isArray(value.targetIds) ||
    value.targetIds.length > 12 ||
    new Set(value.chapterIds).size !== value.chapterIds.length ||
    new Set(value.targetIds).size !== value.targetIds.length ||
    value.indexHash !== indexHash(value)
  )
    fail();
  value.chapterIds.forEach(workId);
  value.targetIds.forEach(workId);
  if (value.deleted && (value.chapterIds.length || value.targetIds.length)) fail();
  const native = publicationStamp(row);
  if (!same(native.birth, native.changed) || source.value.dependencyIndexHash !== value.indexHash)
    fail();
  if (value.mode === 'co-created') {
    if (
      value.sourceBirth !== null ||
      value.sourceChanged !== null ||
      value.sourceToken !== null ||
      !same(native.birth, source.stamp.birth) ||
      !same(source.stamp.birth, source.stamp.changed)
    )
      fail();
  } else if (value.mode === 'native-backfill') {
    if (!same(value.sourceBirth, source.stamp.birth) || !same(native.birth, source.stamp.changed))
      fail();
    hash(value.sourceToken);
    if (
      !Array.isArray(value.sourceChanged) ||
      value.sourceChanged.length !== 2 ||
      value.sourceChanged.some((part) => !Number.isSafeInteger(part)) ||
      value.sourceChanged[0] < 0 ||
      value.sourceChanged[1] < 0 ||
      value.sourceChanged[1] >= 1e9
    )
      fail();
  } else fail();
  return {
    value,
    sourceToken: source.sourceToken,
    originToken: digest({
      domain: 'literary-guide-dependency-origin-v1',
      uid: c.uid,
      target: c.target,
      versionId,
      source: source.stamp,
      index: native,
      indexHash: value.indexHash,
    }),
    sourceRepresentation:
      value.mode === 'co-created' ? 'native-co-created-index' : 'explicit-native-backfill',
  };
}

// Explicit internal backfill step. The future orchestrator must pin the source
// preflight server-side and call this only after authorizing index preparation.
// It never runs in a read, save replay, publication confirmation or page mount.
export async function backfillLiteraryGuideDependencyIndex(
  tx,
  c,
  { versionId, expectedSourceToken },
) {
  const source = await sourceMetadata(tx, c, versionId);
  hash(expectedSourceToken);
  const existing = await readLiteraryGuideDependencyIndex(tx, c, versionId);
  if (existing) {
    if (
      expectedSourceToken !== source.sourceToken &&
      expectedSourceToken !== existing.value.sourceToken
    )
      fail();
    return {
      versionId,
      indexHash: existing.value.indexHash,
      created: false,
      provenance: existing.sourceRepresentation,
    };
  }
  if (expectedSourceToken !== source.sourceToken || source.value.dependencyIndexHash != null)
    fail();
  const original = await readWorkMetadata(tx, source.row.ref, [...sourceFields, 'guide']);
  const raw = original.data();
  if (
    !same(publicationStamp(original), source.stamp) ||
    digest(raw.guide) !== source.value.entryHash
  )
    fail();
  const guide = raw.guide === null ? null : normalizeLiteraryReaderGuide(raw.guide);
  if (digest(guide) !== source.value.entryHash || (guide === null) !== source.value.deleted) fail();
  const value = createLiteraryGuideDependencyIndex(
    { ...source.value, guide },
    { ...source.stamp, sourceToken: expectedSourceToken },
  );
  const clock = await prepareLiteraryDependencyWrite(tx, c);
  tx.create(guideDependencyIndexRef(c, versionId), value);
  tx.update(source.row.ref, { dependencyIndexHash: value.indexHash });
  clock.commit();
  return {
    versionId,
    indexHash: value.indexHash,
    created: true,
    provenance: 'explicit-native-backfill',
  };
}
