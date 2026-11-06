import { readWorkMetadata, workId } from './workProgressContracts.mjs';
import { normalizeLiteraryImpactLink } from './literaryImpactProtocol.mjs';
import {
  readLiteraryGuideDependencyIndex,
  guideDependencyVersionId,
  LITERARY_GUIDE_DEPENDENCY_FIELDS,
} from './literaryPublicationGuideDependencies.mjs';
import { literaryPublicationEntryId } from './literaryPublicationContracts.mjs';
export const LITERARY_IMPACT_GUIDE_FIELDS = Object.freeze({
  literaryPublicationGuideDependencies: LITERARY_GUIDE_DEPENDENCY_FIELDS,
  literaryPublicationGuide: ['jobId', 'bookToken', 'id', 'revision', 'entryHash'],
  literaryPublicationGuideVersions: ['jobId', 'bookToken', 'id', 'revision', 'entryHash'],
  literaryPublicationGuideProofs: ['jobId', 'id', 'revision', 'entryHash'],
});
export const literaryImpactReaderGuideId = (jobId, id) =>
  JSON.stringify([workId(jobId), workId(id)]);
const indexId = (collection, id, data) =>
  collection === 'literaryPublicationGuideDependencies' ? id : guideDependencyVersionId(data);
export async function readLiteraryImpactGuideDependencies(
  tx,
  c,
  graph,
  { collection, id, data, consumer },
) {
  const index = await readLiteraryGuideDependencyIndex(tx, c, indexId(collection, id, data));
  if (!index) return { links: [], issues: ['publication-guide-dependencies-not-inventoried'] };
  const value = index.value;
  if (
    data.jobId !== value.jobId ||
    data.id !== value.id ||
    data.revision !== value.revision ||
    data.entryHash !== value.entryHash
  )
    throw new TypeError('O índice pertence a outra versão do guia.');
  const record = { collection, id },
    links = [];
  const add = (from, to, relation, capture = null) =>
    links.push(normalizeLiteraryImpactLink({ from, to, relation, record, capture }));
  const logical = graph.node('readerGuide', literaryImpactReaderGuideId(value.jobId, value.id));
  for (const chapterId of value.chapterIds)
    add(graph.node('chapter', chapterId), consumer, 'source', {
      scheme: 'guide-dependency',
      originToken: index.originToken,
      identityToken: null,
      versionToken: null,
      revision: value.revision,
    });
  for (const targetId of value.targetIds)
    add(
      graph.node('readerGuide', literaryImpactReaderGuideId(value.jobId, targetId)),
      consumer,
      'narrative',
      {
        scheme: 'guide-dependency',
        originToken: index.originToken,
        identityToken: null,
        versionToken: null,
        revision: value.revision,
      },
    );
  add(
    consumer,
    logical,
    collection === 'literaryPublicationGuideVersions' ? 'preserves' : 'composition',
  );
  if (collection === 'literaryPublicationGuideDependencies')
    add(
      consumer,
      graph.node(
        'publicationPart',
        JSON.stringify(['literaryPublicationGuideVersions', value.versionId]),
      ),
      'composition',
    );
  return { links, issues: [] };
}
export async function verifyLiteraryImpactGuideDependency(tx, c, link) {
  const { from, capture, record } = link;
  if (
    capture?.scheme !== 'guide-dependency' ||
    !Object.hasOwn(LITERARY_IMPACT_GUIDE_FIELDS, record.collection) ||
    !['chapter', 'readerGuide'].includes(from.kind) ||
    from.scopeKind !== 'book' ||
    from.scopeId !== c.target.id ||
    capture.identityToken !== null ||
    capture.versionToken !== null
  )
    return null;
  const row = await readWorkMetadata(
    tx,
    c.db.doc(c.path + '/' + record.collection + '/' + record.id),
    LITERARY_IMPACT_GUIDE_FIELDS[record.collection],
  );
  if (!row.exists) return { sourceAvailable: false };
  const index = await readLiteraryGuideDependencyIndex(
    tx,
    c,
    indexId(record.collection, record.id, row.data()),
  );
  if (!index || capture.revision !== index.value.revision) return { sourceAvailable: false };
  let available;
  if (from.kind === 'chapter') {
    if (!index.value.chapterIds.includes(from.id)) return null;
    const chapter = await readWorkMetadata(tx, c.db.doc(c.path + '/chapters/' + from.id), [
      'bookId',
      'ownerId',
      'deleting',
    ]);
    const value = chapter.data();
    available =
      !!value &&
      !value.deleting &&
      (value.bookId == null || value.bookId === c.target.id) &&
      (value.ownerId == null || value.ownerId === c.uid);
  } else {
    const candidates = index.value.targetIds.filter(
      (id) => literaryImpactReaderGuideId(index.value.jobId, id) === from.id,
    );
    if (candidates.length !== 1) return null;
    const target = await readWorkMetadata(
      tx,
      c.db.doc(
        c.path +
          '/literaryPublicationGuide/' +
          literaryPublicationEntryId(index.value.jobId, candidates[0]),
      ),
      ['jobId', 'id', 'bookToken', 'deleted'],
    );
    const value = target.data();
    available =
      !!value &&
      !value.deleted &&
      value.jobId === index.value.jobId &&
      value.id === candidates[0] &&
      value.bookToken === index.value.bookToken;
  }
  return {
    sourceAvailable: available,
    identityMatches: null,
    versionMatches: null,
    capturedGrantMatches: capture.originToken === index.originToken,
    dependencyRecordVerified: capture.originToken === index.originToken,
    identityEvidence: 'registered-association-only',
    sourceRepresentation: index.sourceRepresentation,
  };
}
