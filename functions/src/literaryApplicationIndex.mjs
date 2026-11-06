import { workId, workFail, digest, readWorkMetadata } from './workProgressContracts.mjs';
import { literaryNativeBirth } from './literarySourceOrigins.mjs';
import { prepareLiteraryDependencyWrite } from './literaryDependencyClock.mjs';
import { normalizeLiteraryWritingManifest } from './literaryWritingProtocol.mjs';
import { normalizeLiteraryPersonaDependencies } from './literaryPersonaDependencies.mjs';
export const LITERARY_APPLICATION_SOURCES = Object.freeze({
  prose: {
    requests: 'literaryProseRequests',
    receipts: 'literaryProseApplications',
    resource: 'scene',
  },
  autocomplete: {
    requests: 'literaryAutocompleteRequests',
    receipts: 'literaryAutocompleteApplications',
    resource: 'chapter',
  },
});
const hash = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    workFail('failed-precondition', 'Prova da aplicação inválida.');
  return value;
};
const integer = (value) => {
  if (!Number.isSafeInteger(value) || value < 0)
    workFail('failed-precondition', 'Revisão da aplicação inválida.');
  return value;
};
export const literaryApplicationIndexId = (c, kind, operationId) => {
  if (!Object.hasOwn(LITERARY_APPLICATION_SOURCES, kind))
    workFail('failed-precondition', 'Origem da aplicação inválida.');
  return digest({
    domain: 'literary-application-index-v1',
    uid: c.uid,
    target: c.target,
    kind,
    operationId: workId(operationId),
  });
};
export const literaryApplicationIdentity = (c, { book, node, row }) =>
  digest({
    domain: 'literary-application-origin-v1',
    uid: c.uid,
    target: c.target,
    bookBirth: literaryNativeBirth(book),
    node: { kind: node.kind, id: workId(node.id) },
    birth: literaryNativeBirth(row),
  });
export function literaryApplicationReceiptMetadata(kind, value) {
  const result = {
    requestId: workId(value.requestId),
    operationId: workId(value.operationId),
    fingerprint: hash(value.fingerprint),
    chapterId: workId(value.chapterId),
  };
  if (kind === 'prose')
    return {
      ...result,
      sceneId: workId(value.sceneId),
      revision: integer(value.revision),
      contentHash: hash(value.contentHash),
      previousVersionId: workId(value.previousVersionId),
      appliedAt: integer(value.appliedAt),
    };
  if (kind !== 'autocomplete' || value.state !== 'confirmed')
    workFail('failed-precondition', 'Recibo de aplicação indisponível.');
  return {
    ...result,
    state: 'confirmed',
    beforeHash: hash(value.beforeHash),
    afterHash: hash(value.afterHash),
    updatedAt: integer(value.updatedAt),
  };
}
// The source token is a hash of the accepted proposal, not a proof that the live
// manuscript still equals it. The native writer and receipt keep their contracts.
export async function prepareLiteraryApplicationIndex(tx, c, { kind, receipt, outputToken }) {
  const spec = LITERARY_APPLICATION_SOURCES[kind];
  if (!spec || c.target.kind !== 'book')
    workFail('failed-precondition', 'Aplicação fora do escopo.');
  const metadata = literaryApplicationReceiptMetadata(kind, receipt),
    source = { kind, id: metadata.requestId },
    destination = {
      kind: spec.resource,
      id: kind === 'prose' ? metadata.sceneId : metadata.chapterId,
    };
  const book = await readWorkMetadata(tx, c.ref, []);
  const request = await readWorkMetadata(
    tx,
    c.db.doc(c.path + '/' + spec.requests + '/' + source.id),
    [
      'sceneId',
      'chapterId',
      'state',
      'manifest',
      'personaDependencies',
      'chapterIdentityToken',
      'beforeHash',
      'originToken',
      'assemblyToken',
      'sourceToken',
      'sourceRevision',
      'previous',
    ],
  );
  const current = request.data();
  if (
    !current ||
    current.chapterId !== metadata.chapterId ||
    (kind === 'prose' && (current.sceneId !== metadata.sceneId || current.state !== 'done')) ||
    (kind === 'autocomplete' && current.state !== 'ready')
  )
    workFail('failed-precondition', 'A aplicação perdeu sua origem.');
  const target = await readWorkMetadata(
    tx,
    c.db.doc(c.path + '/' + (kind === 'prose' ? 'scenes' : 'chapters') + '/' + destination.id),
    [],
  );
  const sourceIdentity = literaryApplicationIdentity(c, { book, node: source, row: request }),
    destinationIdentity = literaryApplicationIdentity(c, { book, node: destination, row: target }),
    id = literaryApplicationIndexId(c, kind, metadata.operationId),
    ref = c.db.doc(c.path + '/literaryApplications/' + id);
  if ((await readWorkMetadata(tx, ref, [])).exists)
    workFail('already-exists', 'A aplicação já tem um índice.');
  const value = {
    version: 1,
    ownerId: c.uid,
    target: c.target,
    kind,
    operationId: metadata.operationId,
    source: { ...source, identityToken: sourceIdentity, versionToken: hash(outputToken) },
    destination: { ...destination, identityToken: destinationIdentity },
    receipt: { collection: spec.receipts, id: metadata.operationId, token: digest(metadata) },
    afterHash: kind === 'prose' ? metadata.contentHash : metadata.afterHash,
    revision: kind === 'prose' ? metadata.revision : null,
    historical: true,
    dependencies: {
      chapterId: metadata.chapterId,
      manifest: current.manifest ?? null,
      persona: current.personaDependencies ?? null,
      assemblyToken: kind === 'prose' ? (current.assemblyToken ?? null) : null,
      chapterIdentityToken: kind === 'autocomplete' ? (current.chapterIdentityToken ?? null) : null,
      beforeHash: kind === 'autocomplete' ? (current.beforeHash ?? null) : null,
      originToken: kind === 'prose' ? (current.originToken ?? null) : null,
      sourceToken: kind === 'prose' ? (current.sourceToken ?? null) : null,
      sourceRevision: kind === 'prose' ? (current.sourceRevision ?? null) : null,
      previous:
        kind === 'prose' && current.previous
          ? {
              sceneId: current.previous.sceneId,
              originToken: current.previous.originToken,
              sourceToken: current.previous.sourceToken,
            }
          : null,
    },
  };
  const normalized = normalizeLiteraryApplicationIndex(value);
  const clock = await prepareLiteraryDependencyWrite(tx, c);
  return {
    commit() {
      tx.create(ref, normalized);
      clock.commit();
    },
  };
}

