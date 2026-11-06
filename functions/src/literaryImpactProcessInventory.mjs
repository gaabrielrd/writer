import {
  LITERARY_IMPACT_GUIDE_FIELDS,
  readLiteraryImpactGuideDependencies,
} from './literaryImpactGuideDependencies.mjs';
import { readLiteraryImpactSequenceCurrent } from './literaryImpactSequenceMembership.mjs';
import { digest, readWorkMetadata, workId } from './workProgressContracts.mjs';
import { normalizeLiteraryImpactLink } from './literaryImpactProtocol.mjs';

const publicationPartFields = ['jobId', 'chapterId'];
export const LITERARY_IMPACT_PROCESS_FIELDS = Object.freeze({
  literaryWorkflowJobs: [
    'schemaVersion',
    'actorId',
    'jobId',
    'bookBirth',
    'chapterBirth',
    'chapterId',
    'actId',
    'collaboration.revision',
    'workflowBirth',
    'draftId',
    'reviewId',
    'firstVersionId',
    'sequence.id',
    'sequence.birth',
    'passage.input',
    'passage.previousWorkflowBirth',
    'passage.previousChapterBirth',
    'passage.previous.chapterId',
    'passage.previous.actId',
    'passage.previous.actBirth',
    'passage.next.actBirth',
    'passage.reviewId',
    'passage.reviewBirth',
    'passage.firstVersionId',
    'passage.firstVersionBirth',
    'passage.revisedVersionId',
    'passage.revisedVersionBirth',
    'passage.integration.id',
    'passage.integration.birth',
    'passage.inspection.inspectionId',
    'passage.inspection.birth',
    'passage.publication.publicationId',
    'passage.publication.publicationBirth',
    'admission.policy.revision',
    'admission.inspection.inspectionId',
    'admission.inspection.birth',
  ],
  literarySequenceJobs: [
    'schemaVersion',
    'actorId',
    'jobId',
    'bookBirth',
    'birth',
    'collaboration.revision',
    'chapters',
    'completed',
    'currentWorkflowId',
    'index',
  ],
  literaryPassageInspections: [
    'version',
    'actorId',
    'bookBirth',
    'chapterId',
    'chapter.id',
    'chapter.actId',
    'chapter.identityToken',
    'chapter.token',
    'chapterActBirth',
    'previous.id',
    'previous.identityToken',
    'previous.token',
    'previousActTail.id',
    'previousActTail.identityToken',
    'previousActTail.token',
    'publicationId',
    'publicationAnchor.publicationId',
    'publicationAnchor.publicationBirth',
  ],
  literaryPublications: [
    'schemaVersion',
    'jobId',
    'bookToken',
    'policy',
    'unitId',
    'integration.id',
    'integration.token',
    'previous.revisionId',
  ],
  literaryPublicationCandidates: [...publicationPartFields, 'identityToken', 'token', 'actId'],
  literaryPublicationChapters: [...publicationPartFields, 'identityToken', 'token', 'actId'],
  literaryPublicationUnits: [
    'jobId',
    'identityToken',
    'unit.token',
    'unit.chapterId',
    'unit.chapterToken',
    'unit.resource.kind',
    'unit.resource.id',
  ],
  literaryPublicationBodies: publicationPartFields,
  literaryPublicationRemovals: publicationPartFields,
  literaryPublicationConfirmations: ['version', 'jobId', 'bookToken'],
  ...LITERARY_IMPACT_GUIDE_FIELDS,
});
export const LITERARY_IMPACT_PROCESS_KINDS = Object.freeze({
  literaryWorkflowJobs: 'workflow',
  literarySequenceJobs: 'sequence',
  literaryPassageInspections: 'inspection',
  literaryPublications: 'publication',
});
export function literaryImpactProcessNodeId(collection, id) {
  workId(id);
  return collection.startsWith('literaryPublication') && collection !== 'literaryPublications'
    ? JSON.stringify([collection, id])
    : id;
}
export function literaryImpactArtifactIdentity(c, bookBirth, kind, id, birth) {
  if (
    !Array.isArray(birth) ||
    birth.length !== 2 ||
    !Number.isSafeInteger(birth[0]) ||
    !Number.isSafeInteger(birth[1]) ||
    birth[1] < 0 ||
    birth[1] >= 1e9
  )
    throw new TypeError('Nascimento nativo inválido.');
  return digest({
    domain: 'literary-impact-artifact-origin-v1',
    uid: c.uid,
    target: c.target,
    bookBirth,
    kind,
    id,
    birth,
  });
}
export const literaryImpactPublicationBookToken = (c, bookBirth) =>
  digest({
    domain: 'literary-publication-book-v1',
    uid: c.uid,
    target: c.target,
    birth: bookBirth,
  });

