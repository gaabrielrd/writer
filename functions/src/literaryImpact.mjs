import { inspectLiteraryImpactCurrent } from './literaryImpactRead.mjs';
import { writeLiteraryBackupProcess } from './literaryBackupFence.mjs';
import { readLiteraryImpactNativeAuditPage } from './literaryImpactNativeAudit.mjs';
import { readLiteraryImpactLabel } from './literaryImpactLabels.mjs';
import { validateId } from './generation.mjs';
import {
  workScope,
  workId,
  workRevision,
  workLimit,
  workClosed,
  workFail,
  workDate,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { literaryNativeBirth } from './literarySourceOrigins.mjs';
import {
  literaryImpactIntent,
  readLiteraryImpactScope,
  literaryImpactBookToken,
  IMPACT_REGISTRY_TOKEN,
  IMPACT_LEGACY_COVERAGE,
  IMPACT_MAX_BOOKS,
} from './literaryImpactScope.mjs';
import { readLiteraryImpactFence } from './literaryImpactFence.mjs';
import { createLiteraryImpactGraphStore } from './literaryImpactGraph.mjs';
import { readLiteraryImpactBookInventoryPage } from './literaryImpactInventory.mjs';
import { verifyLiteraryImpactInventoryLink } from './literaryImpactRecordVerification.mjs';
import { literaryImpactLinkKey, literaryImpactCoverage } from './literaryImpactProtocol.mjs';
import {
  readLiteraryGuideDependencyBackfillSource,
  backfillLiteraryGuideDependencyIndex,
} from './literaryPublicationGuideDependencies.mjs';

const same = (a, b) => a != null && b != null && digest(a) === digest(b);
const hash = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    workFail('invalid-argument', 'Token do mapa inválido.');
  return value;
};
const closedPhases = ['done', 'partial', 'stale', 'canceled'];
const factFields = [
  'status',
  'sourceAvailable',
  'identityMatches',
  'versionMatches',
  'capturedGrantMatches',
  'sourceIdentityVerified',
  'dependencyRecordVerified',
  'identityEvidence',
  'sourceRepresentation',
  'reason',
  'manuscriptRead',
  'wholeUnitRead',
  'editorialReview',
  'byteIntegrityChecked',
];
const factsOnly = (result) =>
  Object.fromEntries(
    factFields.filter((key) => result[key] !== undefined).map((key) => [key, result[key]]),
  );
const projectionHash = (item) =>
  digest({
    token: item.recordToken,
    links: item.links.map(literaryImpactLinkKey).sort(),
    issues: [...item.issues].sort(),
  });
const freshCensus = (inventories) =>
  inventories.map((inventory) => ({
    inventory,
    scanComplete: false,
    verified: false,
    records: 0,
    unavailable: 0,
    unsupported: 0,
    unknown: 0,
    hash: digest({ domain: 'literary-impact-census-v1', inventory }),
  }));
const publicCensus = (rows) =>
  rows.map(({ hash: ignored, unknown: unknownCount, ...row }) => {
    void ignored;
    void unknownCount;
    return row;
  });
