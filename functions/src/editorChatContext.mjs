import { randomBytes as secureRandomBytes } from 'node:crypto';
import { readWorkMetadata } from './workProgressContracts.mjs';
import {
  editorChatFail,
  editorChatSourceId,
  editorChatClosed,
  editorChatRevision,
  editorChatHashToken,
  editorChatHash,
  editorChatControlToken,
  editorChatBindingToken,
  canonicalEditorChatJSON,
  verifyEditorChatRequest,
  normalizeEditorChatDTO,
  nextEditorChatRevision,
  verifyEditorChatSnapshot,
  normalizeEditorChatCapture,
  normalizeEditorChatPersonaComplement,
  assertEditorChatEnvelope,
} from './editorChatContracts.mjs';
import {
  createEditorChatLoreAccumulator,
  advanceEditorChatLoreAccumulator,
  finishEditorChatLoreAccumulator,
} from './editorChatMatcher.mjs';
import {
  readEditorChatOperation,
  writeEditorChatReceipt,
  resolveEditorChatOperation,
} from './editorChatOperations.mjs';
import {
  readEditorChatSource,
  readEditorChatEnvironment,
  readEditorChatPersona,
  readEditorChatProject,
  readEditorChatScene,
  readEditorChatLorePage,
  readEditorChatLoreSnapshot,
  editorChatDirectClosure,
  authorizeEditorChatManifest,
  editorChatNativeStamp,
} from './editorChatContextRead.mjs';
import {
  readEditorChatCleanup,
  prepareEditorChatContextDeletion,
  advanceEditorChatCleanup,
} from './editorChatCleanup.mjs';

export const EDITOR_CHAT_CONTEXT_ACTIONS = Object.freeze([
  'prepareContext',
  'advanceContext',
  'getContext',
  'inspectContext',
  'getAdventurePersonaBinding',
  'setAdventurePersonaBinding',
  'deleteContext',
  'getCleanup',
  'advanceCleanup',
  'resolveOperation',
]);
const same = (a, b) => canonicalEditorChatJSON(a) === canonicalEditorChatJSON(b);
const contextRef = (db, uid, id) => db.doc(`users/${uid}/editorChatContexts/${id}`);
const bodyRef = (db, uid, id) => db.doc(`users/${uid}/editorChatContextBodies/${id}`);
const scopeOf = (summary) => ({ target: summary.target, resource: summary.resource });
const resultOf = (s) => ({
  kind: 'context',
  contextId: s.contextId,
  contextToken: s.contextToken,
  revision: s.revision,
  phase: s.phase,
});
const cleanupResult = (s) => ({
  kind: 'cleanup',
  cleanupId: s.cleanupId,
  cleanupToken: s.cleanupToken,
  revision: s.revision,
  state: s.state,
  phase: s.phase,
  deletedDocuments: s.deletedDocuments,
});
function time(now, previous = 0) {
  const value = Math.max(now(), previous + 1);
  if (!Number.isSafeInteger(value) || value < 0 || value > 8640000000000000)
    editorChatFail('inconsistent');
  return value;
}
function baseMatches(source, base) {
  return same(
    { sourceToken: source.sourceToken, revision: source.revision, bodyHash: source.bodyHash },
    base,
  );
}

