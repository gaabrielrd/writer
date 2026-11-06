import {
  workScope,
  workProject,
  workId,
  workFail,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { literaryNativeBirth } from './literarySourceOrigins.mjs';
import { literaryChatContextIndexId } from './literaryChatContextIndex.mjs';
import { literaryChatTurnIndexId } from './literaryChatTurnIndex.mjs';
import { literaryLegacyChatIndexId } from './literaryLegacyChatIndex.mjs';
import { literaryLegacyChatApplicationId } from './literaryLegacyChatApplication.mjs';
import { literaryNativeChatApplicationId } from './literaryNativeChatApplication.mjs';
import { readLiteraryImpactChatCatalog } from './literaryImpactCatalog.mjs';
// The registry contains only projections of native headers. No question, answer,
// model body, private instruction, rationale, selection or key may enter this scan.
export const LITERARY_IMPACT_NATIVE_AUDIT = Object.freeze(
  [
    { kind: 'catalog', fields: [] },
    {
      kind: 'contexts',
      collection: 'editorChatContexts',
      fields: [
        'schemaVersion',
        'ownerId',
        'contextId',
        'summary.contextToken',
        'summary.target',
        'summary.resource',
        'summary.phase',
        'source.sourceToken',
        'closureHash',
        'cleanupId',
      ],
    },
    {
      kind: 'context-bodies',
      collection: 'editorChatContextBodies',
      fields: ['schemaVersion', 'ownerId', 'contextId', 'contextToken'],
    },
    {
      kind: 'conversations',
      collection: 'editorChats',
      fields: [
        'schemaVersion',
        'ownerId',
        'conversationId',
        'summary.target',
        'summary.resource',
        'summary.conversationToken',
        'summary.state',
        'cleanupId',
      ],
    },
    {
      kind: 'turns',
      group: 'turns',
      fields: [
        'schemaVersion',
        'ownerId',
        'conversationId',
        'conversationToken',
        'turnId',
        'summary.attemptToken',
        'summary.sourceToken',
        'summary.state',
        'closureHash',
      ],
    },
    {
      kind: 'turn-bodies',
      group: 'turnBodies',
      fields: [
        'schemaVersion',
        'ownerId',
        'conversationId',
        'conversationToken',
        'turnId',
        'attemptToken',
      ],
    },
    {
      kind: 'turn-questions',
      group: 'turnQuestions',
      fields: [
        'schemaVersion',
        'ownerId',
        'conversationId',
        'conversationToken',
        'turnId',
        'attemptToken',
      ],
    },
    {
      kind: 'operations',
      collection: 'editorChatOperations',
      fields: [
        'schemaVersion',
        'ownerId',
        'operationId',
        'action',
        'state',
        'requestHash',
        'receipt.action',
        'receipt.outcome',
        'receipt.result.kind',
        'receipt.result.conversationId',
        'receipt.result.conversationToken',
        'receipt.result.turnId',
        'receipt.result.contentHash',
        'receipt.result.revision',
      ],
    },
    { kind: 'legacy-conversations', group: 'conversations', fields: ['busy', 'deleting'] },
    {
      kind: 'legacy-messages',
      group: 'messages',
      fields: ['id', 'role', 'state', 'messageInstance', 'generationAttempt', 'revoked'],
    },
    {
      kind: 'legacy-receipts',
      group: 'receipts',
      fields: [
        'fingerprint',
        'result.updatedAt',
        'result.wordCount',
        'result.credits',
        'literaryApplication.version',
        'literaryApplication.indexId',
        'literaryApplication.metadataToken',
      ],
    },
  ].map((spec) => Object.freeze({ ...spec, fields: Object.freeze(spec.fields) })),
);
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const presentId = (value) =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.isWellFormed() &&
  !value.includes('/') &&
  Buffer.byteLength(value) <= 1500;
const same = (a, b) => digest(a ?? null) === digest(b ?? null);
const stamp = (row) => {
  const changed = row.updateTime;
  if (!Number.isSafeInteger(changed?.seconds) || !Number.isSafeInteger(changed?.nanoseconds))
    workFail('failed-precondition', 'A versão nativa da auditoria está indisponível.');
  return { birth: literaryNativeBirth(row), changed: [changed.seconds, changed.nanoseconds] };
};
const indexFields = [
  'version',
  'ownerId',
  'target',
  'resource',
  'contextId',
  'contextToken',
  'sourceToken',
  'closureHash',
  'conversationId',
  'conversationToken',
  'turnId',
  'attemptToken',
  'messageId',
  'messageInstance',
  'generationAttempt',
  'operationId',
  'requestHash',
  'native.conversationId',
  'native.conversationToken',
  'native.turnId',
  'receipt.fingerprint',
  'receipt.updatedAt',
  'receipt.wordCount',
  'receipt.credits',
  'afterHash',
  'revision',
];
async function index(tx, c, collection, id) {
  const row = await readWorkMetadata(
    tx,
    c.db.doc(c.path + '/' + collection + '/' + id),
    indexFields,
  );
  return {
    row,
    value: row.data() ?? null,
    proof: row.exists ? { stamp: stamp(row), metadata: row.data() } : null,
  };
}
const ownsIndex = (c, value) =>
  value?.version === 1 &&
  value.ownerId === c.uid &&
  value.target?.kind === 'book' &&
  value.target.id === c.target.id;
function scopeOf(c, target) {
  if (target && ['book', 'adventure'].includes(target.kind) && presentId(target.id))
    return target.kind === 'book' && target.id === c.target.id ? 'included' : 'other';
  return 'unknown';
}
function nativeOwner(c, data) {
  return data.schemaVersion === 1 && data.ownerId === c.uid;
}
function exactLegacyPath(c, path, kind) {
  const parts = path.split('/'),
    prefix = ['users', c.uid, 'chapterChats', c.target.id, 'chapters'];
  if (!prefix.every((part, i) => parts[i] === part)) return null;
  if (kind === 'legacy-receipts')
    return parts.length === 8 && parts[6] === 'receipts' ? { chapterId: workId(parts[5]) } : null;
  if (parts[6] !== 'conversations') return null;
  if (kind === 'legacy-conversations')
    return parts.length === 8
      ? { chapterId: workId(parts[5]), conversationId: workId(parts[7]) }
      : null;
  return parts.length === 10 && parts[8] === 'messages'
    ? { chapterId: workId(parts[5]), conversationId: workId(parts[7]) }
    : null;
}
function nativeTurnPath(c, path, collection = 'turns') {
  const parts = path.split('/');
  return parts.length === 6 &&
    parts[0] === 'users' &&
    parts[1] === c.uid &&
    parts[2] === 'editorChats' &&
    parts[4] === collection
    ? { conversationId: workId(parts[3]) }
    : null;
}
async function parent(tx, c, id) {
  if (!presentId(id)) return null;
  const row = await readWorkMetadata(tx, c.db.doc('users/' + c.uid + '/editorChats/' + id), [
    'schemaVersion',
    'ownerId',
    'conversationId',
    'summary.target',
    'summary.resource',
    'summary.conversationToken',
    'cleanupId',
  ]);
  return {
    row,
    data: row.data() ?? null,
    proof: row.exists ? { stamp: stamp(row), metadata: row.data() } : null,
  };
}
async function classify(tx, c, spec, row) {
  const data = row.data(),
    issues = [],
    proofs = [];
  const gap = (reason) => issues.push(reason);
  const relevant = true;
  let available = true;
  if (spec.kind === 'contexts') {
    const scope = scopeOf(c, data.summary?.target);
    if (scope === 'other') return { relevant: false, issues, proofs };
    if (scope === 'unknown' || !nativeOwner(c, data) || data.contextId !== row.id)
      gap('native-chat-context-scope-unproven');
    else if (['ready', 'consumed'].includes(data.summary.phase) && data.cleanupId === null) {
      const found = await index(
        tx,
        c,
        'literaryChatContexts',
        literaryChatContextIndexId(c.uid, row.id),
      );
      proofs.push(found.proof);
      if (
        !ownsIndex(c, found.value) ||
        found.value.contextId !== row.id ||
        !hash(data.summary.contextToken) ||
        found.value.contextToken !== data.summary.contextToken ||
        found.value.sourceToken !== data.source?.sourceToken ||
        !hash(data.source?.sourceToken) ||
        found.value.closureHash !== data.closureHash ||
        !hash(data.closureHash) ||
        !same(found.value.resource, data.summary.resource)
      )
        gap('native-chat-context-unindexed-or-mismatched');
    } else if (!['canceled', 'consumed'].includes(data.summary.phase) || data.cleanupId !== null)
      gap('native-chat-context-preparation-or-cleanup-pending');
  } else if (spec.kind === 'context-bodies') {
    const header = await readWorkMetadata(
      tx,
      c.db.doc('users/' + c.uid + '/editorChatContexts/' + row.id),
      [
        'schemaVersion',
        'ownerId',
        'contextId',
        'summary.contextToken',
        'summary.target',
        'summary.phase',
        'cleanupId',
      ],
    );
    const value = header.data();
    proofs.push(header.exists ? { stamp: stamp(header), metadata: value } : null);
    const scope = scopeOf(c, value?.summary?.target);
    if (scope === 'other') return { relevant: false, issues, proofs };
    if (
      scope === 'unknown' ||
      !nativeOwner(c, value ?? {}) ||
      value.contextId !== row.id ||
      !nativeOwner(c, data) ||
      data.contextId !== row.id ||
      !hash(data.contextToken) ||
      data.contextToken !== value.summary.contextToken ||
      !['local', 'global', 'ready'].includes(value.summary.phase) ||
      value.cleanupId !== null
    )
      gap('native-chat-context-body-orphan-or-mismatched');
    available = header.exists;
  } else if (spec.kind === 'conversations') {
    const scope = scopeOf(c, data.summary?.target);
    if (scope === 'other') return { relevant: false, issues, proofs };
    if (
      scope === 'unknown' ||
      !nativeOwner(c, data) ||
      data.conversationId !== row.id ||
      !hash(data.summary?.conversationToken)
    )
      gap('native-chat-conversation-scope-unproven');
    if (data.cleanupId !== null) gap('native-chat-conversation-cleanup-pending');
  } else if (spec.kind === 'turns') {
    const loc = nativeTurnPath(c, row.ref.path);
    if (!loc) return { relevant: false, issues, proofs };
    const owner = await parent(tx, c, loc.conversationId);
    proofs.push(owner?.proof ?? null);
    const scope = scopeOf(c, owner?.data?.summary?.target);
    if (scope === 'other') return { relevant: false, issues, proofs };
    if (
      scope === 'unknown' ||
      !nativeOwner(c, owner?.data ?? {}) ||
      !nativeOwner(c, data) ||
      data.conversationId !== loc.conversationId ||
      data.turnId !== row.id ||
      data.conversationToken !== owner.data.summary.conversationToken ||
      !hash(data.conversationToken)
    ) {
      gap('native-chat-turn-parent-or-scope-unproven');
      available = !!owner?.row.exists;
    } else {
      const found = await index(
        tx,
        c,
        'literaryChatTurns',
        literaryChatTurnIndexId(c.uid, loc.conversationId, row.id),
      );
      proofs.push(found.proof);
      if (
        !ownsIndex(c, found.value) ||
        found.value.conversationId !== loc.conversationId ||
        found.value.turnId !== row.id ||
        found.value.conversationToken !== data.conversationToken ||
        !hash(data.summary?.attemptToken) ||
        found.value.attemptToken !== data.summary.attemptToken ||
        !hash(data.summary?.sourceToken) ||
        found.value.sourceToken !== data.summary.sourceToken ||
        found.value.closureHash !== data.closureHash ||
        !hash(data.closureHash)
      )
        gap('native-chat-turn-unindexed-or-mismatched');
    }
  } else if (['turn-bodies', 'turn-questions'].includes(spec.kind)) {
    const loc = nativeTurnPath(c, row.ref.path, spec.group);
    if (!loc) return { relevant: false, issues, proofs };
    const owner = await parent(tx, c, loc.conversationId);
    proofs.push(owner?.proof ?? null);
    const scope = scopeOf(c, owner?.data?.summary?.target);
    if (scope === 'other') return { relevant: false, issues, proofs };
    const header = await readWorkMetadata(
      tx,
      c.db.doc('users/' + c.uid + '/editorChats/' + loc.conversationId + '/turns/' + row.id),
      [
        'schemaVersion',
        'ownerId',
        'conversationId',
        'conversationToken',
        'turnId',
        'summary.attemptToken',
      ],
    );
    const value = header.data();
    proofs.push(header.exists ? { stamp: stamp(header), metadata: value } : null);
    if (
      scope === 'unknown' ||
      !nativeOwner(c, owner?.data ?? {}) ||
      !nativeOwner(c, value ?? {}) ||
      !nativeOwner(c, data) ||
      data.conversationId !== loc.conversationId ||
      data.turnId !== row.id ||
      value.conversationId !== loc.conversationId ||
      value.turnId !== row.id ||
      !hash(data.conversationToken) ||
      data.conversationToken !== owner.data.summary.conversationToken ||
      data.conversationToken !== value.conversationToken ||
      !hash(data.attemptToken) ||
      data.attemptToken !== value.summary?.attemptToken
    )
      gap('native-chat-turn-sidecar-orphan-or-mismatched');
    available = !!owner?.row.exists && header.exists;
  } else if (spec.kind === 'operations') {
    if (data.action !== 'applySuggestion') return { relevant: false, issues, proofs };
    if (data.state === 'settled' && data.receipt?.outcome === 'canceled')
      return { relevant: false, issues, proofs };
    const result = data.receipt?.result,
      owner = await parent(tx, c, result?.conversationId);
    proofs.push(owner?.proof ?? null);
    const scope = scopeOf(c, owner?.data?.summary?.target);
    if (scope === 'other') return { relevant: false, issues, proofs };
    const found = await index(
      tx,
      c,
      'literaryChatApplications',
      literaryNativeChatApplicationId(c, row.id),
    );
    proofs.push(found.proof);
    if (
      !nativeOwner(c, data) ||
      data.operationId !== row.id ||
      data.state !== 'settled' ||
      data.receipt?.action !== 'applySuggestion' ||
      data.receipt?.outcome !== 'confirmed' ||
      result?.kind !== 'apply' ||
      !ownsIndex(c, found.value) ||
      found.value.operationId !== row.id ||
      found.value.requestHash !== data.requestHash ||
      found.value.native?.conversationId !== result.conversationId ||
      found.value.native?.conversationToken !== result.conversationToken ||
      found.value.native?.turnId !== result.turnId ||
      found.value.afterHash !== result.contentHash ||
      found.value.revision !== result.revision
    )
      gap(
        scope === 'unknown'
          ? 'native-chat-application-scope-or-index-unproven'
          : 'native-chat-application-unindexed-or-mismatched',
      );
  } else {
    const loc = exactLegacyPath(c, row.ref.path, spec.kind);
    if (!loc) return { relevant: false, issues, proofs };
    if (spec.kind === 'legacy-conversations') {
      if (data.deleting || data.busy === 'deleting' || data.busy === 'editing')
        gap('legacy-chat-mutation-pending');
    } else if (spec.kind === 'legacy-messages') {
      if (data.role === 'user') return { relevant: false, issues, proofs };
      if (
        data.role !== 'assistant' ||
        data.id !== row.id ||
        !presentId(data.messageInstance) ||
        !presentId(data.generationAttempt)
      )
        gap('legacy-chat-message-native-identity-unproven');
      const nativeData = {
        bookId: c.target.id,
        chapterId: loc.chapterId,
        conversationId: loc.conversationId,
      };
      const found = await index(
        tx,
        c,
        'literaryLegacyChatMessages',
        literaryLegacyChatIndexId(c.uid, nativeData, row.id),
      );
      proofs.push(found.proof);
      if (
        !ownsIndex(c, found.value) ||
        found.value.resource?.id !== loc.chapterId ||
        found.value.conversationId !== loc.conversationId ||
        found.value.messageId !== row.id ||
        found.value.messageInstance !== data.messageInstance ||
        found.value.generationAttempt !== data.generationAttempt
      )
        gap('legacy-chat-message-unindexed-or-mismatched');
      const conv = await readWorkMetadata(
        tx,
        c.db.doc(row.ref.path.split('/').slice(0, -2).join('/')),
        ['deleting', 'busy'],
      );
      proofs.push(conv.exists ? { stamp: stamp(conv), metadata: conv.data() } : null);
      if (!conv.exists) {
        gap('legacy-chat-message-parent-unavailable');
        available = false;
      }
    } else {
      const id = literaryLegacyChatApplicationId(c, row.id),
        found = await index(tx, c, 'literaryLegacyChatApplications', id);
      proofs.push(found.proof);
      if (
        !ownsIndex(c, found.value) ||
        found.value.operationId !== row.id ||
        found.value.resource?.id !== loc.chapterId ||
        data.literaryApplication?.version !== 1 ||
        data.literaryApplication.indexId !== id ||
        !hash(data.literaryApplication.metadataToken) ||
        found.value.receipt?.fingerprint !== data.fingerprint ||
        found.value.receipt?.updatedAt !== data.result?.updatedAt ||
        found.value.receipt?.wordCount !== data.result?.wordCount ||
        found.value.receipt?.credits !== data.result?.credits
      )
        gap('legacy-chat-application-unindexed-or-mismatched');
    }
  }
  return { relevant, available, issues: [...new Set(issues)], proofs };
}
/** One bounded native-header query per step, including orphaned child documents. */
export async function readLiteraryImpactNativeAuditPage(tx, c, { bookId, cursor = null }) {
  await workProject(tx, c);
  const selected = workScope(c.db, c.uid, { target: { kind: 'book', id: workId(bookId) } }, []);
  await workProject(tx, selected);
  const nativeBook = await readWorkMetadata(tx, selected.ref, []),
    bookBirth = literaryNativeBirth(nativeBook);
  const current = cursor ?? { section: 0, afterPath: null };
  if (
    !current ||
    Object.keys(current).sort().join(',') !== 'afterPath,section' ||
    !Number.isSafeInteger(current.section) ||
    current.section < 0 ||
    current.section >= LITERARY_IMPACT_NATIVE_AUDIT.length
  )
    workFail('failed-precondition', 'Cursor nativo do censo inválido.');
  const spec = LITERARY_IMPACT_NATIVE_AUDIT[current.section],
    uidRoot = 'users/' + workId(c.uid),
    nextSection = () =>
      current.section + 1 === LITERARY_IMPACT_NATIVE_AUDIT.length
        ? null
        : { section: current.section + 1, afterPath: null };
  const item = (key, metadata, classification) => {
    const token = digest({
      domain: 'literary-impact-native-audit-v1',
      uid: c.uid,
      bookId,
      bookBirth,
      spec: spec.kind,
      key,
      metadata,
      classification,
    });
    const issues = classification.issues ?? [],
      source = { kind: 'book', id: bookId, scopeKind: 'book', scopeId: bookId };
    const link = issues.length
      ? {
          from: source,
          to: {
            kind: 'chat',
            id: digest({
              domain: 'literary-impact-unindexed-native-v1',
              uid: c.uid,
              bookId,
              kind: spec.kind,
              key,
            }),
            scopeKind: 'book',
            scopeId: bookId,
          },
          relation: 'subject',
          record: { collection: 'unindexed-origin-coverage', id: digest({ kind: spec.kind, key }) },
          capture: null,
        }
      : null;
    return {
      key,
      token,
      relevant: classification.relevant !== false,
      issues,
      link,
      facts: {
        status: 'unindexed',
        sourceAvailable: classification.available !== false,
        identityMatches: null,
        versionMatches: null,
        sourceIdentityVerified: false,
        reason: issues[0] ?? null,
        manuscriptRead: false,
        wholeUnitRead: false,
        editorialReview: false,
        byteIntegrityChecked: false,
      },
    };
  };
  if (spec.kind === 'catalog') {
    if (current.afterPath !== null) workFail('failed-precondition', 'Cursor de catálogo inválido.');
    const observation = await readLiteraryImpactChatCatalog(tx, c.db, c.uid),
      next = nextSection();
    return {
      done: next === null,
      cursor: next,
      item: item('catalog', observation, {
        relevant: true,
        issues: observation.tracked ? [] : [observation.reason],
      }),
    };
  }
  const prefix = uidRoot + '/' + (spec.collection ?? '');
  let query;
  if (spec.group) {
    // References compare by path segments. UID + NUL is the immediate prefix
    // upper bound; it cannot include a neighboring UID or trust phantom parents.
    if (Buffer.byteLength(c.uid) + 1 > 1500)
      workFail('failed-precondition', 'O UID não admite limite nativo de consulta.');
    query = c.db
      .collectionGroup(spec.group)
      .where('__name__', '>', c.db.doc(uidRoot))
      .where('__name__', '<', c.db.doc(uidRoot + '\u0000'))
      .orderBy('__name__');
  } else query = c.db.collection(prefix).orderBy('__name__');
  if (current.afterPath !== null) {
    if (
      typeof current.afterPath !== 'string' ||
      !current.afterPath.startsWith((spec.group ? uidRoot : prefix) + '/') ||
      current.afterPath.split('/').length % 2 !== 0 ||
      (spec.group && current.afterPath.split('/').at(-2) !== spec.group) ||
      Buffer.byteLength(current.afterPath) > 6144
    )
      workFail('failed-precondition', 'Ponteiro nativo do censo inválido.');
    query = query.startAfter(c.db.doc(current.afterPath));
  }
  const page = await tx.get(query.limit(1).select(...spec.fields));
  if (!page.docs.length) {
    const next = nextSection();
    return { done: next === null, cursor: next, item: null };
  }
  const row = page.docs[0];
  if (!row.ref.path.startsWith(uidRoot + '/'))
    workFail('failed-precondition', 'A consulta nativa saiu da conta autorizada.');
  const classification = await classify(tx, selected, spec, row);
  return {
    done: false,
    cursor: { section: current.section, afterPath: row.ref.path },
    item: item(row.ref.path, { stamp: stamp(row), header: row.data() }, classification),
  };
}
