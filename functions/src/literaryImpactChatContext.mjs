import { workFail, readWorkMetadata, digest } from './workProgressContracts.mjs';
import { verifyEditorChatClosure, canonicalEditorChatJSON } from './editorChatContracts.mjs';
import { literaryChatContextIndexId } from './literaryChatContextIndex.mjs';
import { normalizeLiteraryChatLoreDependencies } from './literaryChatLoreDependencies.mjs';

const same = (left, right) => canonicalEditorChatJSON(left) === canonicalEditorChatJSON(right);
// Reconcile the book-side index with the native private header before producing
// candidates. Absence of an index does NOT imply absence of private conversations.
export async function readLiteraryImpactChatContext(tx, c, graph, { id, data }) {
  if (
    data.version !== 1 ||
    data.ownerId !== c.uid ||
    data.target?.kind !== 'book' ||
    data.target.id !== c.target.id ||
    data.resource?.kind !== 'scene' ||
    literaryChatContextIndexId(c.uid, data.contextId) !== id
  )
    workFail('failed-precondition', 'Origem do índice privado de chat inválida.');
  const row = await readWorkMetadata(
    tx,
    c.db.doc('users/' + c.uid + '/editorChatContexts/' + data.contextId),
    [
      'schemaVersion',
      'ownerId',
      'contextId',
      'summary.contextToken',
      'summary.phase',
      'summary.target',
      'summary.resource',
      'source.sourceToken',
      'closureHash',
      'closureManifest',
      'cleanupId',
    ],
  );
  const current = row.data();
  if (
    !current ||
    current.schemaVersion !== 1 ||
    current.ownerId !== c.uid ||
    current.contextId !== data.contextId ||
    current.summary?.contextToken !== data.contextToken ||
    !['ready', 'consumed'].includes(current.summary?.phase) ||
    current.cleanupId !== null ||
    !same(current.summary.target, data.target) ||
    !same(current.summary.resource, data.resource) ||
    current.closureHash !== data.closureHash ||
    current.source?.sourceToken !== data.sourceToken ||
    !same(current.closureManifest, data.closureManifest)
  )
    return { links: [], issues: ['native-chat-context-unavailable-or-changed'] };
  if (data.closureManifest?.version !== 1)
    workFail('failed-precondition', 'Fechamento do chat inválido.');
  const closure = await verifyEditorChatClosure(
    { schemaVersion: 1, leaves: data.closureManifest.leaves, closureHash: data.closureHash },
    { ownerId: c.uid, target: c.target, resource: data.resource },
  );
  return projectLiteraryImpactChatOrigins(graph, c, { id, data, closure });
}
export function projectLiteraryImpactChatOrigins(
  graph,
  c,
  { id, data, closure, collection = 'literaryChatContexts', consumerId = id },
) {
  const issues = [],
    links = [];
  const targets = closure.leaves.filter((leaf) => leaf.kind === 'target');
  if (targets.length !== 1 || !same(targets[0].resource, data.resource))
    workFail('failed-precondition', 'O contexto não corresponde à unidade nativa.');
  const loreDependencies =
    data.loreDependencies === undefined
      ? null
      : normalizeLiteraryChatLoreDependencies(data.loreDependencies, closure);
  const record = { collection, id },
    consumer = graph.node('chat', consumerId);
  for (const leaf of closure.leaves) {
    if (leaf.kind === 'literary')
      links.push(...graph.manifest({ ...record, consumer, manifest: leaf.manifest }));
    if (leaf.kind === 'target')
      links.push({
        from: graph.node('scene', leaf.resource.id),
        to: consumer,
        relation: 'source',
        record,
        capture: {
          scheme: 'native-chat-target',
          originToken: leaf.projectToken,
          identityToken: leaf.resourceToken,
          versionToken: data.sourceToken,
          revision: null,
        },
      });
    if (leaf.kind === 'lore') {
      const ref = leaf.reference,
        global = ref.kind === 'universe';
      if (!global && (ref.kind !== 'book' || ref.scopeId !== c.target.id))
        workFail('failed-precondition', 'Origem de lore do chat inválida.');
      const captured = loreDependencies?.find((entry) => same(entry.reference, ref));
      links.push({
        from: graph.node(global ? 'globalLore' : 'localLore', ref.entityId, ref.scopeId),
        to: consumer,
        relation: 'source',
        record,
        capture: {
          scheme: captured ? 'native-chat-lore' : 'unknown',
          originToken: leaf.scopeToken,
          identityToken: leaf.entityIdentityToken,
          versionToken: captured?.versionToken ?? null,
          revision: null,
        },
      });
      if (!captured) issues.push('native-chat-lore-version-not-recorded');
    }
  }
  if (
    !data.personaDependencies ||
    digest(data.personaDependencies.resource) !== digest(data.resource)
  )
    issues.push('persona-origin-not-inventoried');
  else
    links.push(...graph.persona({ ...record, consumer, dependencies: data.personaDependencies }));
  return { links, issues: [...new Set(issues)] };
}