export async function readEditorChatContext(tx, db, uid, id, token, scope) {
  const ref = contextRef(db, uid, id),
    record = (await tx.get(ref)).data();
  if (!record || record.ownerId !== uid) editorChatFail('context-unavailable');
  try {
    editorChatClosed(record, [
      'schemaVersion',
      'ownerId',
      'contextId',
      'birthNonce',
      'summary',
      'source',
      'proofCoverage',
      'closureManifest',
      'closureHash',
      'cursor',
      'cleanupId',
    ]);
    const summary = normalizeEditorChatDTO('context', record.summary);
    if (
      record.schemaVersion !== 1 ||
      record.contextId !== id ||
      summary.contextId !== id ||
      summary.ownerId !== uid ||
      (scope && !same(scopeOf(summary), scope))
    )
      editorChatFail('inconsistent');
    const expected = await editorChatControlToken('context', {
      ownerId: uid,
      contextId: id,
      birthNonce: record.birthNonce,
      projectToken: summary.projectToken,
      resourceToken: summary.resourceToken,
    });
    if (expected !== summary.contextToken) editorChatFail('inconsistent');
    if (token !== undefined && token !== expected) editorChatFail('identity-changed');
    if (record.cursor !== null) editorChatSourceId(record.cursor);
    if (record.cleanupId !== null && typeof record.cleanupId !== 'string')
      editorChatFail('inconsistent');
    if (summary.phase !== 'deleted') {
      const source = normalizeEditorChatDTO('source', record.source);
      if (
        !same(scopeOf(source), scopeOf(summary)) ||
        source.projectToken !== summary.projectToken ||
        source.resourceToken !== summary.resourceToken ||
        !record.proofCoverage
      )
        editorChatFail('inconsistent');
    } else if (
      record.source !== null ||
      record.proofCoverage !== null ||
      record.closureManifest !== null ||
      record.closureHash !== null
    )
      editorChatFail('inconsistent');
    return { ref, record, summary };
  } catch (error) {
    editorChatFail(
      error.details?.reason === 'identity-changed' ? 'identity-changed' : 'inconsistent',
    );
  }
}
async function coverage(tx, db, source) {
  const environment = await readEditorChatEnvironment(tx, db, source),
    persona = await readEditorChatPersona(tx, db, source);
  return {
    environment,
    persona,
    proof: { source: source.source, environment, persona: persona.proof },
  };
}
async function readTemporaryBody(tx, db, uid, context) {
  const v = (await tx.get(bodyRef(db, uid, context.summary.contextId))).data();
  try {
    editorChatClosed(v, [
      'schemaVersion',
      'ownerId',
      'contextId',
      'contextToken',
      'capture',
      'accumulator',
    ]);
    if (
      v.schemaVersion !== 1 ||
      v.ownerId !== uid ||
      v.contextId !== context.summary.contextId ||
      v.contextToken !== context.summary.contextToken
    )
      editorChatFail('inconsistent');
    normalizeEditorChatCapture(v.capture);
    assertEditorChatEnvelope(v);
  } catch {
    editorChatFail('inconsistent');
  }
  return v;
}
async function readFrozenBody(tx, db, uid, context) {
  const v = (await tx.get(bodyRef(db, uid, context.summary.contextId))).data();
  try {
    editorChatClosed(v, ['schemaVersion', 'ownerId', 'contextId', 'contextToken', 'frozen']);
    if (
      v.schemaVersion !== 1 ||
      v.ownerId !== uid ||
      v.contextId !== context.summary.contextId ||
      v.contextToken !== context.summary.contextToken
    )
      editorChatFail('inconsistent');
    assertEditorChatEnvelope(v);
    const frozen = await verifyEditorChatSnapshot(v.frozen);
    if (
      frozen.closure.closureHash !== context.record.closureHash ||
      !same(frozen.closure.leaves, context.record.closureManifest.leaves) ||
      !same(frozen.source, context.record.source)
    )
      editorChatFail('inconsistent');
    return frozen;
  } catch {
    editorChatFail('inconsistent');
  }
}

// Reused by the future send claim: no body is exposed before manifest authorization.
export async function readEditorChatReadyContext(
  tx,
  db,
  uid,
  context,
  { requireCurrent = false } = {},
) {
  if (context.summary.phase !== 'ready') editorChatFail('context-not-ready');
  let authorized;
  try {
    authorized = await authorizeEditorChatManifest(
      tx,
      db,
      uid,
      scopeOf(context.summary),
      context.record.closureManifest,
      context.record.closureHash,
    );
  } catch (error) {
    editorChatFail(
      error.details?.reason === 'inconsistent' ? 'inconsistent' : 'provenance-revoked',
    );
  }
  let proof = null;
  try {
    proof = await coverage(tx, db, authorized.source);
  } catch (error) {
    if (error.details?.reason !== 'provenance-revoked') throw error;
  }
  const freshness = proof && same(proof.proof, context.record.proofCoverage) ? 'current' : 'stale';
  if (requireCurrent && freshness !== 'current') editorChatFail('context-stale');
  const frozen = await readFrozenBody(tx, db, uid, context);
  return { frozen, freshness, source: authorized.source, proof };
}