const total = (rows, key) => (rows ?? []).reduce((n, row) => n + row[key], 0);
export function createLiteraryImpactService({ db, now = Date.now }) {
  const ref = (c, kind, id) => db.doc(c.path + '/literaryImpact' + kind + '/' + workId(id));
  const operation = (c, id) => db.doc(c.path + '/literaryOperations/' + validateId(id));
  const scope = (uid, data, keys) => {
    const c = workScope(db, uid, data, keys);
    if (c.target.kind !== 'book') workFail('invalid-argument', 'O mapa exige um livro.');
    return c;
  };
  const origin = (c, row, value) =>
    digest({
      domain: 'literary-impact-control-v1',
      uid: c.uid,
      target: c.target,
      bookBirth: value.bookBirth,
      id: row.id,
      birth: literaryNativeBirth(row),
    });
  const fence = async (tx, c, job) =>
    digest({
      registry: IMPACT_REGISTRY_TOKEN,
      token: (await readLiteraryImpactFence(tx, c, { bookIds: job.bookIds })).token,
    });
  const graph = createLiteraryImpactGraphStore({ db, readFence: fence });
  const summary = (c, value, originToken, current = null) => ({
    jobId: value.jobId,
    phase: value.phase,
    revision: value.revision,
    originToken,
    bookToken: literaryImpactBookToken(c, value.bookBirth),
    bookIds: value.bookIds,
    sources: value.intent.sources,
    prepareIndices: value.prepareIndices,
    current,
    steps: value.steps,
    inventoryIndex: value.inventoryIndex,
    inventoryCount: value.inventories?.length ?? 0,
    records: total(value.census, 'records'),
    unavailable: total(value.census, 'unavailable'),
    unsupported: total(value.census, 'unsupported'),
    identityUnknown: total(value.census, 'unknown'),
    graph: value.graph ?? null,
    coverage: value.coverage ?? null,
    pendingIndex: value.preparation?.pending
      ? { bookId: value.preparation.pending.bookId, versionId: value.preparation.pending.versionId }
      : null,
    reason: value.reason ?? null,
    createdAt: value.createdAt,
    semanticCompleteness: false,
    publicationReady: false,
    authorAccepted: false,
  });
  async function root(tx, c, closing = false) {
    const row = await readWorkMetadata(tx, c.ref, ['authorId', 'deleting', 'hasLiteraryResources']);
    if (!row.exists || row.data().authorId !== c.uid || (!closing && row.data().deleting))
      workFail('not-found', 'Projeto indisponível.');
    return row;
  }
  async function load(tx, c, id, closing = false) {
    const book = await root(tx, c, closing),
      row = await tx.get(ref(c, 'Controls', id)),
      value = row.data();
    if (!value || value.uid !== c.uid) workFail('not-found', 'Mapa indisponível.');
    if (
      !same(value.bookBirth, literaryNativeBirth(book)) ||
      (value.controlBirth != null && !same(value.controlBirth, literaryNativeBirth(row))) ||
      (value.controlBirth == null && !['registering', 'canceled'].includes(value.phase))
    )
      workFail('failed-precondition', 'A origem deste mapa foi recriada.');
    return { row, value, book, originToken: origin(c, row, value) };
  }
  const current = inspectLiteraryImpactCurrent;
  async function existingReceipt(tx, c, id, fingerprint, requestHash) {
    const row = await tx.get(operation(c, id)),
      value = row.data();
    if (!value) return null;
    if (
      value.uid !== c.uid ||
      value.requestHash !== requestHash ||
      (value.fingerprint !== fingerprint &&
        !(value.status === 'canceled' && value.fingerprint === null))
    )
      workFail('invalid-argument', 'Operação usada por outro pedido.');
    return value;
  }
  function receipt(tx, c, id, context, method, fingerprint, requestHash, result) {
    tx.create(operation(c, id), {
      method,
      uid: c.uid,
      id: context.value.jobId,
      bookBirth: context.value.bookBirth,
      controlBirth: literaryNativeBirth(context.row),
      originToken: context.originToken,
      requestHash,
      fingerprint,
      status: 'done',
      result,
    });
  }
  function save(tx, c, context, next) {
    if (Buffer.byteLength(JSON.stringify(next)) > 750000)
      workFail('resource-exhausted', 'O manifesto do mapa exige uma seleção menor.');
    writeLiteraryBackupProcess(tx, c, 'impactControl', 'set', context.row.ref, next);
    return summary(c, next, context.originToken);
  }
  async function activate(tx, c, context) {
    const value = context.value;
    if (value.phase !== 'registering') return value;
    const saved = await tx.get(operation(c, value.jobId));
    if (
      !saved.exists ||
      saved.data().status !== 'registering' ||
      saved.data().fingerprint !== value.startFingerprint ||
      !same(literaryNativeBirth(saved), literaryNativeBirth(context.row))
    )
      workFail('failed-precondition', 'O registro original do mapa não está disponível.');
    const actual = await readLiteraryImpactScope(tx, c, value.intent);
    if (actual.scopeToken !== value.scopeToken)
      workFail('failed-precondition', 'O escopo do mapa mudou antes da ativação.');
    const next = {
      ...value,
      controlBirth: literaryNativeBirth(context.row),
      phase: value.prepareIndices ? 'preparing' : 'freezing',
      revision: value.revision + 1,
    };
    tx.update(saved.ref, {
      status: 'done',
      controlBirth: next.controlBirth,
      originToken: context.originToken,
    });
    return next;
  }
  function inside(value, node) {
    return node.scopeKind === 'book'
      ? value.bookIds.includes(node.scopeId)
      : node.scopeKind === 'universe'
        ? value.universeIds.includes(node.scopeId)
        : node.scopeId === value.uid;
  }
  async function step(tx, c, context) {
    const value = structuredClone(context.value);
    if (value.phase === 'registering') return activate(tx, c, context);
    if (closedPhases.includes(value.phase)) return value;
    if (value.sourceFence && value.graphBirth == null) {
      const originalGraph = await tx.get(ref(c, 'Jobs', value.jobId));
      if (
        originalGraph.exists &&
        same(literaryNativeBirth(originalGraph), [
          context.row.updateTime.seconds,
          context.row.updateTime.nanoseconds,
        ])
      )
        value.graphBirth = literaryNativeBirth(originalGraph);
    }
    if (!(await current(tx, c, value, context)))
      return { ...value, phase: 'stale', reason: 'source-fence-changed' };
    if (value.phase === 'preparing') {
      const prep = value.preparation;
      if (prep.pending) {
        const selected = workScope(
          db,
          c.uid,
          { target: { kind: 'book', id: prep.pending.bookId } },
          [],
        );
        await backfillLiteraryGuideDependencyIndex(tx, selected, {
          versionId: prep.pending.versionId,
          expectedSourceToken: prep.pending.sourceToken,
        });
        value.preparation = { ...prep, afterId: prep.pending.versionId, pending: null };
      } else if (prep.bookIndex >= value.bookIds.length) value.phase = 'freezing';
      else {
        const bookId = value.bookIds[prep.bookIndex],
          selected = workScope(db, c.uid, { target: { kind: 'book', id: bookId } }, []);
        let query = db
          .collection(selected.path + '/literaryPublicationGuideVersions')
          .orderBy('__name__')
          .limit(1)
          .select('version');
        if (prep.afterId) query = query.startAfter(prep.afterId);
        const page = await tx.get(query);
        if (!page.docs.length)
          value.preparation = { bookIndex: prep.bookIndex + 1, afterId: null, pending: null };
        else {
          const pin = await readLiteraryGuideDependencyBackfillSource(
            tx,
            selected,
            page.docs[0].id,
          );
          value.preparation = { ...prep, pending: { bookId, ...pin } };
        }
      }
      return value;
    }
    if (value.phase === 'freezing') {
      const reserved = await tx.get(ref(c, 'Jobs', value.jobId));
      if (reserved.exists)
        workFail('failed-precondition', 'Há um grafo anterior reservado para este ID.');
      const actual = await readLiteraryImpactScope(tx, c, value.intent),
        sourceFence = await fence(tx, c, value);
      value.graph = await graph.initialize(tx, c, {
        jobId: value.jobId,
        bookIds: value.bookIds,
        sourceFence,
        inventories: actual.inventories,
        sources: value.intent.sources,
      });
      return {
        ...value,
        phase: 'collecting',
        sourceFence,
        inventories: actual.inventories,
        census: freshCensus(actual.inventories),
        inventoryIndex: 0,
        afterId: null,
        pendingRecord: null,
      };
    }
    if (value.phase === 'traversing') {
      value.graph = await graph.advance(tx, c, { jobId: value.jobId });
      if (value.graph.state === 'traversed')
        return {
          ...value,
          phase: 'final-census',
          passCensus: freshCensus(value.inventories),
          inventoryIndex: 0,
          afterId: null,
          pendingRecord: null,
          nativeAuditCursor: null,
        };
      return value;
    }
    if (!['collecting', 'confirming', 'final-census'].includes(value.phase))
      workFail('failed-precondition', 'Checkpoint do mapa inválido.');
    const collecting = value.phase === 'collecting',
      rows = collecting ? value.census : value.passCensus;
    if (value.inventoryIndex >= value.inventories.length) {
      if (collecting)
        return {
          ...value,
          phase: 'confirming',
          passCensus: freshCensus(value.inventories),
          inventoryIndex: 0,
          afterId: null,
          pendingRecord: null,
          nativeAuditCursor: null,
        };
      if (value.phase === 'confirming') {
        value.graph = await graph.seal(tx, c, {
          jobId: value.jobId,
          census: publicCensus(value.census),
          allowIncomplete: true,
        });
        return { ...value, phase: 'traversing', passCensus: null, pendingRecord: null };
      }
      value.graph = await graph.finish(tx, c, {
        jobId: value.jobId,
        census: publicCensus(value.passCensus),
        allowIncomplete: true,
      });
      value.coverage = literaryImpactCoverage(value.inventories, publicCensus(value.passCensus), {
        before: value.sourceFence,
        after: value.sourceFence,
      });
      return {
        ...value,
        phase: value.coverage.complete ? 'done' : 'partial',
        passCensus: null,
        pendingRecord: null,
      };
    }
    const inventory = value.inventories[value.inventoryIndex],
      row = rows[value.inventoryIndex];
    const completeInventory = () => {
      row.scanComplete = true;
      row.verified = true;
      if (!collecting && !same(row, value.census[value.inventoryIndex]))
        return { ...value, phase: 'stale', reason: 'census-changed' };
      return {
        ...value,
        inventoryIndex: value.inventoryIndex + 1,
        afterId: null,
        pendingRecord: null,
        nativeAuditCursor: null,
      };
    };
    if (inventory.collection === IMPACT_LEGACY_COVERAGE) {
      const page = await readLiteraryImpactNativeAuditPage(tx, c, {
        bookId: inventory.scopeId,
        cursor: value.nativeAuditCursor ?? null,
      });
      const item = page.item;
      if (item) {
        if (item.link) {
          const checkId = digest({
            domain: 'literary-impact-native-audit-check-v1',
            jobId: value.jobId,
            bookId: inventory.scopeId,
            key: item.link.record.id,
          });
          const check = await tx.get(ref(c, 'Checks', checkId)),
            facts = factsOnly(item.facts),
            proofHash = digest({ token: item.token, facts, issues: item.issues });
          if (check.exists && check.data().proofHash !== proofHash)
            return { ...value, phase: 'stale', reason: 'native-audit-proof-changed' };
          if (!collecting && !check.exists)
            return { ...value, phase: 'stale', reason: 'native-audit-check-unavailable' };
          if (collecting)
            value.graph = await graph.append(tx, c, { jobId: value.jobId, links: [item.link] });
          if (collecting && !check.exists)
            tx.create(ref(c, 'Checks', checkId), {
              jobId: value.jobId,
              controlBirth: value.controlBirth,
              recordToken: item.token,
              bookId: inventory.scopeId,
              record: item.link.record,
              from: item.link.from,
              to: item.link.to,
              relation: item.link.relation,
              linkId: digest(literaryImpactLinkKey(item.link)),
              proofHash,
              facts,
            });
          row.unavailable += Number(item.facts.sourceAvailable === false);
          row.unknown++;
        }
        row.records += Number(item.relevant);
        row.unsupported += item.issues.length;
        row.hash = digest({ previous: row.hash, key: item.key, token: item.token });
      }
      value.nativeAuditCursor = page.cursor;
      return page.done ? completeInventory() : value;
    }
    if (!value.pendingRecord) {
      const page = await readLiteraryImpactBookInventoryPage(tx, c, {
        bookId: inventory.scopeId,
        collection: inventory.collection,
        afterId: value.afterId,
      });
      if (!page.items.length) return completeInventory();
      const item = page.items[0];
      value.pendingRecord = {
        id: item.record.id,
        token: item.recordToken,
        projection: projectionHash(item),
        offset: 0,
      };
    }
    const pending = value.pendingRecord;
    const page = await readLiteraryImpactBookInventoryPage(tx, c, {
      bookId: inventory.scopeId,
      collection: inventory.collection,
      recordId: pending.id,
    });
    const item = page.items[0];
    if (!item || item.recordToken !== pending.token || projectionHash(item) !== pending.projection)
      return { ...value, phase: 'stale', reason: 'record-changed' };
    if (pending.offset < item.links.length) {
      const link = item.links[pending.offset],
        linkId = digest(literaryImpactLinkKey(link));
      const included = inside(value, link.from) && inside(value, link.to);
      const facts = included
        ? factsOnly(
            await verifyLiteraryImpactInventoryLink(tx, c, {
              bookId: inventory.scopeId,
              collection: inventory.collection,
              recordId: pending.id,
              recordToken: pending.token,
              linkId,
            }),
          )
        : {
            status: 'out-of-scope',
            sourceAvailable: null,
            sourceIdentityVerified: false,
            manuscriptRead: false,
            wholeUnitRead: false,
            editorialReview: false,
            byteIntegrityChecked: false,
          };
      const checkId = digest({
        jobId: value.jobId,
        bookId: inventory.scopeId,
        collection: inventory.collection,
        recordId: pending.id,
        linkId,
      });
      const check = await tx.get(ref(c, 'Checks', checkId)),
        proofHash = digest(facts);
      if (check.exists && check.data().proofHash !== proofHash)
        return { ...value, phase: 'stale', reason: 'source-proof-changed' };
      if (!collecting && !check.exists)
        return { ...value, phase: 'stale', reason: 'check-unavailable' };
      if (collecting && included)
        value.graph = await graph.append(tx, c, { jobId: value.jobId, links: [link] });
      if (collecting && !check.exists)
        tx.create(ref(c, 'Checks', checkId), {
          jobId: value.jobId,
          controlBirth: value.controlBirth,
          recordToken: pending.token,
          bookId: inventory.scopeId,
          record: item.record,
          from: link.from,
          to: link.to,
          relation: link.relation,
          linkId,
          proofHash,
          facts,
        });
      row.unsupported += Number(!included);
      row.unavailable += Number(facts.sourceAvailable === false);
      row.unknown += Number(
        facts.sourceAvailable !== false && facts.sourceIdentityVerified !== true,
      );
      pending.offset++;
    }
    if (pending.offset === item.links.length) {
      row.hash = digest({ previous: row.hash, id: item.record.id, projection: pending.projection });
      row.records++;
      row.unsupported += item.issues.length;
      value.afterId = item.record.id;
      value.pendingRecord = null;
    }
    return value;
  }
  const startKeys = [
    'jobId',
    'bookIds',
    'sources',
    'prepareIndices',
    'expectedBookToken',
    'expectedScopeToken',
    'requestHash',
  ];
  const api = {
    async getLiteraryImpactScope(uid, data) {
      const c = scope(uid, data, ['bookIds', 'sources', 'prepareIndices']),
        intent = literaryImpactIntent(c, data);
      return db.runTransaction(async (tx) => {
        const value = await readLiteraryImpactScope(tx, c, intent);
        return {
          scopeToken: value.scopeToken,
          bookToken: value.bookToken,
          bookIds: value.bookIds,
          inventoryCount: value.inventories.length,
          registryToken: value.registryToken,
          maximumBooksPerRun: IMPACT_MAX_BOOKS,
          scope: 'registered-dependencies',
          historicalOriginCoverage: false,
          publicationReady: false,
        };
      });
    },
    async startLiteraryImpact(uid, data) {
      const c = scope(uid, data, startKeys),
        id = validateId(data.jobId),
        intent = literaryImpactIntent(c, data),
        requestHash = hash(data.requestHash);
      const expectedBookToken = hash(data.expectedBookToken),
        scopeToken = hash(data.expectedScopeToken);
      const fingerprint = digest({
        method: 'startLiteraryImpact',
        intent,
        scopeToken,
        expectedBookToken,
        requestHash,
      });
      await db.runTransaction(async (tx) => {
        const book = await root(tx, c),
          birth = literaryNativeBirth(book);
        if (literaryImpactBookToken(c, birth) !== expectedBookToken)
          workFail('failed-precondition', 'O livro original mudou.');
        const old = await tx.get(ref(c, 'Controls', id)),
          prior = await existingReceipt(tx, c, id, fingerprint, requestHash);
        if (old.exists) {
          if (old.data().startFingerprint !== fingerprint || old.data().uid !== uid)
            workFail('invalid-argument', 'Mapa usado por outro pedido.');
          return;
        }
        if (prior)
          workFail('failed-precondition', 'O registro original foi encerrado ou retirado.');
        const captured = await readLiteraryImpactScope(tx, c, intent);
        if (captured.scopeToken !== scopeToken)
          workFail('failed-precondition', 'O escopo mudou antes do registro.');
        writeLiteraryBackupProcess(tx, c, 'impactControl', 'create', ref(c, 'Controls', id), {
          version: 1,
          jobId: id,
          uid,
          bookBirth: birth,
          controlBirth: null,
          intent,
          bookIds: intent.bookIds,
          universeIds: captured.universeIds,
          prepareIndices: intent.prepareIndices,
          registryToken: IMPACT_REGISTRY_TOKEN,
          scopeToken,
          startFingerprint: fingerprint,
          phase: 'registering',
          revision: 0,
          steps: 0,
          inventoryIndex: 0,
          inventories: null,
          census: null,
          preparation: { bookIndex: 0, afterId: null, pending: null },
          createdAt: workDate(now),
        });
        tx.create(operation(c, id), {
          method: 'startLiteraryImpact',
          uid,
          id,
          bookBirth: birth,
          controlBirth: null,
          requestHash,
          fingerprint,
          status: 'registering',
        });
        if (book.data().hasLiteraryResources !== true)
          tx.update(c.ref, { hasLiteraryResources: true });
      });
      await db.runTransaction(async (tx) => {
        const context = await load(tx, c, id);
        const next = await activate(tx, c, context);
        if (next !== context.value) save(tx, c, context, next);
      });
      return api.getLiteraryImpact(uid, { target: c.target, jobId: id });
    },
    async getLiteraryImpact(uid, data) {
      const c = scope(uid, data, ['jobId', 'expectedOriginToken']);
      return db.runTransaction(async (tx) => {
        const context = await load(tx, c, validateId(data.jobId), true);
        let valid = false;
        if (
          data.expectedOriginToken != null &&
          hash(data.expectedOriginToken) !== context.originToken
        )
          workFail('failed-precondition', 'A origem observada do mapa mudou.');
        if (!context.book.data().deleting)
          try {
            valid = await current(tx, c, context.value, context);
          } catch (cause) {
            if (!['permission-denied', 'not-found', 'failed-precondition'].includes(cause.code))
              throw cause;
          }
        return summary(c, context.value, context.originToken, valid);
      });
    },
    async advanceLiteraryImpact(uid, data) {
      const c = scope(uid, data, [
          'jobId',
          'operationId',
          'expectedOriginToken',
          'expectedRevision',
          'requestHash',
        ]),
        id = validateId(data.jobId),
        operationId = validateId(data.operationId),
        requestHash = hash(data.requestHash);
      const token = hash(data.expectedOriginToken),
        revision = workRevision(data.expectedRevision),
        fingerprint = digest({ method: 'advanceLiteraryImpact', id, token, revision, requestHash });
      return db.runTransaction(async (tx) => {
        const context = await load(tx, c, id),
          old = await existingReceipt(tx, c, operationId, fingerprint, requestHash);
        if (old) {
          if (
            old.method !== 'advanceLiteraryImpact' ||
            old.id !== id ||
            !same(old.controlBirth, literaryNativeBirth(context.row))
          )
            workFail('failed-precondition', 'Origem da operação mudou.');
          return old.result;
        }
        if (context.originToken !== token || context.value.revision !== revision)
          workFail('failed-precondition', 'O checkpoint do mapa mudou.');
        if (closedPhases.includes(context.value.phase)) {
          const result = summary(c, context.value, context.originToken);
          receipt(
            tx,
            c,
            operationId,
            context,
            'advanceLiteraryImpact',
            fingerprint,
            requestHash,
            result,
          );
          return result;
        }
        const next = await step(tx, c, context);
        next.revision = context.value.revision + 1;
        next.steps = context.value.steps + 1;
        const result = save(tx, c, context, next);
        receipt(
          tx,
          c,
          operationId,
          context,
          'advanceLiteraryImpact',
          fingerprint,
          requestHash,
          result,
        );
        return result;
      });
    },
    async listLiteraryImpacts(uid, data) {
      const c = scope(uid, data, ['afterId', 'limit']),
        limit = workLimit(data.limit);
      return db.runTransaction(async (tx) => {
        const book = await root(tx, c, true);
        let query = db
          .collection(c.path + '/literaryImpactControls')
          .orderBy('__name__')
          .limit(limit);
        if (data.afterId != null) query = query.startAfter(validateId(data.afterId));
        const page = await tx.get(query);
        return {
          items: page.docs
            .filter(
              (row) =>
                row.data().uid === uid && same(row.data().bookBirth, literaryNativeBirth(book)),
            )
            .map((row) => summary(c, row.data(), origin(c, row, row.data()))),
          nextAfterId: page.docs.length === limit ? page.docs.at(-1).id : null,
        };
      });
    },
    async cancelLiteraryImpact(uid, data) {
      const c = scope(uid, data, [
          'jobId',
          'operationId',
          'expectedOriginToken',
          'start',
          'requestHash',
        ]),
        id = validateId(data.jobId),
        opId = validateId(data.operationId),
        requestHash = hash(data.requestHash);
      const token = data.expectedOriginToken == null ? null : hash(data.expectedOriginToken);
      let startIntent = null,
        startFingerprint = null,
        startHash = null;
      if (data.start != null) {
        workClosed(data.start, ['target', ...startKeys]);
        if (data.start.jobId !== id || !same(data.start.target, c.target))
          workFail('invalid-argument', 'Registro diferente.');
        startIntent = literaryImpactIntent(c, data.start);
        startHash = hash(data.start.requestHash);
        startFingerprint = digest({
          method: 'startLiteraryImpact',
          intent: startIntent,
          scopeToken: hash(data.start.expectedScopeToken),
          expectedBookToken: hash(data.start.expectedBookToken),
          requestHash: startHash,
        });
      }
      if (!token && !startIntent)
        workFail('invalid-argument', 'Informe a intenção original ou a origem do mapa.');
      const fingerprint = digest({
        method: 'cancelLiteraryImpact',
        id,
        token,
        startFingerprint,
        requestHash,
      });
      return db.runTransaction(async (tx) => {
        const book = await root(tx, c, true),
          birth = literaryNativeBirth(book),
          old = await existingReceipt(tx, c, opId, fingerprint, requestHash);
        if (old) {
          if (old.method !== 'cancelLiteraryImpact' || old.id !== id || !same(old.bookBirth, birth))
            workFail('failed-precondition', 'Origem da operação mudou.');
          return old.result;
        }
        const row = await tx.get(ref(c, 'Controls', id));
        if (!row.exists) {
          if (!startIntent || data.start.expectedBookToken !== literaryImpactBookToken(c, birth))
            workFail('failed-precondition', 'Livro original indisponível.');
          const prior = await tx.get(operation(c, id));
          if (
            prior.exists &&
            (prior.data().fingerprint !== startFingerprint ||
              prior.data().uid !== uid ||
              prior.data().method !== 'startLiteraryImpact' ||
              !same(prior.data().bookBirth, birth))
          )
            workFail('invalid-argument', 'Registro diferente.');
          const value = {
            version: 1,
            jobId: id,
            uid,
            bookBirth: birth,
            controlBirth: null,
            intent: startIntent,
            bookIds: startIntent.bookIds,
            universeIds: [],
            prepareIndices: startIntent.prepareIndices,
            registryToken: IMPACT_REGISTRY_TOKEN,
            scopeToken: data.start.expectedScopeToken,
            startFingerprint,
            phase: 'canceled',
            revision: 1,
            steps: 0,
            inventoryIndex: 0,
            inventories: null,
            census: null,
            createdAt: workDate(now),
          };
          const result = {
            jobId: id,
            phase: 'canceled',
            revision: 1,
            originToken: null,
            publicationReady: false,
          };
          if (!prior.exists)
            writeLiteraryBackupProcess(tx, c, 'impactControl', 'create', row.ref, value);
          if (book.data().hasLiteraryResources !== true)
            tx.update(c.ref, { hasLiteraryResources: true });
          if (!prior.exists)
            tx.create(operation(c, id), {
              method: 'startLiteraryImpact',
              uid,
              id,
              bookBirth: birth,
              controlBirth: null,
              requestHash: startHash,
              fingerprint: startFingerprint,
              status: 'canceled',
            });
          tx.create(operation(c, opId), {
            method: 'cancelLiteraryImpact',
            uid,
            id,
            bookBirth: birth,
            controlBirth: null,
            requestHash,
            fingerprint,
            status: 'done',
            result,
          });
          return result;
        }
        const context = await load(tx, c, id, true);
        if (
          (token && token !== context.originToken) ||
          (startFingerprint && startFingerprint !== context.value.startFingerprint)
        )
          workFail('failed-precondition', 'A intenção original do mapa mudou.');
        const savedGraph = await tx.get(ref(c, 'Jobs', id));
        const next = {
          ...context.value,
          phase: 'canceled',
          revision: context.value.revision + 1,
          controlBirth: literaryNativeBirth(context.row),
        };
        const graphMatches =
          savedGraph.exists &&
          context.value.sourceFence != null &&
          savedGraph.data().uid === uid &&
          savedGraph.data().sourceFence === context.value.sourceFence &&
          (context.value.graphBirth != null
            ? same(context.value.graphBirth, literaryNativeBirth(savedGraph))
            : same(literaryNativeBirth(savedGraph), [
                context.row.updateTime.seconds,
                context.row.updateTime.nanoseconds,
              ]));
        if (graphMatches)
          writeLiteraryBackupProcess(tx, c, 'impact', 'update', savedGraph.ref, {
            state: 'canceled',
            coverage: null,
          });
        const result = save(tx, c, context, next);
        receipt(tx, c, opId, context, 'cancelLiteraryImpact', fingerprint, requestHash, result);
        return result;
      });
    },
    async getLiteraryImpactOperation(uid, data) {
      const c = scope(uid, data, ['jobId', 'operationId', 'requestHash', 'expectedBookToken']),
        id = validateId(data.jobId),
        opId = validateId(data.operationId);
      return db.runTransaction(async (tx) => {
        const book = await root(tx, c, true),
          birth = literaryNativeBirth(book);
        if (hash(data.expectedBookToken) !== literaryImpactBookToken(c, birth))
          workFail('failed-precondition', 'O livro original mudou.');
        const row = await tx.get(operation(c, opId)),
          value = row.data();
        if (!value) return { status: 'unknown' };
        if (
          ![
            'startLiteraryImpact',
            'advanceLiteraryImpact',
            'cancelLiteraryImpact',
            'resolveLiteraryImpact',
          ].includes(value.method) ||
          value.uid !== uid ||
          value.id !== id ||
          value.requestHash !== hash(data.requestHash) ||
          !same(value.bookBirth, birth)
        )
          workFail('invalid-argument', 'A operação pertence a outro pedido.');
        return {
          status: value.status,
          method: value.method,
          result: value.result ?? null,
          originToken: value.originToken ?? null,
        };
      });
    },
    async resolveLiteraryImpact(uid, data) {
      const c = scope(uid, data, [
        'jobId',
        'operationId',
        'expectedOriginToken',
        'expectedRevision',
        'checkId',
        'observationToken',
        'expectedDecisionRevision',
        'status',
        'rationale',
        'evidence',
        'requestHash',
      ]);
      const id = validateId(data.jobId),
        opId = validateId(data.operationId),
        requestHash = hash(data.requestHash),
        token = hash(data.expectedOriginToken),
        revision = workRevision(data.expectedRevision);
      const checkId = hash(data.checkId),
        observed = hash(data.observationToken),
        decisionRevision = workRevision(data.expectedDecisionRevision);
      if (
        !['needs-review', 'reviewed', 'dismissed'].includes(data.status) ||
        typeof data.rationale !== 'string' ||
        !data.rationale.trim() ||
        !data.rationale.isWellFormed() ||
        data.rationale.length > 4000 ||
        !Array.isArray(data.evidence) ||
        data.evidence.length > 8 ||
        (['reviewed', 'dismissed'].includes(data.status) && !data.evidence.length)
      )
        workFail(
          'invalid-argument',
          'Informe uma justificativa e evidências para resolver o vínculo.',
        );
      const evidence = data.evidence.map((value) => {
        workClosed(value, ['note']);
        if (
          typeof value.note !== 'string' ||
          !value.note.trim() ||
          !value.note.isWellFormed() ||
          value.note.length > 1500
        )
          workFail('invalid-argument', 'Evidência inválida.');
        return { note: value.note };
      });
      const intent = {
        id,
        token,
        revision,
        checkId,
        observed,
        decisionRevision,
        status: data.status,
        rationale: data.rationale,
        evidence,
        requestHash,
      };
      const fingerprint = digest({ method: 'resolveLiteraryImpact', ...intent });
      return db.runTransaction(async (tx) => {
        const context = await load(tx, c, id),
          old = await existingReceipt(tx, c, opId, fingerprint, requestHash);
        if (old) {
          if (
            old.method !== 'resolveLiteraryImpact' ||
            old.id !== id ||
            !same(old.controlBirth, literaryNativeBirth(context.row))
          )
            workFail('failed-precondition', 'Origem da resolução mudou.');
          return old.result;
        }
        if (
          context.originToken !== token ||
          context.value.revision !== revision ||
          !['done', 'partial'].includes(context.value.phase) ||
          !(await current(tx, c, context.value, context))
        )
          workFail('failed-precondition', 'Reconfera o mapa atual antes de resolver este vínculo.');
        const check = await tx.get(ref(c, 'Checks', checkId)),
          value = check.data();
        if (
          !value ||
          value.jobId !== id ||
          !same(value.controlBirth, literaryNativeBirth(context.row))
        )
          workFail('not-found', 'Vínculo indisponível.');
        const proof = digest({
          domain: 'literary-impact-row-v1',
          jobId: id,
          controlBirth: literaryNativeBirth(context.row),
          stamp: {
            birth: literaryNativeBirth(check),
            changed: [check.updateTime.seconds, check.updateTime.nanoseconds],
          },
          value,
        });
        if (proof !== observed) workFail('failed-precondition', 'A verificação observada mudou.');
        const decisionId = digest({ jobId: id, checkId }),
          target = ref(c, 'Decisions', decisionId),
          previous = (await tx.get(target)).data();
        if (
          previous &&
          (previous.uid !== uid ||
            previous.jobId !== id ||
            previous.checkId !== checkId ||
            !same(previous.controlBirth, literaryNativeBirth(context.row)))
        )
          workFail('failed-precondition', 'A origem da resolução foi alterada.');
        if ((previous?.revision ?? 0) !== decisionRevision)
          workFail('failed-precondition', 'A resolução já foi alterada.');
        const nextRevision = workRevision(decisionRevision + 1),
          saved = {
            jobId: id,
            uid: c.uid,
            controlBirth: literaryNativeBirth(context.row),
            checkId,
            observationToken: observed,
            revision: nextRevision,
            status: data.status,
            rationale: data.rationale,
            evidence,
            proofHash: value.proofHash,
            updatedAt: workDate(now, previous?.updatedAt ?? 0),
            publicationReady: false,
          };
        tx.set(target, saved);
        tx.create(
          ref(c, 'DecisionVersions', digest({ jobId: id, checkId, revision: nextRevision })),
          saved,
        );
        const next = { ...context.value, revision: revision + 1 };
        save(tx, c, context, next);
        const result = {
          jobId: id,
          decisionId,
          decisionRevision: nextRevision,
          revision: next.revision,
          status: data.status,
          publicationReady: false,
        };
        receipt(tx, c, opId, context, 'resolveLiteraryImpact', fingerprint, requestHash, result);
        return result;
      });
    },
    async cancelLiteraryImpactOperation(uid, data) {
      const c = scope(uid, data, [
          'jobId',
          'operationId',
          'method',
          'requestHash',
          'expectedOriginToken',
        ]),
        id = validateId(data.jobId),
        opId = validateId(data.operationId),
        requestHash = hash(data.requestHash),
        token = hash(data.expectedOriginToken);
      if (opId === id || !['advanceLiteraryImpact', 'resolveLiteraryImpact'].includes(data.method))
        workFail('invalid-argument', 'Pedido de encerramento inválido.');
      return db.runTransaction(async (tx) => {
        const context = await load(tx, c, id, true);
        if (context.originToken !== token)
          workFail('failed-precondition', 'A origem do pedido mudou.');
        const target = operation(c, opId),
          original = (await tx.get(target)).data();
        if (original) {
          if (
            original.uid !== uid ||
            original.id !== id ||
            original.method !== data.method ||
            original.requestHash !== requestHash ||
            !same(original.bookBirth, context.value.bookBirth) ||
            !same(original.controlBirth, literaryNativeBirth(context.row))
          )
            workFail('invalid-argument', 'Outro pedido ocupa esta operação.');
          return {
            status: original.status,
            method: original.method,
            result: original.result ?? null,
            originToken: context.originToken,
          };
        }
        const result = { jobId: id, operationId: opId, operationCanceled: true };
        tx.create(target, {
          method: data.method,
          uid,
          id,
          bookBirth: context.value.bookBirth,
          controlBirth: literaryNativeBirth(context.row),
          requestHash,
          fingerprint: null,
          status: 'canceled',
          originToken: context.originToken,
          result,
        });
        return {
          status: 'canceled',
          method: data.method,
          result,
          originToken: context.originToken,
        };
      });
    },
    async readLiteraryImpactPage(uid, data) {
      const c = scope(uid, data, ['jobId', 'expectedOriginToken', 'kind', 'afterId', 'limit']),
        id = validateId(data.jobId),
        limit = workLimit(data.limit),
        expectedOrigin = hash(data.expectedOriginToken);
      const kinds = {
        nodes: 'Nodes',
        visits: 'Visits',
        checks: 'Checks',
        witnesses: 'Witnesses',
        decisions: 'Decisions',
      };
      if (!Object.hasOwn(kinds, data.kind))
        workFail('invalid-argument', 'Página de mapa inválida.');
      return db.runTransaction(async (tx) => {
        const context = await load(tx, c, id, true);
        if (context.originToken !== expectedOrigin)
          workFail('failed-precondition', 'A origem observada do mapa mudou.');
        if (
          data.kind !== 'decisions' &&
          (context.book.data().deleting || !(await current(tx, c, context.value, context)))
        )
          workFail('failed-precondition', 'Reconfera as fontes antes de abrir o mapa.');
        let query = db
          .collection(c.path + '/literaryImpact' + kinds[data.kind])
          .where('jobId', '==', id)
          .orderBy('__name__')
          .limit(limit);
        if (data.afterId != null) query = query.startAfter(workId(data.afterId));
        const page = await tx.get(query);
        const items = [];
        for (const row of page.docs) {
          const value = row.data();
          if (
            ['checks', 'decisions'].includes(data.kind) &&
            !same(value.controlBirth, literaryNativeBirth(context.row))
          )
            continue;
          const item = {
            id: row.id,
            ...value,
            observationToken: digest({
              domain: 'literary-impact-row-v1',
              jobId: id,
              controlBirth: literaryNativeBirth(context.row),
              stamp: {
                birth: literaryNativeBirth(row),
                changed: [row.updateTime.seconds, row.updateTime.nanoseconds],
              },
              value,
            }),
          };
          if (data.kind === 'checks') {
            item.sourceLabel = await readLiteraryImpactLabel(tx, c, value.from);
            item.targetLabel = await readLiteraryImpactLabel(tx, c, value.to);
            const decision = (
              await tx.get(ref(c, 'Decisions', digest({ jobId: id, checkId: row.id })))
            ).data();
            if (
              decision &&
              same(decision.controlBirth, literaryNativeBirth(context.row)) &&
              decision.uid === uid
            )
              item.decision = {
                revision: decision.revision,
                status: decision.status,
                rationale: decision.rationale,
                evidence: decision.evidence,
                updatedAt: decision.updatedAt,
              };
          } else if (data.kind === 'nodes')
            item.label = await readLiteraryImpactLabel(tx, c, value.node);
          else if (data.kind === 'visits')
            item.label = await readLiteraryImpactLabel(tx, c, value.visit.node);
          items.push(item);
        }
        return {
          items,
          nextAfterId: page.docs.length === limit ? page.docs.at(-1).id : null,
          labelsAreCurrent: true,
          semanticCompleteness: false,
          publicationReady: false,
        };
      });
    },
  };
  return api;
}