// Called only after the book is authorized and the native row is selected by
// the inventory registry. These links are locators, not execution permissions.
export async function readLiteraryImpactProcessRecord(
  tx,
  c,
  graph,
  { collection, id, data, bookBirth, recordBirth },
) {
  const links = [],
    issues = [];
  const kind = LITERARY_IMPACT_PROCESS_KINDS[collection] ?? 'publicationPart';
  const consumer = graph.node(kind, literaryImpactProcessNodeId(collection, id));
  const add = (sourceKind, sourceId, capture = null, relation = 'source') => {
    const from = graph.node(sourceKind, workId(sourceId));
    links.push(
      normalizeLiteraryImpactLink({
        from,
        to: consumer,
        relation,
        record: { collection, id },
        capture,
      }),
    );
  };
  const origin = (sourceKind, sourceId, birth) =>
    birth == null
      ? null
      : {
          scheme: 'artifact-origin',
          originToken: null,
          identityToken: literaryImpactArtifactIdentity(c, bookBirth, sourceKind, sourceId, birth),
          versionToken: null,
          revision: null,
        };
  const native = (sourceKind, sourceId, birth) => {
    if (sourceId != null) add(sourceKind, sourceId, origin(sourceKind, sourceId, birth));
  };
  const chapter = (value) => {
    if (!value) return;
    add(
      'chapter',
      value.id,
      value.token
        ? {
            scheme: 'integration-chapter',
            originToken: null,
            identityToken: value.identityToken ?? null,
            versionToken: value.token,
            revision: null,
          }
        : null,
    );
  };
  const contract = (revision) => {
    if (revision > 0)
      add('contract', 'current', {
        scheme: 'editorial-revision',
        originToken: null,
        identityToken: null,
        versionToken: null,
        revision,
      });
  };
  const publicationBookToken = literaryImpactPublicationBookToken(c, bookBirth);
  if (['workflow', 'sequence', 'inspection'].includes(kind)) {
    if (
      data.actorId !== c.uid ||
      digest(data.bookBirth) !== digest(bookBirth) ||
      (kind === 'inspection' ? ![1, 2].includes(data.version) : data.schemaVersion !== 1) ||
      (kind !== 'inspection' && data.jobId !== id)
    )
      throw new TypeError('Origem do processo não corresponde ao livro e autor atuais.');
    const ownBirth =
      kind === 'workflow' ? data.workflowBirth : kind === 'sequence' ? data.birth : null;
    if (ownBirth != null && digest(ownBirth) !== digest(recordBirth))
      throw new TypeError('O registro do processo foi recriado.');
    native('book', c.target.id, data.bookBirth);
  } else if (kind === 'publication') {
    if (data.schemaVersion !== 1 || data.jobId !== id || data.bookToken !== publicationBookToken)
      throw new TypeError('Origem da publicação não corresponde ao livro atual.');
    native('book', c.target.id, bookBirth);
  } else {
    const parent = await readWorkMetadata(
      tx,
      c.db.doc(c.path + '/literaryPublications/' + workId(data.jobId)),
      ['jobId', 'bookToken'],
    );
    if (
      !parent.exists ||
      parent.data().jobId !== data.jobId ||
      parent.data().bookToken !== publicationBookToken ||
      (data.bookToken != null && data.bookToken !== publicationBookToken)
    )
      throw new TypeError('Origem da parte de publicação indisponível.');
    add('publication', data.jobId, null);
    // The exact native part contributes to this edition, without claiming the
    // parent has the incarnation originally observed by the part.
    links.push(
      normalizeLiteraryImpactLink({
        from: consumer,
        to: graph.node('publication', data.jobId),
        relation: 'composition',
        record: { collection, id },
        capture: null,
      }),
    );
  }
  if (kind === 'workflow') {
    native('chapter', data.chapterId, data.chapterBirth);
    links.push(
      normalizeLiteraryImpactLink({
        from: consumer,
        to: graph.node('chapter', data.chapterId),
        relation: 'target',
        record: { collection, id },
        capture: null,
      }),
    );
    if (data.actId) native('act', data.actId, data.passage?.next?.actBirth);
    contract(data.collaboration?.revision);
    contract(data.admission?.policy?.revision);
    native('sequence', data.sequence?.id, data.sequence?.birth);
    for (const [sourceKind, sourceId] of [
      ['draft', data.draftId],
      ['review', data.reviewId],
      ['milestone', data.firstVersionId],
    ])
      native(sourceKind, sourceId, null);
    const p = data.passage;
    if (p) {
      native('workflow', p.input?.previousWorkflowId, p.previousWorkflowBirth);
      native('chapter', p.previous?.chapterId, p.previousChapterBirth);
      native('act', p.previous?.actId, p.previous?.actBirth);
      native('review', p.reviewId, p.reviewBirth);
      native('milestone', p.firstVersionId, p.firstVersionBirth);
      native('milestone', p.revisedVersionId, p.revisedVersionBirth);
      native('integration', p.integration?.id, p.integration?.birth);
      native('inspection', p.inspection?.inspectionId, p.inspection?.birth);
      native('publication', p.publication?.publicationId, p.publication?.publicationBirth);
    }
    native(
      'inspection',
      data.admission?.inspection?.inspectionId,
      data.admission?.inspection?.birth,
    );
  } else if (kind === 'sequence') {
    if (
      !Array.isArray(data.chapters) ||
      data.chapters.length > 25 ||
      data.chapters.length < 1 ||
      !Array.isArray(data.completed) ||
      data.completed.length > data.chapters.length
    )
      throw new TypeError('Manifesto de sequência inválido.');
    if (
      new Set(data.chapters.map((value) => workId(value.id))).size !== data.chapters.length ||
      new Set(data.completed.map((value) => value.index)).size !== data.completed.length ||
      data.completed.some(
        (value) =>
          !Number.isSafeInteger(value.index) ||
          value.index < 0 ||
          value.index >= data.chapters.length,
      )
    )
      throw new TypeError('Índices de sequência inválidos.');
    contract(data.collaboration?.revision);
    for (const value of data.chapters) {
      native('chapter', value.id, value.birth);
      native('act', value.actId, value.actBirth);
    }
    for (const value of data.completed) native('workflow', value.workflowId, value.birth);
    if (data.currentWorkflowId) {
      const membership = await readLiteraryImpactSequenceCurrent(tx, c, {
        id,
        data,
        recordBirth,
        bookBirth,
      });
      add(
        'workflow',
        data.currentWorkflowId,
        membership
          ? {
              ...origin('workflow', data.currentWorkflowId, membership.birth),
              scheme: 'sequence-workflow',
              originToken: membership.originToken,
            }
          : null,
      );
      if (!membership) issues.push('current-workflow-origin-not-recorded');
    }
  } else if (kind === 'inspection') {
    if (data.chapter) chapter(data.chapter);
    else issues.push('inspection-target-not-captured');
    if (data.chapter?.actId) native('act', data.chapter.actId, data.chapterActBirth);
    chapter(data.previous);
    chapter(data.previousActTail);
    if (data.publicationAnchor)
      native(
        'publication',
        data.publicationAnchor.publicationId,
        data.publicationAnchor.publicationBirth,
      );
    else if (data.publicationId) add('publication', data.publicationId);
  } else if (kind === 'publication') {
    if (data.policy === 'act') add('act', data.unitId);
    else if (data.policy === 'chapter') add('chapter', data.unitId);
    else if (data.policy !== 'book') throw new TypeError('Unidade de publicação inválida.');
    if (data.integration)
      add('integration', data.integration.id, {
        scheme: 'publication-integration',
        originToken: data.bookToken,
        identityToken: null,
        versionToken: data.integration.token,
        revision: null,
      });
    if (data.previous) add('publication', data.previous.revisionId);
  } else {
    if (['literaryPublicationCandidates', 'literaryPublicationChapters'].includes(collection))
      chapter({ id: data.chapterId, identityToken: data.identityToken, token: data.token });
    else if (collection === 'literaryPublicationUnits') {
      if (!data.unit) throw new TypeError('Unidade sem origem.');
      chapter({ id: data.unit.chapterId, token: data.unit.chapterToken });
      if (!['scene', 'chapter'].includes(data.unit.resource?.kind))
        throw new TypeError('Fonte de unidade inválida.');
      if (data.identityToken && data.unit.token && data.unit.chapterToken)
        add(data.unit.resource.kind, data.unit.resource.id, {
          scheme: 'integration-unit',
          originToken: data.unit.chapterToken,
          identityToken: data.identityToken,
          versionToken: data.unit.token,
          revision: null,
        });
      else {
        add(data.unit.resource.kind, data.unit.resource.id);
        issues.push('publication-unit-native-identity-not-inventoried');
      }
    } else if (data.chapterId) add('chapter', data.chapterId);
    if (Object.hasOwn(LITERARY_IMPACT_GUIDE_FIELDS, collection)) {
      const indexed = await readLiteraryImpactGuideDependencies(tx, c, graph, {
        collection,
        id,
        data,
        consumer,
      });
      links.push(...indexed.links);
      issues.push(...indexed.issues);
    }
  }
  return { links, issues };
}