export function normalizeLiteraryApplicationIndex(value) {
  const closed = (item, keys) => {
    if (
      !item ||
      typeof item !== 'object' ||
      Array.isArray(item) ||
      Object.keys(item).length !== keys.length ||
      keys.some((key) => !Object.hasOwn(item, key))
    )
      workFail('failed-precondition', 'Metadados da aplicação não são fechados.');
  };
  closed(value, [
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
  ]);
  closed(value.target, ['kind', 'id']);
  closed(value.source, ['kind', 'id', 'identityToken', 'versionToken']);
  closed(value.destination, ['kind', 'id', 'identityToken']);
  closed(value.receipt, ['collection', 'id', 'token']);
  if (
    value.version !== 1 ||
    value.historical !== true ||
    value.target.kind !== 'book' ||
    !Object.hasOwn(LITERARY_APPLICATION_SOURCES, value.kind)
  )
    workFail('failed-precondition', 'Formato do índice de aplicação inválido.');
  const spec = LITERARY_APPLICATION_SOURCES[value.kind],
    operationId = workId(value.operationId);
  if (
    value.source.kind !== value.kind ||
    value.destination.kind !== spec.resource ||
    value.receipt.collection !== spec.receipts ||
    value.receipt.id !== operationId ||
    (value.kind === 'autocomplete' && value.revision !== null)
  )
    workFail('failed-precondition', 'Origens do índice de aplicação divergentes.');
  closed(value.dependencies, [
    'chapterId',
    'manifest',
    'persona',
    'assemblyToken',
    'chapterIdentityToken',
    'beforeHash',
    'originToken',
    'sourceToken',
    'sourceRevision',
    'previous',
  ]);
  const dependencies = {
    chapterId: workId(value.dependencies.chapterId),
    assemblyToken:
      value.dependencies.assemblyToken === null ? null : hash(value.dependencies.assemblyToken),
    manifest:
      value.dependencies.manifest === null
        ? null
        : normalizeLiteraryWritingManifest(value.dependencies.manifest),
    persona:
      value.dependencies.persona === null
        ? null
        : normalizeLiteraryPersonaDependencies(value.dependencies.persona),
    chapterIdentityToken:
      value.dependencies.chapterIdentityToken === null
        ? null
        : hash(value.dependencies.chapterIdentityToken),
    beforeHash: value.dependencies.beforeHash === null ? null : hash(value.dependencies.beforeHash),
    originToken:
      value.dependencies.originToken === null ? null : hash(value.dependencies.originToken),
    sourceToken:
      value.dependencies.sourceToken === null ? null : hash(value.dependencies.sourceToken),
    sourceRevision:
      value.dependencies.sourceRevision === null
        ? null
        : integer(value.dependencies.sourceRevision),
    previous: null,
  };
  if (value.dependencies.previous !== null) {
    closed(value.dependencies.previous, ['sceneId', 'originToken', 'sourceToken']);
    dependencies.previous = {
      sceneId: workId(value.dependencies.previous.sceneId),
      originToken: hash(value.dependencies.previous.originToken),
      sourceToken: hash(value.dependencies.previous.sourceToken),
    };
  }
  if (
    (dependencies.manifest &&
      (dependencies.manifest.target.id !== value.target.id ||
        dependencies.manifest.resource.kind !== value.destination.kind ||
        dependencies.manifest.resource.id !== value.destination.id)) ||
    (dependencies.persona &&
      (dependencies.persona.ownerId !== value.ownerId ||
        dependencies.persona.target.id !== value.target.id ||
        dependencies.persona.resource.kind !== value.destination.kind ||
        dependencies.persona.resource.id !== value.destination.id))
  )
    workFail('failed-precondition', 'As fontes preservadas pertencem a outra unidade.');
  return {
    version: 1,
    ownerId: workId(value.ownerId),
    target: { kind: 'book', id: workId(value.target.id) },
    kind: value.kind,
    operationId,
    source: {
      kind: value.kind,
      id: workId(value.source.id),
      identityToken: hash(value.source.identityToken),
      versionToken: hash(value.source.versionToken),
    },
    destination: {
      kind: spec.resource,
      id: workId(value.destination.id),
      identityToken: hash(value.destination.identityToken),
    },
    receipt: { collection: spec.receipts, id: operationId, token: hash(value.receipt.token) },
    afterHash: hash(value.afterHash),
    revision: value.kind === 'prose' ? integer(value.revision) : null,
    historical: true,
    dependencies,
  };
}