export function createEditorChatContextService({
  db,
  now = Date.now,
  randomBytes = secureRandomBytes,
}) {
  const nonce = () => editorChatHashToken(randomBytes(32).toString('hex'));
  async function binding(tx, uid, request) {
    const target = { kind: 'adventure', id: request.adventureId },
      project = await readEditorChatProject(tx, db, uid, target);
    if (request.adventureToken !== undefined && request.adventureToken !== project.projectToken)
      editorChatFail('identity-changed');
    const scene =
      request.sceneId === null ? null : await readEditorChatScene(tx, db, project, request.sceneId);
    const snapshot = scene?.snapshot ?? project.snapshot,
      record = scene?.record ?? project.root;
    const sceneToken = scene
      ? await editorChatHash({
          version: 1,
          ownerId: uid,
          target,
          projectToken: project.projectToken,
          sceneId: request.sceneId,
          createdAt: editorChatNativeStamp(snapshot),
        })
      : null;
    let value;
    try {
      value = scene
        ? {
            personaComplement:
              record.personaComplement == null
                ? null
                : normalizeEditorChatPersonaComplement(record.personaComplement),
          }
        : { personaId: record.personaId ?? null };
    } catch {
      editorChatFail('inconsistent');
    }
    const personaRevision = editorChatRevision(record.personaRevision ?? 0);
    const data = {
      ownerId: uid,
      adventureId: request.adventureId,
      adventureToken: project.projectToken,
      sceneId: request.sceneId,
      sceneToken,
      personaRevision,
      value,
    };
    const dto = normalizeEditorChatDTO('personaBinding', {
      schemaVersion: 1,
      ...data,
      bindingToken: await editorChatBindingToken(data),
      updatedAt: record.updatedAt ?? 0,
    });
    return { project, scene, snapshot, record, dto };
  }
  async function dispatch(uid, data) {
    if (!uid) editorChatFail('auth-required');
    editorChatSourceId(uid);
    const r = await verifyEditorChatRequest(data);
    if (!EDITOR_CHAT_CONTEXT_ACTIONS.includes(r.action)) editorChatFail('invalid-request');
    // A retry reuses the stored nonce; candidates never enter the request fingerprint.
    const candidateNonce = ['prepareContext', 'deleteContext'].includes(r.action) ? nonce() : null;
    return db.runTransaction(async (tx) => {
      if (r.action === 'resolveOperation')
        return resolveEditorChatOperation(tx, db, uid, r, time(now));
      if (r.action === 'getAdventurePersonaBinding') return (await binding(tx, uid, r)).dto;
      if (r.action === 'getCleanup')
        return (await readEditorChatCleanup(tx, db, uid, r.cleanupId, r.cleanupToken)).summary;
      const mutation = [
        'prepareContext',
        'advanceContext',
        'setAdventurePersonaBinding',
        'deleteContext',
        'advanceCleanup',
      ].includes(r.action);
      const operation = mutation ? await readEditorChatOperation(tx, db, uid, r) : null;
      if (operation?.receipt) return { receipt: operation.receipt, current: null };
      if (operation?.pending) editorChatFail('operation-pending');
      if (r.action === 'setAdventurePersonaBinding') {
        const current = await binding(tx, uid, r);
        if (current.dto.bindingToken !== r.expectedBindingToken)
          editorChatFail('revision-conflict');
        // Validate the prospective inherited profile using the same resolver as preparation.
        const prospective = { ...current.project, scene: current.scene };
        if (r.sceneId === null)
          prospective.root = { ...current.project.root, personaId: r.value.personaId };
        else
          prospective.scene = {
            ...current.scene,
            record: { ...current.scene.record, personaComplement: r.value.personaComplement },
          };
        if (r.sceneId === null) prospective.target = { kind: 'adventure', id: r.adventureId };
        await readEditorChatPersona(tx, db, prospective, { full: true });
        const updatedAt = time(now, current.dto.updatedAt),
          personaRevision = nextEditorChatRevision(current.dto.personaRevision);
        const value = { ...current.dto, value: r.value, personaRevision, updatedAt };
        value.bindingToken = await editorChatBindingToken({
          ownerId: uid,
          adventureId: r.adventureId,
          adventureToken: value.adventureToken,
          sceneId: value.sceneId,
          sceneToken: value.sceneToken,
          personaRevision,
          value: r.value,
        });
        const dto = normalizeEditorChatDTO('personaBinding', value);
        const result = {
          kind: 'persona-binding',
          adventureId: r.adventureId,
          adventureToken: dto.adventureToken,
          sceneId: dto.sceneId,
          sceneToken: dto.sceneToken,
          personaRevision,
          bindingToken: dto.bindingToken,
        };
        tx.update(current.snapshot.ref, { ...r.value, personaRevision, updatedAt });
        return {
          receipt: writeEditorChatReceipt(tx, operation, uid, r, result, updatedAt),
          current: dto,
        };
      }
      if (r.action === 'prepareContext') {
        const ref = contextRef(db, uid, r.contextId);
        if (
          (await tx.get(ref)).exists ||
          (await readWorkMetadata(tx, bodyRef(db, uid, r.contextId), ['schemaVersion'])).exists
        )
          editorChatFail('operation-conflict');
        const source = await readEditorChatSource(tx, db, uid, r, { withContent: true });
        if (!baseMatches(source.source, r.base)) editorChatFail('context-stale');
        const proof = await coverage(tx, db, source),
          at = time(now);
        const contextToken = await editorChatControlToken('context', {
          ownerId: uid,
          contextId: r.contextId,
          birthNonce: candidateNonce,
          projectToken: source.source.projectToken,
          resourceToken: source.source.resourceToken,
        });
        const summary = normalizeEditorChatDTO('context', {
          schemaVersion: 1,
          ownerId: uid,
          contextId: r.contextId,
          contextToken,
          target: r.target,
          resource: r.resource,
          projectToken: source.source.projectToken,
          resourceToken: source.source.resourceToken,
          revision: 1,
          phase: 'local',
          scannedLocal: 0,
          scannedGlobal: 0,
          matchedEntityCount: null,
          includedEntityCount: null,
          omittedEntityCount: null,
          turnId: null,
          createdAt: at,
          updatedAt: at,
        });
        const record = {
          schemaVersion: 1,
          ownerId: uid,
          contextId: r.contextId,
          birthNonce: candidateNonce,
          summary,
          source: source.source,
          proofCoverage: proof.proof,
          closureManifest: null,
          closureHash: null,
          cursor: null,
          cleanupId: null,
        };
        const body = {
          schemaVersion: 1,
          ownerId: uid,
          contextId: r.contextId,
          contextToken,
          capture: r.capture,
          accumulator: createEditorChatLoreAccumulator(),
        };
        assertEditorChatEnvelope(record);
        assertEditorChatEnvelope(body);
        tx.create(ref, record);
        tx.create(bodyRef(db, uid, r.contextId), body);
        return {
          receipt: writeEditorChatReceipt(tx, operation, uid, r, resultOf(summary), at),
          current: summary,
        };
      }
      if (r.action === 'advanceCleanup') {
        const cleanup = await readEditorChatCleanup(tx, db, uid, r.cleanupId, r.cleanupToken);
        if (cleanup.summary.revision !== r.expectedRevision) editorChatFail('revision-conflict');
        if (cleanup.summary.subject.kind !== 'context') editorChatFail('invalid-request');
        const context = await readEditorChatContext(
          tx,
          db,
          uid,
          cleanup.summary.subject.id,
          cleanup.summary.subject.token,
        );
        const at = time(now, Math.max(cleanup.summary.updatedAt, context.summary.updatedAt));
        const plan = await advanceEditorChatCleanup(tx, db, uid, cleanup, context, at);
        plan.commit();
        return {
          receipt: writeEditorChatReceipt(tx, operation, uid, r, cleanupResult(plan.summary), at),
          current: plan.summary,
        };
      }
      const context = await readEditorChatContext(tx, db, uid, r.contextId, r.contextToken, {
        target: r.target,
        resource: r.resource,
      });
      if (r.action === 'deleteContext') {
        if (context.record.cleanupId !== null || context.summary.phase === 'deleted')
          editorChatFail('context-unavailable');
        const at = time(now, context.summary.updatedAt);
        const plan = await prepareEditorChatContextDeletion(
          tx,
          db,
          uid,
          context,
          r.operationId,
          candidateNonce,
          at,
        );
        const summary = {
          ...context.summary,
          phase: 'canceled',
          revision: nextEditorChatRevision(context.summary.revision),
          updatedAt: at,
        };
        tx.set(context.ref, { ...context.record, summary, cleanupId: r.operationId });
        plan.commit();
        return {
          receipt: writeEditorChatReceipt(tx, operation, uid, r, cleanupResult(plan.summary), at),
          current: plan.summary,
        };
      }
      if (r.action === 'getContext') {
        const source = await readEditorChatSource(tx, db, uid, r);
        if (
          source.source.projectToken !== context.summary.projectToken ||
          source.source.resourceToken !== context.summary.resourceToken
        )
          editorChatFail('identity-changed');
        return context.summary;
      }
      if (context.summary.revision !== r.expectedRevision) editorChatFail('revision-conflict');
      if (r.action === 'inspectContext') {
        if (context.summary.phase !== 'ready') {
          const currentSource = await readEditorChatSource(tx, db, uid, r);
          if (
            currentSource.source.projectToken !== context.summary.projectToken ||
            currentSource.source.resourceToken !== context.summary.resourceToken
          )
            editorChatFail('identity-changed');
          if (context.record.source === null) editorChatFail('context-unavailable');
          return {
            context: context.summary,
            source: context.record.source,
            frozen: null,
            freshness: context.summary.phase === 'stale' ? 'stale' : 'unknown',
          };
        }
        const { frozen, freshness } = await readEditorChatReadyContext(tx, db, uid, context);
        return normalizeEditorChatDTO('contextInspection', {
          context: context.summary,
          source: context.record.source,
          frozen,
          freshness,
        });
      }
      if (!['local', 'global'].includes(context.summary.phase))
        editorChatFail(
          context.summary.phase === 'consumed' ? 'context-consumed' : 'context-not-ready',
        );
      let source, proof, coherent;
      try {
        source = await readEditorChatSource(tx, db, uid, r);
        proof = await coverage(tx, db, source);
        coherent = same(proof.proof, context.record.proofCoverage);
      } catch (error) {
        if (error.details?.reason === 'inconsistent') throw error;
        coherent = false;
      }
      const at = time(now, context.summary.updatedAt);
      if (!coherent) {
        const summary = {
          ...context.summary,
          phase: 'stale',
          revision: nextEditorChatRevision(context.summary.revision),
          updatedAt: at,
        };
        tx.set(context.ref, { ...context.record, summary });
        return {
          receipt: writeEditorChatReceipt(tx, operation, uid, r, resultOf(summary), at),
          current: summary,
        };
      }
      // Access/coherence have been proved before reading terms from an earlier page.
      const body = await readTemporaryBody(tx, db, uid, context);
      const text = body.capture.text + '\n' + body.capture.surroundingText;
      const page = await readEditorChatLorePage(
        tx,
        db,
        source,
        proof.environment,
        context.summary.phase,
        context.record.cursor,
      );
      const accumulator = advanceEditorChatLoreAccumulator(text, body.accumulator, page.entities);
      const summary = {
        ...context.summary,
        revision: nextEditorChatRevision(context.summary.revision),
        updatedAt: at,
        [context.summary.phase === 'local' ? 'scannedLocal' : 'scannedGlobal']: nextCount(
          context.summary[context.summary.phase === 'local' ? 'scannedLocal' : 'scannedGlobal'],
          page.count,
        ),
      };
      let nextBody = { ...body, accumulator },
        manifest = null,
        closureHash = null,
        cursor = page.cursor;
      if (
        page.complete &&
        context.summary.phase === 'local' &&
        proof.environment.world?.available
      ) {
        summary.phase = 'global';
        cursor = null;
      } else if (page.complete) {
        const selected = finishEditorChatLoreAccumulator(text, accumulator),
          lore = [];
        for (const id of selected.ids) {
          const term = accumulator.terms.find((t) => t.id === id);
          if (!term?.reference) editorChatFail('inconsistent');
          lore.push(
            await readEditorChatLoreSnapshot(tx, db, source, proof.environment, term.reference),
          );
        }
        const persona = await readEditorChatPersona(tx, db, source, { full: true });
        if (!same(persona.proof, proof.persona.proof)) editorChatFail('context-stale');
        const closure = await editorChatDirectClosure(source, persona, lore);
        const snapshot = {
          schemaVersion: 1,
          matcherVersion: 1,
          capturedAt: at,
          source: context.record.source,
          capture: body.capture,
          lore: lore.map((v) => v.snapshot),
          persona: { ...persona.snapshot, capturedAt: at },
          includedEntityCount: selected.includedEntityCount,
          omittedEntityCount: selected.omittedEntityCount,
          closure,
        };
        const frozen = await verifyEditorChatSnapshot({
          ...snapshot,
          contextHash: await editorChatHash(snapshot),
        });
        nextBody = {
          schemaVersion: 1,
          ownerId: uid,
          contextId: r.contextId,
          contextToken: r.contextToken,
          frozen,
        };
        summary.phase = 'ready';
        summary.matchedEntityCount = selected.matchedEntityCount;
        summary.includedEntityCount = selected.includedEntityCount;
        summary.omittedEntityCount = selected.omittedEntityCount;
        manifest = { version: 1, leaves: closure.leaves };
        closureHash = closure.closureHash;
        cursor = null;
      }
      assertEditorChatEnvelope(nextBody);
      const validated = normalizeEditorChatDTO('context', summary);
      const record = {
        ...context.record,
        summary: validated,
        cursor,
        closureManifest: manifest,
        closureHash,
      };
      assertEditorChatEnvelope(record);
      tx.set(context.ref, record);
      tx.set(bodyRef(db, uid, r.contextId), nextBody);
      return {
        receipt: writeEditorChatReceipt(tx, operation, uid, r, resultOf(validated), at),
        current: validated,
      };
    });
  }
  return { dispatch };
}
function nextCount(previous, count) {
  const total = previous + count;
  editorChatRevision(total);
  return total;
}
