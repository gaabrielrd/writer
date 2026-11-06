import {
  LITERARY_IMPACT_PROCESS_FIELDS,
  readLiteraryImpactProcessRecord,
} from './literaryImpactProcessInventory.mjs';
import {
  workScope,
  workProject,
  workId,
  workFail,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { createLiteraryImpactLinks } from './literaryImpactLinks.mjs';
import { readLiteraryImpactChatContext } from './literaryImpactChatContext.mjs';
import { readLiteraryImpactChatTurn } from './literaryImpactChatTurn.mjs';
import { readLiteraryImpactLegacyChat } from './literaryImpactLegacyChat.mjs';
import { readLiteraryImpactLegacyChatApplication } from './literaryImpactLegacyChatApplication.mjs';
import { LITERARY_LEGACY_CHAT_APPLICATION_FIELDS } from './literaryLegacyChatApplication.mjs';
import { LITERARY_LEGACY_CHAT_INDEX_FIELDS } from './literaryLegacyChatIndex.mjs';
import { readLiteraryImpactApplication } from './literaryImpactApplication.mjs';
import {
  readLiteraryImpactNativeChatApplication,
  LITERARY_NATIVE_CHAT_APPLICATION_FIELDS,
} from './literaryImpactNativeChatApplication.mjs';
import { normalizeLiteraryImpactLink, literaryImpactLinkKey } from './literaryImpactProtocol.mjs';

// This is the supported BOOK metadata inventory, not the full project census.
// Chat lifecycle/origin indexes, persona origins, publication manifests, and
// source-identity verification remain mandatory orchestration capabilities.
const specifications = Object.freeze({
  ...LITERARY_IMPACT_PROCESS_FIELDS,
  acts: ['deleting'],
  arcs: ['deleting'],
  timelineEvents: ['deleting'],
  chapters: ['bookId', 'actId', 'contentMode', 'deleting'],
  scenes: ['ownerId', 'parentId', 'archived', 'deleting'],
  literaryPlans: ['revision', 'plan.references'],
  literaryGenerations: ['dependencies', 'state'],
  literaryChatContexts: [
    'version',
    'ownerId',
    'target',
    'resource',
    'contextId',
    'contextToken',
    'sourceToken',
    'closureHash',
    'closureManifest',
    'personaDependencies',
    'loreDependencies',
  ],
  literaryChatTurns: [
    'version',
    'ownerId',
    'target',
    'resource',
    'conversationId',
    'conversationToken',
    'turnId',
    'attemptToken',
    'sourceToken',
    'closureHash',
    'closureManifest',
    'contextOrigins',
    'historyOrigins',
  ],
  literaryChatApplications: LITERARY_NATIVE_CHAT_APPLICATION_FIELDS,
  literaryLegacyChatMessages: LITERARY_LEGACY_CHAT_INDEX_FIELDS,
  literaryLegacyChatApplications: LITERARY_LEGACY_CHAT_APPLICATION_FIELDS,
  literaryApplications: [
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
  ],
  sceneLoreLinks: ['sceneId', 'reference'],
  narrativeLinks: ['source', 'reference'],
  literaryPreparationGates: ['manifest'],
  literaryDraftJobs: ['chapterId', 'personaDependencies'],
  literaryReviewJobs: ['chapterId', 'planIds', 'personaDependencies'],
  literaryMilestones: ['chapterId'],
  literaryProseRequests: [
    'manifest',
    'chapterId',
    'sceneId',
    'originToken',
    'assemblyToken',
    'sourceToken',
    'sourceRevision',
    'previous',
    'persona.identityToken',
    'persona.versionToken',
    'personaDependencies',
  ],
  literaryAutocompleteRequests: [
    'manifest',
    'chapterId',
    'chapterIdentityToken',
    'beforeHash',
    'persona.identityToken',
    'persona.versionToken',
    'personaDependencies',
  ],
  literaryIntegrationJobs: ['level', 'actId', 'planIds'],
  literaryIntegrationUnitLinks: ['jobId', 'resource'],
  literaryIntegrationSourceLinks: [
    'jobId',
    'target',
    'scheme',
    'originToken',
    'identityToken',
    'revision',
    'versionToken',
  ],
  literaryFindingDecisions: [
    'source.jobId',
    'target',
    'baseline.identityToken',
    'baseline.versionToken',
    'baseline.revision',
    'correction.successorJobId',
  ],
});
export const LITERARY_IMPACT_BOOK_INVENTORIES = Object.freeze(Object.keys(specifications));
const stamps = (row) => {
  const born = row.createTime,
    changed = row.updateTime;
  if (
    !Number.isSafeInteger(born?.seconds) ||
    !Number.isSafeInteger(born?.nanoseconds) ||
    !Number.isSafeInteger(changed?.seconds) ||
    !Number.isSafeInteger(changed?.nanoseconds)
  )
    workFail('failed-precondition', 'A identidade do registro de dependências está indisponível.');
  return {
    born: [born.seconds, born.nanoseconds],
    changed: [changed.seconds, changed.nanoseconds],
  };
};
export async function readLiteraryImpactBookInventoryPage(
  tx,
  c,
  { bookId, collection, afterId = null, recordId = null },
) {
  // The registry chooses the projection. A caller cannot request manuscript,
  // prompts, rationale, reports, question text or provider credentials.
  if (!Object.hasOwn(specifications, collection))
    workFail('invalid-argument', 'Inventário literário não suportado.');
  const source = workScope(c.db, c.uid, { target: { kind: 'book', id: workId(bookId) } }, []);
  await workProject(tx, c);
  const root = await workProject(tx, source);
  const book = await readWorkMetadata(tx, source.ref, []);
  const bookToken = digest({
    domain: 'literary-writing-book-v1',
    uid: c.uid,
    target: source.target,
    birth: stamps(book).born,
  });
  const graph = createLiteraryImpactLinks({
    bookId,
    universeId: root.universeId ?? null,
    bookToken,
    ownerId: c.uid,
  });
  let query = c.db
    .collection(source.path + '/' + collection)
    .orderBy('__name__')
    .limit(1)
    .select(...specifications[collection]);
  if (recordId !== null) {
    if (afterId !== null)
      workFail('invalid-argument', 'Não combine consulta de registro e cursor.');
    query = query.where('__name__', '==', workId(recordId));
  } else if (afterId !== null) query = query.startAfter(workId(afterId));
  const page = await tx.get(query),
    items = [];
  for (const row of page.docs) {
    const data = row.data(),
      record = { collection, id: row.id },
      issues = [],
      links = [];
    const add = (from, to, relation = 'source', capture = null) =>
      links.push(normalizeLiteraryImpactLink({ from, to, relation, record, capture }));
    try {
      if (Object.hasOwn(LITERARY_IMPACT_PROCESS_FIELDS, collection)) {
        const projected = await readLiteraryImpactProcessRecord(tx, source, graph, {
          collection,
          id: row.id,
          data,
          bookBirth: stamps(book).born,
          recordBirth: stamps(row).born,
        });
        links.push(...projected.links);
        issues.push(...projected.issues);
      } else if (['acts', 'arcs', 'timelineEvents', 'chapters', 'scenes'].includes(collection)) {
        if (collection === 'chapters' && data.bookId != null && data.bookId !== bookId)
          workFail('permission-denied', 'Um capítulo pertence a outro livro.');
        if (collection === 'scenes') {
          if (data.ownerId !== c.uid) workFail('permission-denied', 'Cena de outra autoria.');
          data.parentActive = false;
          if (data.parentId && !data.archived && !data.deleting) {
            const parent = await readWorkMetadata(
              tx,
              c.db.doc(source.path + '/chapters/' + workId(data.parentId)),
              ['bookId', 'deleting', 'contentMode'],
            );
            data.parentActive =
              parent.exists &&
              !parent.data().deleting &&
              parent.data().contentMode === 'scenes' &&
              (parent.data().bookId == null || parent.data().bookId === bookId);
          }
        }
        links.push(...graph.structural({ ...record, data }));
      } else if (collection === 'literaryPlans')
        links.push(...graph.plan({ id: row.id, revision: data.revision, plan: data.plan }));
      else if (collection === 'literaryGenerations') {
        if (data.dependencies) {
          if (digest(data.dependencies.bookBirth) !== digest(stamps(book).born))
            issues.push('generation-book-origin-changed');
          else links.push(...graph.generation({ id: row.id, dependencies: data.dependencies }));
        } else if (data.state !== 'canceled') issues.push('generation-dependencies-not-recorded');
      } else if (collection === 'literaryChatContexts') {
        const projected = await readLiteraryImpactChatContext(tx, source, graph, {
          id: row.id,
          data,
        });
        links.push(...projected.links);
        issues.push(...projected.issues);
      } else if (collection === 'literaryChatTurns') {
        const projected = await readLiteraryImpactChatTurn(tx, source, graph, { id: row.id, data });
        links.push(...projected.links);
        issues.push(...projected.issues);
      } else if (collection === 'literaryLegacyChatApplications') {
        const projected = await readLiteraryImpactLegacyChatApplication(tx, source, graph, {
          id: row.id,
          data,
        });
        links.push(...projected.links);
        issues.push(...projected.issues);
      } else if (collection === 'literaryLegacyChatMessages') {
        const projected = await readLiteraryImpactLegacyChat(tx, source, graph, {
          id: row.id,
          data,
        });
        links.push(...projected.links);
        issues.push(...projected.issues);
      } else if (collection === 'literaryChatApplications') {
        const projected = await readLiteraryImpactNativeChatApplication(tx, source, graph, {
          id: row.id,
          data,
        });
        links.push(...projected.links);
        issues.push(...projected.issues);
      } else if (collection === 'literaryApplications') {
        const projected = await readLiteraryImpactApplication(tx, source, graph, {
          id: row.id,
          data,
        });
        links.push(...projected.links);
        issues.push(...projected.issues);
      } else if (collection === 'sceneLoreLinks')
        links.push(...graph.nativeLore({ id: row.id, ...data }));
      else if (collection === 'narrativeLinks')
        links.push(...graph.narrative({ id: row.id, ...data }));
      else if (collection === 'literaryPreparationGates') {
        if (data.manifest)
          links.push(...graph.preparation({ id: row.id, manifest: data.manifest }));
      } else if (
        ['literaryDraftJobs', 'literaryReviewJobs', 'literaryMilestones'].includes(collection)
      ) {
        if (data.chapterId) {
          const kind =
            collection === 'literaryDraftJobs'
              ? 'draft'
              : collection === 'literaryReviewJobs'
                ? 'review'
                : 'milestone';
          links.push(
            ...graph.chapterArtifact({
              ...record,
              kind,
              chapterId: data.chapterId,
              planIds: data.planIds ?? [],
            }),
          );
        }
      } else if (['literaryProseRequests', 'literaryAutocompleteRequests'].includes(collection)) {
        if (data.manifest) {
          const consumer = graph.node(
            collection === 'literaryProseRequests' ? 'prose' : 'autocomplete',
            row.id,
          );
          links.push(...graph.manifest({ ...record, consumer, manifest: data.manifest }));
          if (collection === 'literaryProseRequests') {
            if (data.chapterId && data.originToken && data.assemblyToken)
              add(graph.node('chapter', data.chapterId), consumer, 'source', {
                scheme: 'prose-assembly',
                originToken: data.originToken,
                identityToken: null,
                versionToken: data.assemblyToken,
                revision: null,
              });
            if (data.sceneId)
              add(graph.node('scene', data.sceneId), consumer, 'source', {
                scheme: 'history-source',
                originToken: data.originToken ?? null,
                identityToken: null,
                versionToken: data.sourceToken ?? null,
                revision: data.sourceRevision ?? null,
              });
            if (data.previous?.sceneId)
              add(graph.node('scene', data.previous.sceneId), consumer, 'source', {
                scheme: 'history-source',
                originToken: data.previous.originToken ?? null,
                identityToken: null,
                versionToken: data.previous.sourceToken ?? null,
                revision: null,
              });
          } else if (data.chapterId)
            add(graph.node('chapter', data.chapterId), consumer, 'source', {
              scheme: 'content-hash',
              originToken: null,
              identityToken: data.chapterIdentityToken ?? null,
              versionToken: data.beforeHash ?? null,
              revision: null,
            });
        }
      } else if (collection === 'literaryIntegrationJobs') {
        if (data.level) {
          const consumer = graph.node('integration', row.id);
          if (data.level === 'act' && data.actId) add(graph.node('act', data.actId), consumer);
          else if (data.level === 'book') add(graph.node('book', bookId), consumer);
          else throw new TypeError('Escopo da integração inválido.');
          for (const id of data.planIds ?? []) add(graph.node('plan', id), consumer);
        }
      } else if (collection === 'literaryIntegrationUnitLinks')
        links.push(...graph.integrationUnit({ id: row.id, ...data }));
      else if (collection === 'literaryIntegrationSourceLinks')
        links.push(...graph.integrationSource({ id: row.id, ...data }));
      else if (collection === 'literaryFindingDecisions')
        links.push(...graph.finding({ id: row.id, ...data }));
      const personaKinds = {
        literaryProseRequests: 'prose',
        literaryAutocompleteRequests: 'autocomplete',
        literaryDraftJobs: 'draft',
        literaryReviewJobs: 'review',
      };
      if (Object.hasOwn(personaKinds, collection) && (data.manifest || data.chapterId)) {
        if (data.personaDependencies) {
          const resource =
            collection === 'literaryProseRequests'
              ? { kind: 'scene', id: data.sceneId }
              : { kind: 'chapter', id: data.chapterId };
          if (digest(resource) !== digest(data.personaDependencies.resource))
            issues.push('persona-resource-mismatch');
          else {
            try {
              links.push(
                ...graph.persona({
                  collection,
                  id: row.id,
                  consumer: graph.node(personaKinds[collection], row.id),
                  dependencies: data.personaDependencies,
                }),
              );
            } catch (cause) {
              if (
                !(cause instanceof TypeError) &&
                !['failed-precondition', 'invalid-argument', 'permission-denied'].includes(
                  cause.code,
                )
              )
                throw cause;
              issues.push('persona-dependencies-invalid');
            }
          }
        } else issues.push('persona-origin-not-inventoried');
      }
    } catch (cause) {
      if (
        !(cause instanceof TypeError) &&
        !(
          Object.hasOwn(LITERARY_IMPACT_PROCESS_FIELDS, collection) &&
          ['failed-precondition', 'invalid-argument', 'permission-denied', 'not-found'].includes(
            cause.code,
          )
        ) &&
        !(
          [
            'literaryGenerations',
            'literaryChatContexts',
            'literaryChatTurns',
            'literaryApplications',
            'literaryChatApplications',
            'literaryLegacyChatMessages',
            'literaryLegacyChatApplications',
          ].includes(collection) && cause.code === 'failed-precondition'
        )
      )
        throw cause;
      links.length = 0;
      issues.push('invalid-or-unavailable-dependency-metadata');
    }
    const distinct = [
      ...new Map(links.map((link) => [literaryImpactLinkKey(link), link])).values(),
    ];
    if (
      distinct.length >
      (collection === 'literarySequenceJobs' || collection.startsWith('literaryPublicationGuide')
        ? 128
        : 64)
    )
      workFail('resource-exhausted', 'O registro exige paginação adicional de vínculos.');
    items.push({
      record,
      recordToken: digest({
        domain: 'literary-impact-inventory-record-v1',
        uid: c.uid,
        bookId,
        bookBirth: stamps(book).born,
        id: row.id,
        collection,
        stamp: stamps(row),
        metadata: data,
      }),
      links: distinct,
      issues,
      sourceIdentitiesVerified: false,
    });
  }
  // Even an empty page only ends this collection. It never proves the complete
  // project inventory or the current authorization of captured historical origins.
  return {
    items,
    nextAfterId: recordId === null && page.docs.length === 1 ? page.docs[0].id : null,
    collectionComplete: recordId === null && page.docs.length === 0,
    wholeProject: false,
  };
}
