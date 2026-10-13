import { validateId } from './generation.mjs';
import {
  closed,
  sceneFail,
  conflict,
  sceneId,
  parentId,
  sceneTarget,
  sceneText,
  sceneLimit,
  sceneRevision,
  sceneDate,
  digest,
  prose,
  planning,
  assertSceneEnvelope,
  encodeSceneCursor,
  decodeSceneCursor,
} from './sceneContracts.mjs';
import { sceneRankBetween, validSceneRank } from './sceneRanks.mjs';

const stages = ['planned', 'writing', 'review', 'done'];
const domains = {
  book: { collection: 'books', owner: 'authorId', groups: 'chapters' },
  adventure: { collection: 'adventures', owner: 'ownerId', groups: 'parts' },
};
const revision = (record) => record?.sceneRevision ?? 0;
const contribution = (scene) =>
  scene && !scene.archived && scene.parentId !== null ? scene.wordCount : 0;
const slotField = (group) => (group.rankSlot === 'B' ? 'rankB' : 'rankA');
const cursorFor = (context, version, key, id) =>
  encodeSceneCursor({ version: 1, context, revision: version, key, id });

export function createScenesService({ db, now = Date.now }) {
  function scope(uid, data, keys) {
    if (!uid) sceneFail('unauthenticated', 'Entre na sua conta.');
    sceneId(uid);
    closed(data, ['target', ...keys]);
    const target = sceneTarget(data.target),
      domain = domains[target.kind];
    const path = `${domain.collection}/${target.id}`;
    return { uid, target, domain, path, ref: db.doc(path) };
  }
  async function project(context, tx = null, deleting = false) {
    const snapshot = await (tx ? tx.get(context.ref) : context.ref.get());
    const record = snapshot.data();
    if (!record || record[context.domain.owner] !== context.uid || (!deleting && record.deleting))
      sceneFail('not-found', 'Projeto indisponível.');
    return { ...record, snapshot };
  }
  const groupRef = (context, id) =>
    db.doc(
      id === null
        ? `${context.path}/sceneControls/unassigned`
        : `${context.path}/${context.domain.groups}/${id}`,
    );
  function groupView(context, id, record = {}) {
    return {
      id,
      title:
        id === null
          ? context.target.kind === 'book'
            ? 'Sem capítulo'
            : 'Sem parte'
          : (record.title ?? ''),
      kind: id === null ? 'unassigned' : context.target.kind === 'book' ? 'chapter' : 'part',
      contentMode:
        id === null || context.target.kind === 'adventure' || record.contentMode === 'scenes'
          ? 'scenes'
          : 'legacy',
      assemblyRevision: record.assemblyRevision ?? 0,
      structureRevision: record.structureRevision ?? 0,
      wordCount: record.wordCount ?? 0,
      sceneCount: record.sceneCount ?? 0,
      rankSlot: record.rankSlot ?? 'A',
      order: Number.isFinite(record.order) ? record.order : 0,
      ...(context.target.kind === 'book' && id !== null ? { actId: record.actId ?? null } : {}),
      updatedAt: record.updatedAt ?? 0,
      ...(record.deleting ? { deleting: true } : {}),
      ...(record.rebalancing ? { rebalancing: true } : {}),
      ...(record.rebalancing && record.rebalanceOperation
        ? { rebalanceOperationId: record.rebalanceOperation }
        : {}),
      ...(record.deleting && record.deletionOperation
        ? { deletionOperationId: record.deletionOperation }
        : {}),
    };
  }
  async function group(context, id, tx, options = {}) {
    const snapshot = await tx.get(groupRef(context, id));
    if (id !== null && (!snapshot.exists || (snapshot.data().deleting && !options.deleting)))
      sceneFail('failed-precondition', 'Agrupador indisponível.');
    const value = groupView(context, id, snapshot.data());
    if (options.composed && value.contentMode !== 'scenes')
      sceneFail(
        'failed-precondition',
        'Converta explicitamente este capítulo antes de adicionar cenas.',
      );
    if (options.structure && value.rebalancing)
      sceneFail(
        'failed-precondition',
        'A reorganização está em andamento. Retome-a antes de mudar posições.',
      );
    return { snapshot, ref: snapshot.ref, value, context };
  }
  function summary(record, groupValue) {
    return {
      id: record.id,
      ownerId: record.ownerId,
      schemaVersion: 1,
      revision: record.revision,
      title: record.title,
      parentId: record.parentId,
      ...(record.formerParentId !== undefined ? { formerParentId: record.formerParentId } : {}),
      stage: record.stage,
      archived: record.archived,
      rank: record[slotField(groupValue)],
      wordCount: record.wordCount,
      bodyHash: record.bodyHash,
      bodyBytes: record.bodyBytes,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
  function nextGroup(entry, deltaWords, deltaCount, timestamp, structure = false, assembly = true) {
    return {
      ...entry.value,
      wordCount: Math.max(0, entry.value.wordCount + deltaWords),
      sceneCount: Math.max(0, entry.value.sceneCount + deltaCount),
      updatedAt: timestamp,
      assemblyRevision: entry.value.assemblyRevision + (assembly ? 1 : 0),
      structureRevision: entry.value.structureRevision + (structure ? 1 : 0),
    };
  }
  function writeGroup(tx, entry, value) {
    const patch = {
      wordCount: value.wordCount,
      sceneCount: value.sceneCount,
      assemblyRevision: value.assemblyRevision,
      structureRevision: value.structureRevision,
      rankSlot: value.rankSlot,
      updatedAt: value.updatedAt,
      revision: (entry.snapshot.data()?.revision ?? 0) + 1,
    };
    if (entry.snapshot.exists) tx.update(entry.ref, patch);
    else
      tx.set(entry.ref, {
        ...patch,
        id: value.id,
        ownerId: entry.context.uid,
        schemaVersion: 1,
        createdAt: value.updatedAt,
      });
  }
  function writeProject(tx, context, original, timestamp, wordDelta = 0) {
    const value = revision(original) + 1;
    sceneRevision(value);
    tx.update(context.ref, {
      hasSceneResources: true,
      sceneRevision: value,
      updatedAt: timestamp,
      ...(context.target.kind === 'book'
        ? { wordCount: Math.max(0, (original.wordCount ?? 0) + wordDelta) }
        : {}),
    });
    return value;
  }
  function operation(context, data, method, normalized) {
    const id = validateId(data.operationId);
    return {
      id,
      ref: db.doc(`users/${context.uid}/sceneOperations/${id}`),
      fingerprint: digest({ target: context.target, method, ...normalized }),
    };
  }
  async function receipt(tx, operation) {
    const record = (await tx.get(operation.ref)).data();
    if (record && record.fingerprint !== operation.fingerprint)
      sceneFail('invalid-argument', 'Operação usada com outros dados.');
    return record;
  }
  function writeReceipt(tx, op, value) {
    tx.set(op.ref, { fingerprint: op.fingerprint, ...value });
  }
  async function retryScene(tx, context, p, record, method) {
    const scene = (await tx.get(db.doc(`${context.path}/scenes/${record.sceneId}`))).data();
    if (!scene || scene.ownerId !== context.uid)
      sceneFail('failed-precondition', 'A cena foi removida.');
    if (
      !['createScene', 'convertChapterToScenes'].includes(method) &&
      scene.revision !== record.revision
    )
      conflict();
    const destination = await group(context, scene.parentId, tx, { deleting: true });
    return {
      scene: summary(scene, destination.value),
      groups: [destination.value],
      projectRevision: revision(p),
    };
  }
  async function placement(context, entry, tx, data = {}, movingId = null) {
    const field = slotField(entry.value),
      base = db
        .collection(`${context.path}/scenes`)
        .where('parentId', '==', entry.value.id)
        .where('archived', '==', false);
    const load = async (id) => {
      if (!id) return null;
      const scene = (await tx.get(db.doc(`${context.path}/scenes/${sceneId(id)}`))).data();
      if (!scene || scene.id === movingId || scene.parentId !== entry.value.id || scene.archived)
        sceneFail('invalid-argument', 'Vizinho de posição inválido.');
      return scene;
    };
    let before = await load(data.beforeId),
      after = await load(data.afterId);
    if (before && after && !(after[field] < before[field]))
      sceneFail('invalid-argument', 'Vizinhos fora de ordem.');
    let query, candidates;
    if (after) {
      query = base.orderBy(field).orderBy('__name__').startAfter(after[field], after.id).limit(2);
      candidates = (await tx.get(query)).docs
        .map((item) => item.data())
        .filter((item) => item.id !== movingId);
      if (before && candidates[0]?.id !== before.id) conflict();
      before ??= candidates[0] ?? null;
    } else if (before) {
      query = base
        .orderBy(field, 'desc')
        .orderBy('__name__', 'desc')
        .startAfter(before[field], before.id)
        .limit(2);
      candidates = (await tx.get(query)).docs
        .map((item) => item.data())
        .filter((item) => item.id !== movingId);
      after = candidates[0] ?? null;
    } else {
      query = base.orderBy(field, 'desc').orderBy('__name__', 'desc').limit(2);
      after =
        (await tx.get(query)).docs
          .map((item) => item.data())
          .find((item) => item.id !== movingId) ?? null;
    }
    return sceneRankBetween(after?.[field] ?? null, before?.[field] ?? null);
  }
  function newScene(context, id, title, parent, content, timestamp, rank) {
    const text = prose(content);
    const record = {
      id,
      ownerId: context.uid,
      schemaVersion: 1,
      revision: 1,
      title,
      parentId: parent,
      stage: 'planned',
      archived: false,
      rankA: rank,
      rankB: rank,
      wordCount: text.wordCount,
      bodyHash: text.bodyHash,
      bodyBytes: text.bodyBytes,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    const body = { ...text.body, revision: 1 };
    assertSceneEnvelope(body);
    return { record, body };
  }

  async function mutate(uid, data, method) {
    const fields = {
      createScene: ['operationId', 'title', 'parentId', 'planning', 'content'],
      updateScene: ['operationId', 'sceneId', 'expectedRevision', 'patch'],
      moveScene: [
        'operationId',
        'sceneId',
        'expectedRevision',
        'parentId',
        'beforeId',
        'afterId',
        'expectedSourceStructureRevision',
        'expectedTargetStructureRevision',
      ],
      archiveScene: ['operationId', 'sceneId', 'expectedRevision', 'archived'],
      setSceneReference: ['operationId', 'sceneId', 'expectedRevision', 'reference', 'remove'],
    };
    const context = scope(uid, data, fields[method]),
      normalized = { ...data };
    delete normalized.target;
    delete normalized.operationId;
    if (method === 'createScene') {
      normalized.title = sceneText(data.title, 300, true);
      normalized.parentId = parentId(data.parentId);
      normalized.planning = planning(data.planning);
      normalized.content = data.content ?? '';
      prose(normalized.content);
    } else {
      sceneId(data.sceneId);
      sceneRevision(data.expectedRevision);
    }
    if (method === 'updateScene') {
      closed(data.patch, ['title', 'stage', 'planning', 'content']);
      if (!Object.keys(data.patch).length) sceneFail('invalid-argument', 'Informe uma alteração.');
      if ('title' in data.patch)
        normalized.patch = { ...data.patch, title: sceneText(data.patch.title, 300, true) };
      if ('stage' in data.patch && !stages.includes(data.patch.stage))
        sceneFail('invalid-argument', 'Estado de cena inválido.');
      if ('content' in data.patch) prose(data.patch.content);
      if ('planning' in data.patch) planning(data.patch.planning);
    }
    if (method === 'moveScene') {
      normalized.parentId = parentId(data.parentId);
      sceneRevision(data.expectedSourceStructureRevision);
      sceneRevision(data.expectedTargetStructureRevision);
    }
    if (method === 'archiveScene' && typeof data.archived !== 'boolean')
      sceneFail('invalid-argument', 'Estado de arquivo inválido.');
    let reference;
    if (method === 'setSceneReference') {
      closed(data.reference, ['kind', 'scopeId', 'entityId']);
      if (
        !['book', 'universe'].includes(data.reference.kind) ||
        (data.remove !== undefined && typeof data.remove !== 'boolean')
      )
        sceneFail('invalid-argument', 'Referência inválida.');
      reference = {
        kind: data.reference.kind,
        scopeId: sceneId(data.reference.scopeId),
        entityId: sceneId(data.reference.entityId),
      };
    }
    const op = operation(context, data, method, normalized);
    return db.runTransaction(async (tx) => {
      const p = await project(context, tx),
        previous = await receipt(tx, op);
      if (previous) return retryScene(tx, context, p, previous, method);
      const ref = db.doc(
        `${context.path}/scenes/${method === 'createScene' ? op.id : data.sceneId}`,
      );
      const old = (await tx.get(ref)).data();
      if (method === 'createScene' ? Boolean(old) : !old || old.ownerId !== uid)
        sceneFail('failed-precondition', 'Cena indisponível.');
      if (old && old.revision !== data.expectedRevision) conflict();
      const timestamp = sceneDate(now, p.updatedAt ?? 0),
        entries = new Map();
      const readGroup = async (id, options = {}) => {
        if (!entries.has(id)) entries.set(id, await group(context, id, tx, options));
        const entry = entries.get(id);
        if (options.structure && entry.value.rebalancing)
          sceneFail('failed-precondition', 'Retome a reorganização antes de mudar posições.');
        return entry;
      };
      const entry = await readGroup(old?.parentId ?? normalized.parentId ?? null, {
        composed: true,
        structure: method !== 'updateScene' && method !== 'setSceneReference',
        deleting: Boolean(old?.archived),
      });
      let value, body, plan, referenceRef;
      const next = new Map();
      if (method === 'createScene') {
        const rank = await placement(context, entry, tx);
        ({ record: value, body } = newScene(
          context,
          op.id,
          normalized.title,
          normalized.parentId,
          normalized.content,
          timestamp,
          rank,
        ));
        plan = normalized.planning;
        next.set(entry.value.id, nextGroup(entry, value.wordCount, 1, timestamp, true));
      } else {
        value = { ...old, revision: old.revision + 1, updatedAt: timestamp };
        if (method === 'updateScene') {
          const patch = normalized.patch;
          if ('title' in patch) value.title = patch.title;
          if ('stage' in patch) value.stage = patch.stage;
          if ('content' in patch) {
            const text = prose(patch.content);
            body = { ...text.body, revision: value.revision };
            Object.assign(value, {
              wordCount: text.wordCount,
              bodyBytes: text.bodyBytes,
              bodyHash: text.bodyHash,
            });
            next.set(
              entry.value.id,
              nextGroup(
                entry,
                old.archived ? 0 : value.wordCount - old.wordCount,
                0,
                timestamp,
                false,
                !old.archived,
              ),
            );
          }
          if ('planning' in patch)
            plan = planning(
              patch.planning,
              (await tx.get(db.doc(`${ref.path}/planning/current`))).data() ?? undefined,
            );
        } else if (method === 'moveScene') {
          const destination = await readGroup(normalized.parentId, {
            composed: true,
            structure: true,
          });
          if (
            entry.value.structureRevision !== data.expectedSourceStructureRevision ||
            destination.value.structureRevision !== data.expectedTargetStructureRevision
          )
            conflict();
          const rank = await placement(context, destination, tx, data, old.id);
          value.parentId = normalized.parentId;
          value[slotField(destination.value)] = rank;
          if (old.archived) value.formerParentId = value.parentId;
          if (entry.value.id === destination.value.id)
            next.set(entry.value.id, nextGroup(entry, 0, 0, timestamp, true));
          else {
            next.set(
              entry.value.id,
              nextGroup(entry, old.archived ? 0 : -old.wordCount, -1, timestamp, true),
            );
            next.set(
              destination.value.id,
              nextGroup(destination, old.archived ? 0 : old.wordCount, 1, timestamp, true),
            );
          }
        } else if (method === 'archiveScene') {
          value.archived = data.archived;
          if (old.archived === data.archived) next.set(entry.value.id, entry.value);
          else if (data.archived) {
            value.formerParentId = old.parentId;
            next.set(entry.value.id, nextGroup(entry, -old.wordCount, 0, timestamp, true));
          } else {
            const candidate = old.formerParentId ?? old.parentId;
            let destination;
            const found =
              candidate === null ? null : (await tx.get(groupRef(context, candidate))).data();
            if (candidate !== null && (!found || found.deleting))
              destination = await readGroup(null, { structure: true });
            else destination = await readGroup(candidate, { composed: true, structure: true });
            value.parentId = destination.value.id;
            value[slotField(destination.value)] = await placement(
              context,
              destination,
              tx,
              {},
              old.id,
            );
            if (entry.value.id !== destination.value.id)
              next.set(entry.value.id, nextGroup(entry, 0, -1, timestamp, true));
            next.set(
              destination.value.id,
              nextGroup(
                destination,
                old.wordCount,
                entry.value.id === destination.value.id ? 0 : 1,
                timestamp,
                true,
              ),
            );
          }
        } else {
          referenceRef = db.doc(`${ref.path}/references/${digest(reference)}`);
          const existing = await tx.get(referenceRef);
          if (!data.remove && !(await referenceAvailable(context, p, reference, tx)))
            sceneFail('permission-denied', 'Referência indisponível neste projeto.');
          if (data.remove && !existing.exists) {
            /* Idempotent removal still records its operation. */
          }
        }
      }
      assertSceneEnvelope(value);
      if (body) assertSceneEnvelope(body);
      const projectRevision = writeProject(
        tx,
        context,
        p,
        timestamp,
        contribution(value) - contribution(old),
      );
      if (method === 'createScene') tx.create(ref, value);
      else tx.update(ref, value);
      if (body) tx.set(db.doc(`${ref.path}/body/current`), body);
      if (plan) tx.set(db.doc(`${ref.path}/planning/current`), plan);
      if (referenceRef) {
        if (data.remove) tx.delete(referenceRef);
        else tx.set(referenceRef, reference);
      }
      for (const [id, groupValue] of next) writeGroup(tx, entries.get(id), groupValue);
      writeReceipt(tx, op, { sceneId: value.id, revision: value.revision, createdAt: timestamp });
      return {
        scene: summary(value, next.get(value.parentId) ?? entries.get(value.parentId).value),
        groups: [...next.values()],
        projectRevision,
      };
    });
  }

  async function referenceAvailable(context, p, reference, tx = null) {
    if (reference.kind === 'book') {
      if (context.target.kind !== 'book' || reference.scopeId !== context.target.id) return null;
      const entity = await (tx
        ? tx.get(db.doc(`${context.path}/lore/${reference.entityId}`))
        : db.doc(`${context.path}/lore/${reference.entityId}`).get());
      return entity.data() ?? null;
    }
    if (reference.scopeId !== p.universeId) return null;
    const worldRef = db.doc(`universes/${reference.scopeId}`),
      loreRef = db.doc(`${worldRef.path}/lore/${reference.entityId}`);
    const world = (await (tx ? tx.get(worldRef) : worldRef.get())).data();
    if (!world || world.authorId !== context.uid || world.deleting) return null;
    return (await (tx ? tx.get(loreRef) : loreRef.get())).data() ?? null;
  }

  const api = {
    createScene: (uid, data) => mutate(uid, data, 'createScene'),
    updateScene: (uid, data) => mutate(uid, data, 'updateScene'),
    moveScene: (uid, data) => mutate(uid, data, 'moveScene'),
    archiveScene: (uid, data) => mutate(uid, data, 'archiveScene'),
    setSceneReference: (uid, data) => mutate(uid, data, 'setSceneReference'),
    async getScene(uid, data) {
      const context = scope(uid, data, ['sceneId']);
      sceneId(data.sceneId);
      try {
        return await db.runTransaction(async (tx) => {
          const p = await project(context, tx),
            scene = (await tx.get(db.doc(`${context.path}/scenes/${data.sceneId}`))).data();
          if (!scene || scene.ownerId !== uid) return null;
          const [body, plan, grouping] = await Promise.all([
            tx.get(db.doc(`${context.path}/scenes/${scene.id}/body/current`)),
            tx.get(db.doc(`${context.path}/scenes/${scene.id}/planning/current`)),
            tx.get(groupRef(context, scene.parentId)),
          ]);
          if (
            !body.exists ||
            body.data().hash !== scene.bodyHash ||
            digest(body.data().content) !== scene.bodyHash
          )
            sceneFail('failed-precondition', 'Corpo da cena inconsistente.');
          const g =
            scene.parentId !== null && !grouping.exists
              ? null
              : groupView(context, scene.parentId, grouping.data());
          return {
            ...summary(scene, g ?? { rankSlot: 'A' }),
            content: body.data().content,
            planning: planning({}, plan.data()),
            project: { ...context.target, title: p.title, universeId: p.universeId ?? null },
            group: g,
            projectRevision: revision(p),
          };
        });
      } catch (error) {
        if (error.code === 'not-found') return null;
        throw error;
      }
    },
    async listScenes(uid, data) {
      const context = scope(uid, data, ['parentId', 'stage', 'archived', 'cursor', 'limit']);
      if (!Object.hasOwn(data, 'parentId'))
        sceneFail('invalid-argument', 'Selecione um agrupador ou Sem grupo.');
      const id = parentId(data.parentId),
        stage = data.stage ?? 'all',
        archived = data.archived ?? false,
        limit = sceneLimit(data.limit);
      if ((stage !== 'all' && !stages.includes(stage)) || typeof archived !== 'boolean')
        sceneFail('invalid-argument', 'Filtro inválido.');
      return db.runTransaction(async (tx) => {
        const p = await project(context, tx),
          entry = await group(context, id, tx, { deleting: true });
        const c = {
            uid,
            target: context.target,
            parentId: id,
            stage,
            archived,
            slot: entry.value.rankSlot,
            kind: 'scenes',
          },
          cursor = decodeSceneCursor(data.cursor, c);
        if (cursor && cursor.revision !== revision(p)) conflict();
        let query = db
          .collection(`${context.path}/scenes`)
          .where('parentId', '==', id)
          .where('archived', '==', archived);
        if (stage !== 'all') query = query.where('stage', '==', stage);
        query = query
          .orderBy(slotField(entry.value))
          .orderBy('__name__')
          .limit(limit + 1);
        if (cursor) {
          if (!validSceneRank(cursor.key)) sceneFail('invalid-argument', 'Posição inválida.');
          query = query.startAfter(cursor.key, cursor.id);
        }
        const page = await tx.get(query),
          visible = page.docs.slice(0, limit),
          last = visible.at(-1);
        return {
          items: visible.map((item) => summary(item.data(), entry.value)),
          nextCursor:
            page.docs.length > limit
              ? cursorFor(c, revision(p), last.data()[slotField(entry.value)], last.id)
              : null,
          projectRevision: revision(p),
        };
      });
    },
    async listSceneGroups(uid, data) {
      const context = scope(uid, data, ['cursor', 'limit']),
        limit = sceneLimit(data.limit);
      return db.runTransaction(async (tx) => {
        const p = await project(context, tx),
          c = { uid, target: context.target, kind: 'groups', updatedAt: p.updatedAt },
          cursor = decodeSceneCursor(data.cursor, c, { observeUpdatedAt: true });
        if (cursor && cursor.revision !== revision(p)) conflict();
        let query = db
          .collection(`${context.path}/${context.domain.groups}`)
          .orderBy('__name__')
          .limit(limit + 1);
        if (cursor) query = query.startAfter(cursor.id);
        const page = await tx.get(query),
          visible = page.docs.slice(0, limit),
          last = visible.at(-1);
        return {
          items: visible.map((item) => groupView(context, item.id, item.data())),
          nextCursor: page.docs.length > limit ? cursorFor(c, revision(p), last.id, last.id) : null,
          projectRevision: revision(p),
        };
      });
    },
    async listSceneSources(uid, data) {
      const context = scope(uid, data, ['cursor', 'limit', 'expectedProjectRevision']),
        limit = sceneLimit(data.limit),
        expected = sceneRevision(data.expectedProjectRevision);
      if (context.target.kind !== 'book')
        sceneFail('invalid-argument', 'Fontes de conversão pertencem a livros.');
      return db.runTransaction(async (tx) => {
        const p = await project(context, tx);
        if (revision(p) !== expected) conflict();
        const c = { uid, target: context.target, kind: 'sources' },
          cursor = decodeSceneCursor(data.cursor, c);
        if (cursor && cursor.revision !== expected) conflict();
        let query = db
          .collection(`${context.path}/sceneSources`)
          .orderBy('__name__')
          .limit(limit + 1);
        if (cursor) query = query.startAfter(cursor.id);
        const page = await tx.get(query),
          items = [];
        let last;
        for (const item of page.docs.slice(0, limit)) {
          const record = item.data(),
            { content = '', ...original } = record.original;
          const value = {
            id: item.id,
            content,
            hash: record.hash,
            original: JSON.parse(JSON.stringify(original)),
          };
          const candidate = {
            items: [...items, value],
            nextCursor: cursorFor(c, expected, item.id, item.id),
            projectRevision: expected,
          };
          if (Buffer.byteLength(JSON.stringify(candidate)) > 1000000) {
            if (!items.length)
              sceneFail('failed-precondition', 'Fonte acima do orçamento de resposta.');
            break;
          }
          items.push(value);
          last = item;
        }
        return {
          items,
          nextCursor:
            page.docs.length > items.length ? cursorFor(c, expected, last.id, last.id) : null,
          projectRevision: expected,
        };
      });
    },
    async getSceneGroup(uid, data) {
      const context = scope(uid, data, ['parentId']),
        id = parentId(data.parentId);
      try {
        return await db.runTransaction(async (tx) => {
          await project(context, tx);
          const entry = await group(context, id, tx, { deleting: true });
          const original = entry.snapshot.data() ?? {};
          return {
            group: entry.value,
            sourceVersion: digest(original),
            legacy:
              entry.value.contentMode === 'legacy'
                ? { content: original.content ?? '', hash: digest(original.content ?? '') }
                : null,
          };
        });
      } catch (error) {
        if (['not-found', 'failed-precondition'].includes(error.code)) return null;
        throw error;
      }
    },
    async createSceneGroup(uid, data) {
      const context = scope(uid, data, ['operationId', 'title', 'actId']),
        title = sceneText(data.title, 300, true),
        actId = parentId(data.actId);
      if (context.target.kind === 'adventure' && actId)
        sceneFail('invalid-argument', 'Partes de aventura não pertencem a atos de livro.');
      const op = operation(context, data, 'createSceneGroup', { title, actId });
      return db.runTransaction(async (tx) => {
        const p = await project(context, tx),
          previous = await receipt(tx, op),
          ref = groupRef(context, op.id),
          existing = await tx.get(ref);
        if (previous) {
          if (!existing.exists || existing.data().deleting)
            sceneFail('failed-precondition', 'Agrupador removido.');
          return groupView(context, op.id, existing.data());
        }
        if (existing.exists) sceneFail('failed-precondition', 'Identificador já utilizado.');
        if (actId && !(await tx.get(db.doc(`${context.path}/acts/${actId}`))).exists)
          sceneFail('invalid-argument', 'Ato indisponível.');
        const query = db.collection(`${context.path}/${context.domain.groups}`);
        const latest = (await tx.get(query.orderBy('order', 'desc').limit(1))).docs[0]?.data();
        const order = (latest?.order ?? 0) + 1,
          timestamp = sceneDate(now, p.updatedAt ?? 0);
        if (!Number.isSafeInteger(order)) sceneFail('failed-precondition', 'Ordem inválida.');
        const value = {
          id: op.id,
          ownerId: uid,
          schemaVersion: 1,
          revision: 1,
          title,
          contentMode: 'scenes',
          assemblyRevision: 0,
          structureRevision: 0,
          wordCount: 0,
          sceneCount: 0,
          rankSlot: 'A',
          order,
          createdAt: timestamp,
          updatedAt: timestamp,
          ...(context.target.kind === 'book' ? { content: '', actId } : {}),
        };
        tx.create(ref, value);
        writeProject(tx, context, p, timestamp);
        writeReceipt(tx, op, { groupId: op.id, createdAt: timestamp });
        return groupView(context, op.id, value);
      });
    },
    async convertChapterToScenes(uid, data) {
      const context = scope(uid, data, ['parentId', 'operationId', 'expectedSourceVersion']),
        id = sceneId(data.parentId);
      if (
        context.target.kind !== 'book' ||
        typeof data.expectedSourceVersion !== 'string' ||
        !/^[a-f0-9]{64}$/.test(data.expectedSourceVersion)
      )
        sceneFail('invalid-argument', 'Fonte de conversão inválida.');
      const op = operation(context, data, 'convertChapterToScenes', {
        parentId: id,
        expectedSourceVersion: data.expectedSourceVersion,
      });
      return db.runTransaction(async (tx) => {
        const p = await project(context, tx),
          previous = await receipt(tx, op);
        if (previous) return retryScene(tx, context, p, previous, 'convertChapterToScenes');
        const entry = await group(context, id, tx, { structure: true }),
          original = entry.snapshot.data();
        if (entry.value.contentMode !== 'legacy')
          sceneFail('failed-precondition', 'Este capítulo já usa cenas.');
        if (digest(original) !== data.expectedSourceVersion) conflict();
        const ref = db.doc(`${context.path}/scenes/${op.id}`),
          source = db.doc(`${context.path}/sceneSources/${id}`);
        if ((await tx.get(ref)).exists || (await tx.get(source)).exists)
          sceneFail('failed-precondition', 'Identidade de conversão já utilizada.');
        const timestamp = sceneDate(now, p.updatedAt ?? 0),
          { record, body } = newScene(
            context,
            op.id,
            sceneText(original.title, 300, true),
            id,
            original.content ?? '',
            timestamp,
            sceneRankBetween(),
          );
        const sourceRecord = {
          original,
          hash: digest(original.content ?? ''),
          id,
          sourceVersion: data.expectedSourceVersion,
          createdAt: timestamp,
        };
        assertSceneEnvelope(sourceRecord);
        const value = {
          ...entry.value,
          contentMode: 'scenes',
          wordCount: record.wordCount,
          sceneCount: 1,
          assemblyRevision: 1,
          structureRevision: 1,
          updatedAt: timestamp,
        };
        tx.create(ref, record);
        tx.set(db.doc(`${ref.path}/body/current`), body);
        tx.set(db.doc(`${ref.path}/planning/current`), planning());
        tx.create(source, sourceRecord);
        writeGroup(tx, entry, value);
        tx.update(entry.ref, { contentMode: 'scenes' });
        const projectRevision = writeProject(
          tx,
          context,
          p,
          timestamp,
          record.wordCount - entry.value.wordCount,
        );
        writeReceipt(tx, op, { sceneId: op.id, revision: 1, createdAt: timestamp });
        return { scene: summary(record, value), groups: [value], projectRevision };
      });
    },
    async listSceneReferences(uid, data) {
      const context = scope(uid, data, ['sceneId', 'cursor', 'limit']),
        id = sceneId(data.sceneId),
        limit = sceneLimit(data.limit);
      return db.runTransaction(async (tx) => {
        const p = await project(context, tx),
          scene = (await tx.get(db.doc(`${context.path}/scenes/${id}`))).data();
        if (!scene || scene.ownerId !== uid) sceneFail('not-found', 'Cena indisponível.');
        const c = { uid, target: context.target, kind: 'references', sceneId: id },
          cursor = decodeSceneCursor(data.cursor, c);
        if (cursor && cursor.revision !== revision(p)) conflict();
        let query = db
          .collection(`${context.path}/scenes/${id}/references`)
          .orderBy('__name__')
          .limit(limit + 1);
        if (cursor) query = query.startAfter(cursor.id);
        const page = await tx.get(query),
          visible = page.docs.slice(0, limit),
          items = [];
        for (const item of visible) {
          const ref = item.data(),
            entity = await referenceAvailable(context, p, ref, tx);
          items.push({
            id: item.id,
            reference: ref,
            available: Boolean(entity),
            ...(entity
              ? {
                  name: typeof entity.name === 'string' ? entity.name : '',
                  category: typeof entity.category === 'string' ? entity.category : '',
                }
              : {}),
          });
        }
        const last = visible.at(-1);
        return {
          items,
          nextCursor: page.docs.length > limit ? cursorFor(c, revision(p), last.id, last.id) : null,
          projectRevision: revision(p),
        };
      });
    },
    async readSceneAssembly(uid, data) {
      const context = scope(uid, data, ['parentId', 'expectedAssemblyRevision', 'cursor', 'limit']),
        id = sceneId(data.parentId),
        limit = sceneLimit(data.limit),
        expected = sceneRevision(data.expectedAssemblyRevision);
      return db.runTransaction(async (tx) => {
        const p = await project(context, tx),
          entry = await group(context, id, tx, { composed: true });
        if (entry.value.assemblyRevision !== expected) conflict();
        const c = {
            uid,
            target: context.target,
            parentId: id,
            kind: 'assembly',
            slot: entry.value.rankSlot,
          },
          cursor = decodeSceneCursor(data.cursor, c);
        if (cursor && cursor.revision !== expected) conflict();
        let query = db
          .collection(`${context.path}/scenes`)
          .where('parentId', '==', id)
          .where('archived', '==', false)
          .orderBy(slotField(entry.value))
          .orderBy('__name__')
          .limit(limit + 1);
        if (cursor) {
          if (!validSceneRank(cursor.key)) sceneFail('invalid-argument', 'Posição inválida.');
          query = query.startAfter(cursor.key, cursor.id);
        }
        const page = await tx.get(query),
          items = [];
        let last = null;
        for (const snapshot of page.docs.slice(0, limit)) {
          const scene = snapshot.data(),
            body = (await tx.get(db.doc(`${snapshot.ref.path}/body/current`))).data();
          if (!body || digest(body.content) !== scene.bodyHash || body.hash !== scene.bodyHash)
            sceneFail('failed-precondition', 'Corpo da cena inconsistente.');
          const item = {
            id: snapshot.id,
            revision: scene.revision,
            content: body.content,
            hash: body.hash,
            wordCount: scene.wordCount,
          };
          const candidate = {
            items: [...items, item],
            nextCursor: cursorFor(c, expected, scene[slotField(entry.value)], scene.id),
            assemblyRevision: expected,
            projectRevision: revision(p),
          };
          if (Buffer.byteLength(JSON.stringify(candidate)) > 1000000) {
            if (!items.length)
              sceneFail('failed-precondition', 'Cena acima do orçamento de resposta.');
            break;
          }
          items.push(item);
          last = snapshot;
        }
        return {
          items,
          nextCursor:
            page.docs.length > items.length
              ? cursorFor(c, expected, last.data()[slotField(entry.value)], last.id)
              : null,
          assemblyRevision: expected,
          projectRevision: revision(p),
        };
      });
    },
  };
  // Jobs use the same isolated operation namespace; their checkpoint is server-owned.
  addSceneJobs(api, {
    db,
    now,
    scope,
    project,
    group,
    groupRef,
    groupView,
    summary,
    writeGroup,
    writeProject,
    operation,
    receipt,
    writeReceipt,
  });
  return api;
}

import { addSceneJobs } from './sceneJobs.mjs';
