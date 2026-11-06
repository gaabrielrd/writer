import { workFail, digest, readWorkMetadata } from './workProgressContracts.mjs';
import {
  LITERARY_APPLICATION_SOURCES,
  normalizeLiteraryApplicationIndex,
  literaryApplicationIndexId,
  literaryApplicationIdentity,
  literaryApplicationReceiptMetadata,
} from './literaryApplicationIndex.mjs';
const receiptFields = [
  'state',
  'requestId',
  'operationId',
  'fingerprint',
  'sceneId',
  'chapterId',
  'revision',
  'contentHash',
  'previousVersionId',
  'appliedAt',
  'beforeHash',
  'afterHash',
  'updatedAt',
];
export async function readLiteraryImpactApplication(tx, c, graph, { id, data }) {
  const value = normalizeLiteraryApplicationIndex(data);
  if (
    value.ownerId !== c.uid ||
    value.target.id !== c.target.id ||
    literaryApplicationIndexId(c, value.kind, value.operationId) !== id
  )
    workFail('permission-denied', 'A aplicação pertence a outro escopo.');
  const book = await readWorkMetadata(tx, c.ref, []);
  const receipt = await readWorkMetadata(
    tx,
    c.db.doc(c.path + '/' + value.receipt.collection + '/' + value.receipt.id),
    receiptFields,
  );
  if (!receipt.exists) return { links: [], issues: ['application-receipt-unavailable'] };
  const metadata = literaryApplicationReceiptMetadata(value.kind, receipt.data());
  if (
    metadata.requestId !== value.source.id ||
    metadata.operationId !== value.operationId ||
    digest(metadata) !== value.receipt.token ||
    value.afterHash !== (value.kind === 'prose' ? metadata.contentHash : metadata.afterHash) ||
    (value.kind === 'prose' &&
      (value.destination.id !== metadata.sceneId || value.revision !== metadata.revision)) ||
    (value.kind === 'autocomplete' && value.destination.id !== metadata.chapterId)
  )
    return { links: [], issues: ['application-receipt-changed'] };
  const resource = value.destination,
    row = await readWorkMetadata(
      tx,
      c.db.doc(
        c.path + '/' + (resource.kind === 'scene' ? 'scenes' : 'chapters') + '/' + resource.id,
      ),
      ['ownerId', 'bookId', 'deleting'],
    );
  const current = row.data();
  if (
    !current ||
    current.deleting ||
    (resource.kind === 'scene' && current.ownerId !== c.uid) ||
    (resource.kind === 'chapter' && current.bookId != null && current.bookId !== c.target.id) ||
    literaryApplicationIdentity(c, { book, node: resource, row }) !== resource.identityToken
  )
    return { links: [], issues: ['application-destination-unavailable-or-recreated'] };
  const consumer = graph.node(value.source.kind, value.source.id),
    record = { collection: 'literaryApplications', id },
    dep = value.dependencies;
  const links = [
    {
      from: consumer,
      to: graph.node(resource.kind, resource.id),
      relation: 'target',
      record: { collection: 'literaryApplications', id },
      capture: {
        scheme: 'application-source',
        originToken: null,
        identityToken: value.source.identityToken,
        versionToken: value.source.versionToken,
        revision: null,
      },
    },
  ];
  if (dep.manifest) links.push(...graph.manifest({ ...record, consumer, manifest: dep.manifest }));
  if (dep.persona) links.push(...graph.persona({ ...record, consumer, dependencies: dep.persona }));
  if (value.kind === 'autocomplete')
    links.push({
      from: graph.node('chapter', resource.id),
      to: consumer,
      relation: 'source',
      record,
      capture: {
        scheme: 'content-hash',
        originToken: null,
        identityToken: dep.chapterIdentityToken,
        versionToken: dep.beforeHash,
        revision: null,
      },
    });
  else {
    links.push({
      from: graph.node('scene', resource.id),
      to: consumer,
      relation: 'source',
      record,
      capture: {
        scheme: 'history-source',
        originToken: dep.originToken,
        identityToken: null,
        versionToken: dep.sourceToken,
        revision: dep.sourceRevision,
      },
    });
    if (dep.assemblyToken)
      links.push({
        from: graph.node('chapter', dep.chapterId),
        to: consumer,
        relation: 'source',
        record,
        capture: {
          scheme: 'prose-assembly',
          originToken: dep.originToken,
          identityToken: null,
          versionToken: dep.assemblyToken,
          revision: null,
        },
      });
    if (dep.previous)
      links.push({
        from: graph.node('scene', dep.previous.sceneId),
        to: consumer,
        relation: 'source',
        record,
        capture: {
          scheme: 'history-source',
          originToken: dep.previous.originToken,
          identityToken: null,
          versionToken: dep.previous.sourceToken,
          revision: null,
        },
      });
  }
  return {
    links,
    issues: [
      ...(!dep.manifest ? ['application-editorial-origin-not-retained'] : []),
      ...(!dep.persona ? ['persona-origin-not-inventoried'] : []),
    ],
  };
}
export async function verifyLiteraryImpactApplicationSource(tx, c, link) {
  const { from, capture } = link;
  if (
    !capture ||
    capture.scheme !== 'application-source' ||
    capture.originToken !== null ||
    capture.revision !== null ||
    capture.identityToken === null ||
    capture.versionToken === null ||
    link.record.collection !== 'literaryApplications' ||
    !Object.hasOwn(LITERARY_APPLICATION_SOURCES, from.kind) ||
    from.scopeKind !== 'book' ||
    from.scopeId !== c.target.id
  )
    return null;
  const spec = LITERARY_APPLICATION_SOURCES[from.kind],
    book = await readWorkMetadata(tx, c.ref, []),
    row = await readWorkMetadata(tx, c.db.doc(c.path + '/' + spec.requests + '/' + from.id), [
      'state',
      'paid',
      'appliedOutputToken',
    ]);
  if (!row.exists) {
    const index = (
      await readWorkMetadata(tx, c.db.doc(c.path + '/literaryApplications/' + link.record.id), [
        'version',
        'ownerId',
        'target',
        'kind',
        'operationId',
        'source',
        'destination',
        'receipt',
        'afterHash',
        'revision',
        'historical',
        'dependencies',
      ])
    ).data();
    if (!index) return { sourceAvailable: false };
    const retained = normalizeLiteraryApplicationIndex(index);
    if (
      retained.ownerId !== c.uid ||
      retained.target.id !== c.target.id ||
      retained.source.kind !== from.kind ||
      retained.source.id !== from.id ||
      retained.source.identityToken !== capture.identityToken ||
      retained.source.versionToken !== capture.versionToken
    )
      return { sourceAvailable: false };
    const receipt = (
      await readWorkMetadata(
        tx,
        c.db.doc(c.path + '/' + retained.receipt.collection + '/' + retained.receipt.id),
        receiptFields,
      )
    ).data();
    if (
      !receipt ||
      digest(literaryApplicationReceiptMetadata(retained.kind, receipt)) !== retained.receipt.token
    )
      return { sourceAvailable: false };
    return {
      sourceAvailable: true,
      identityMatches: true,
      versionMatches: true,
      liveSourceAvailable: false,
      sourceRepresentation: 'preserved-metadata',
      identityEvidence: 'native-application-receipt',
      manuscriptRead: false,
      wholeUnitRead: false,
      editorialReview: false,
      byteIntegrityChecked: false,
      historicalApplication: true,
      currentManuscriptEquivalence: 'not-checked',
    };
  }
  return {
    sourceAvailable: true,
    identityMatches:
      capture.identityToken === literaryApplicationIdentity(c, { book, node: from, row }),
    versionMatches:
      row.data().state === 'applied' &&
      row.data().paid === true &&
      capture.versionToken === row.data().appliedOutputToken,
    manuscriptRead: false,
    wholeUnitRead: false,
    editorialReview: false,
    byteIntegrityChecked: false,
    historicalApplication: true,
    currentManuscriptEquivalence: 'not-checked',
  };
}
