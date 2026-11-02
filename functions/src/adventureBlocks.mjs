import { validateId } from './generation.mjs';
import { createScenesService } from './scenes.mjs';
import { prose, assertSceneEnvelope, digest, sceneRevision, sceneText } from './sceneContracts.mjs';
import {
  workClosed,
  workFail,
  workId,
  workLimit,
  workConflict,
  workScope,
} from './workProgressContracts.mjs';
import {
  adventureBlockTypes,
  adventureBlockAudiences,
  blockInteger,
  adventureBlockCountStatus,
} from './adventureBlocksState.mjs';
import {
  adventureBlockScope,
  adventureBlockResource,
  readAdventureScene,
  readAdventureResource,
  adventureBlockSummary,
  adventureBlockTotals,
  readAdventureBody,
} from './adventureBlocksContracts.mjs';
import { historyCursor, encodeHistoryCursor } from './workHistoryContracts.mjs';
import {
  adventureImage,
  adventureImageInput,
  adventureImageDocument,
  prepareAdventureImageUse,
} from './adventureBlockImages.mjs';

export function createAdventureBlocksService({ db, now = Date.now }) {
  const scenes = createScenesService({ db, now });
  function operation(context, data, method, payload) {
    const id = validateId(data.operationId);
    return {
      id,
      ref: db.doc(`users/${context.uid}/adventureBlockOperations/${id}`),
      fingerprint: digest({ method, target: context.target, ...payload }),
    };
  }
  async function receipt(tx, op) {
    const value = (await tx.get(op.ref)).data();
    if (value && value.fingerprint !== op.fingerprint)
      workFail('invalid-argument', 'Operação usada com outros dados.');
    return value;
  }
  const result = (resource, scene, block) => ({
    block: adventureBlockSummary(resource, scene, block),
    ...adventureBlockTotals(scene),
  });
  function replay(value, prior) {
    if (value.block.revision !== prior.revision || value.scene.revision !== prior.sceneRevision)
      workConflict();
    return result(value.resource, value.scene, value.block);
  }
  async function replayWithImage(tx, value, prior) {
    const response = replay(value, prior),
      image = adventureImage(value.resource, value.scene, value.block);
    await prepareAdventureImageUse(tx, db, value.context, value.resource, image, image);
    return response;
  }
  function recordReceipt(tx, op, response) {
    tx.set(op.ref, {
      fingerprint: op.fingerprint,
      resource: response.block.resource,
      revision: response.block.revision,
      sceneRevision: response.sceneRevision,
    });
  }
  function patch(value, create = false) {
    workClosed(value, ['title', 'narrativeType', 'audience', 'content']);
    if (!create && !Object.keys(value).length)
      workFail('invalid-argument', 'Informe uma alteração.');
    const normalized = { ...value };
    if (create || 'title' in value) normalized.title = sceneText(value.title, 300, true);
    if (create || 'narrativeType' in value) {
      normalized.narrativeType = value.narrativeType ?? (create ? 'scene' : undefined);
      if (!adventureBlockTypes.includes(normalized.narrativeType))
        workFail('invalid-argument', 'Tipo narrativo inválido.');
    }
    if (create || 'audience' in value) {
      normalized.audience = value.audience ?? (create ? 'creator' : undefined);
      if (!adventureBlockAudiences.includes(normalized.audience))
        workFail('invalid-argument', 'Audiência inválida.');
    }
    if (create || 'content' in value) {
      normalized.content = value.content ?? (create ? '' : undefined);
      prose(normalized.content);
    }
    return normalized;
  }
  async function prepareAdditionalWrite(
    tx,
    value,
    changes,
    { removed = false, structureChanged = false } = {},
  ) {
    const old = value.block,
      metadata = { ...old, ...changes },
      text = 'content' in changes ? prose(changes.content) : null;
    delete metadata.content;
    if (text)
      Object.assign(metadata, {
        wordCount: text.wordCount,
        bodyHash: text.bodyHash,
        bodyBytes: text.bodyBytes,
      });
    const before = old.archived || old.deleting ? 0 : blockInteger(old.wordCount),
      after = removed || metadata.archived ? 0 : blockInteger(metadata.wordCount),
      countDelta = Number(!removed && !metadata.archived) - Number(!old.archived && !old.deleting),
      plan = await scenes.prepareAdventureSceneAggregateWrite(tx, {
        uid: value.context.uid,
        target: value.context.target,
        root: value.root,
        snapshot: value.sceneSnapshot,
        extraWords: value.state.extra + after - before,
        blockCount: value.state.count + countDelta,
        structureChanged,
      });
    metadata.revision = old.revision + 1;
    metadata.updatedAt = plan.timestamp;
    assertSceneEnvelope(metadata);
    const body = text ? { ...text.body, revision: metadata.revision } : null;
    if (body) assertSceneEnvelope(body);
    return {
      result: result(value.resource, plan.value, metadata),
      marker: {
        contentHash: metadata.bodyHash,
        updatedAt: metadata.updatedAt,
        revision: metadata.revision,
      },
      commit() {
        plan.commit();
        tx.update(value.blockSnapshot.ref, metadata);
        if (body) tx.set(db.doc(value.blockSnapshot.ref.path + '/body/current'), body);
      },
    };
  }
  async function prepareAdventureBlockTextWrite(tx, { uid, target, snapshot, content }) {
    const context = workScope(db, uid, { target }, []),
      value = await readAdventureResource(tx, db, context, { kind: 'block', id: snapshot.id });
    return prepareAdditionalWrite(tx, value, { content });
  }
  async function createPlan(tx, value, op, fields) {
    const ref = db.doc(value.context.path + '/sceneBlocks/' + op.id);
    if ((await tx.get(ref)).exists)
      workFail('already-exists', 'Identificador de bloco já utilizado.');
    const image = fields.image ?? null,
      imageUse = await prepareAdventureImageUse(
        tx,
        db,
        value.context,
        { kind: 'block', id: op.id },
        null,
        image,
      ),
      text = prose(fields.content),
      plan = await scenes.prepareAdventureSceneAggregateWrite(tx, {
        uid: value.context.uid,
        target: value.context.target,
        root: value.root,
        snapshot: value.sceneSnapshot,
        extraWords: value.state.extra + text.wordCount,
        blockCount: value.state.count + 1,
        nextOrder: blockInteger(value.state.nextOrder + 1, 1),
        structureChanged: true,
      }),
      record = {
        id: op.id,
        ownerId: value.context.uid,
        schemaVersion: 1,
        sceneId: value.scene.id,
        revision: 1,
        title: fields.title,
        narrativeType: fields.narrativeType,
        audience: fields.audience,
        archived: false,
        deleting: false,
        order: value.state.nextOrder,
        wordCount: text.wordCount,
        bodyHash: text.bodyHash,
        bodyBytes: text.bodyBytes,
        ...(image ? { image } : {}),
        createdAt: plan.timestamp,
        updatedAt: plan.timestamp,
      },
      body = { ...text.body, revision: 1 },
      response = result({ kind: 'block', id: op.id }, plan.value, record);
    assertSceneEnvelope(record);
    assertSceneEnvelope(body);
    return {
      response,
      commit() {
        plan.commit();
        tx.create(ref, record);
        tx.create(db.doc(ref.path + '/body/current'), body);
        imageUse.commit();
        recordReceipt(tx, op, response);
      },
    };
  }
  const api = {
    prepareAdventureBlockTextWrite,
    async getAdventureBlockImage(uid, data) {
      const context = adventureBlockScope(db, uid, data, ['resource']),
        resource = adventureBlockResource(data.resource);
      return db.runTransaction(async (tx) =>
        adventureImageDocument(tx, db, await readAdventureResource(tx, db, context, resource)),
      );
    },
    async setAdventureBlockImage(uid, data) {
      const context = adventureBlockScope(db, uid, data, [
          'resource',
          'operationId',
          'expectedRevision',
          'image',
        ]),
        resource = adventureBlockResource(data.resource),
        image = adventureImageInput(data.image);
      sceneRevision(data.expectedRevision);
      const op = operation(context, data, 'image', {
        resource,
        expectedRevision: data.expectedRevision,
        image,
      });
      return db.runTransaction(async (tx) => {
        const value = await readAdventureResource(tx, db, context, resource),
          prior = await receipt(tx, op);
        if (prior) return replayWithImage(tx, value, prior);
        if (value.block.revision !== data.expectedRevision) workConflict();
        const use = await prepareAdventureImageUse(
          tx,
          db,
          context,
          resource,
          adventureImage(resource, value.scene, value.block),
          image,
        );
        let plan;
        if (resource.kind === 'block') plan = await prepareAdditionalWrite(tx, value, { image });
        else {
          const write = await scenes.prepareAdventureSceneAggregateWrite(tx, {
            uid,
            target: context.target,
            root: value.root,
            snapshot: value.sceneSnapshot,
            extraWords: value.state.extra,
            blockCount: value.state.count,
            mainPatch: { mainBlockImage: image },
          });
          plan = { result: result(resource, write.value, write.value), commit: write.commit };
        }
        plan.commit();
        use.commit();
        recordReceipt(tx, op, plan.result);
        return plan.result;
      });
    },
    async getAdventureBlockCountStatus(uid, data) {
      const context = adventureBlockScope(db, uid, data, ['sceneId']),
        id = workId(data.sceneId);
      try {
        return await db.runTransaction(async (tx) => {
          const value = await readAdventureScene(tx, db, context, id, { includeState: false });
          return adventureBlockCountStatus(value.scene);
        });
      } catch (cause) {
        if (cause.code === 'not-found') return null;
        throw cause;
      }
    },
    async listAdventureBlocks(uid, data) {
      const context = adventureBlockScope(db, uid, data, [
          'sceneId',
          'archived',
          'cursor',
          'limit',
        ]),
        id = workId(data.sceneId),
        archived = data.archived ?? false,
        limit = workLimit(data.limit);
      if (typeof archived !== 'boolean') workFail('invalid-argument', 'Filtro inválido.');
      return db.runTransaction(async (tx) => {
        const value = await readAdventureScene(tx, db, context, id),
          scope = {
            uid,
            target: context.target,
            sceneId: id,
            archived,
            sceneRevision: value.scene.revision,
            structureRevision: value.state.structure,
          },
          cursor = historyCursor(data.cursor, scope);
        if (cursor) {
          blockInteger(cursor.date);
          workId(cursor.id);
        }
        let query = db
          .collection(context.path + '/sceneBlocks')
          .where('sceneId', '==', id)
          .where('archived', '==', archived)
          .where('deleting', '==', false)
          .orderBy('order')
          .orderBy('__name__')
          .limit(limit + 1);
        if (cursor) query = query.startAfter(cursor.date, cursor.id);
        const page = await tx.get(query),
          candidates = page.docs.map((snap) =>
            adventureBlockSummary({ kind: 'block', id: snap.id }, value.scene, snap.data()),
          );
        const main = adventureBlockSummary({ kind: 'scene', id }, value.scene);
        if (
          !archived &&
          (!cursor ||
            main.order > cursor.date ||
            (main.order === cursor.date && main.resource.id > cursor.id))
        )
          candidates.push(main);
        candidates.sort((a, b) => a.order - b.order || a.resource.id.localeCompare(b.resource.id));
        const selected = candidates.slice(0, limit),
          last = selected.at(-1);
        return {
          items: selected,
          ...adventureBlockTotals(value.scene),
          nextCursor:
            candidates.length > limit
              ? encodeHistoryCursor({ scope, date: last.order, id: last.resource.id })
              : null,
        };
      });
    },
    async getAdventureBlock(uid, data) {
      const context = adventureBlockScope(db, uid, data, ['resource']),
        resource = adventureBlockResource(data.resource);
      try {
        return await db.runTransaction(async (tx) => {
          const value = await readAdventureResource(tx, db, context, resource),
            body = await readAdventureBody(tx, db, value);
          return {
            ...adventureBlockSummary(resource, value.scene, value.block),
            content: body.content,
            sceneTitle: value.scene.title,
            adventureTitle: value.root.title,
            universeId: value.root.universeId ?? null,
            sceneArchived: value.scene.archived,
            ...adventureBlockTotals(value.scene),
          };
        });
      } catch (cause) {
        if (cause.code === 'not-found') return null;
        throw cause;
      }
    },
    async createAdventureBlock(uid, data) {
      const context = adventureBlockScope(db, uid, data, [
          'sceneId',
          'operationId',
          'title',
          'narrativeType',
          'audience',
          'content',
        ]),
        sceneId = workId(data.sceneId),
        fields = patch(
          Object.fromEntries(
            ['title', 'narrativeType', 'audience', 'content']
              .filter((key) => key in data)
              .map((key) => [key, data[key]]),
          ),
          true,
        ),
        op = operation(context, data, 'create', { sceneId, ...fields });
      return db.runTransaction(async (tx) => {
        const value = await readAdventureScene(tx, db, context, sceneId),
          prior = await receipt(tx, op);
        if (prior)
          return replay(await readAdventureResource(tx, db, context, prior.resource), prior);
        const plan = await createPlan(tx, value, op, fields);
        plan.commit();
        return plan.response;
      });
    },
    async updateAdventureBlock(uid, data) {
      const context = adventureBlockScope(db, uid, data, [
          'resource',
          'operationId',
          'expectedRevision',
          'patch',
        ]),
        resource = adventureBlockResource(data.resource),
        fields = patch(data.patch);
      sceneRevision(data.expectedRevision);
      const op = operation(context, data, 'update', {
        resource,
        expectedRevision: data.expectedRevision,
        patch: fields,
      });
      return db.runTransaction(async (tx) => {
        const value = await readAdventureResource(tx, db, context, resource),
          prior = await receipt(tx, op);
        if (prior) return replay(value, prior);
        if (value.block.revision !== data.expectedRevision) workConflict();
        let plan;
        if (resource.kind === 'block') plan = await prepareAdditionalWrite(tx, value, fields);
        else {
          const mainPatch = Object.fromEntries(
            ['title', 'narrativeType', 'audience']
              .filter((key) => key in fields)
              .map((key) => [
                {
                  title: 'mainBlockTitle',
                  narrativeType: 'mainBlockType',
                  audience: 'mainBlockAudience',
                }[key],
                fields[key],
              ]),
          );
          if ('content' in fields) {
            const write = await scenes.prepareSceneTextWrite(tx, {
              uid,
              target: context.target,
              root: value.root,
              snapshot: value.sceneSnapshot,
              content: fields.content,
              scenePatch: mainPatch,
            });
            const scene = { ...value.scene, ...mainPatch, ...write.result.scene };
            plan = { result: result(resource, scene, scene), commit: write.commit };
          } else {
            const write = await scenes.prepareAdventureSceneAggregateWrite(tx, {
              uid,
              target: context.target,
              root: value.root,
              snapshot: value.sceneSnapshot,
              extraWords: value.state.extra,
              blockCount: value.state.count,
              mainPatch,
            });
            plan = { result: result(resource, write.value, write.value), commit: write.commit };
          }
        }
        plan.commit();
        recordReceipt(tx, op, plan.result);
        return plan.result;
      });
    },
    async duplicateAdventureBlock(uid, data) {
      const context = adventureBlockScope(db, uid, data, [
          'resource',
          'operationId',
          'expectedRevision',
        ]),
        resource = adventureBlockResource(data.resource);
      sceneRevision(data.expectedRevision);
      const op = operation(context, data, 'duplicate', {
        resource,
        expectedRevision: data.expectedRevision,
      });
      return db.runTransaction(async (tx) => {
        const value = await readAdventureResource(tx, db, context, resource),
          prior = await receipt(tx, op);
        if (prior)
          return replayWithImage(
            tx,
            await readAdventureResource(tx, db, context, prior.resource),
            prior,
          );
        if (value.block.revision !== data.expectedRevision) workConflict();
        const body = await readAdventureBody(tx, db, value),
          metadata = adventureBlockSummary(resource, value.scene, value.block),
          plan = await createPlan(tx, value, op, {
            title: metadata.title,
            narrativeType: metadata.narrativeType,
            audience: metadata.audience,
            content: body.content,
            image: adventureImage(resource, value.scene, value.block),
          });
        plan.commit();
        return plan.response;
      });
    },
    async moveAdventureBlock(uid, data) {
      const context = adventureBlockScope(db, uid, data, [
          'resource',
          'operationId',
          'expectedRevision',
          'expectedStructureRevision',
          'direction',
        ]),
        resource = adventureBlockResource(data.resource);
      sceneRevision(data.expectedRevision);
      sceneRevision(data.expectedStructureRevision);
      if (!['up', 'down'].includes(data.direction))
        workFail('invalid-argument', 'Direção inválida.');
      const op = operation(context, data, 'move', {
        resource,
        expectedRevision: data.expectedRevision,
        expectedStructureRevision: data.expectedStructureRevision,
        direction: data.direction,
      });
      return db.runTransaction(async (tx) => {
        const value = await readAdventureResource(tx, db, context, resource),
          prior = await receipt(tx, op);
        if (prior) return replay(value, prior);
        if (
          value.block.revision !== data.expectedRevision ||
          value.state.structure !== data.expectedStructureRevision
        )
          workConflict();
        if (resource.kind === 'block' && value.block.archived)
          workFail('failed-precondition', 'Restaure o bloco antes de mudar sua posição.');
        const current = adventureBlockSummary(resource, value.scene, value.block),
          direction = data.direction === 'up' ? 'desc' : 'asc',
          page = await tx.get(
            db
              .collection(context.path + '/sceneBlocks')
              .where('sceneId', '==', value.scene.id)
              .where('archived', '==', false)
              .where('deleting', '==', false)
              .orderBy('order', direction)
              .orderBy('__name__', direction)
              .startAfter(current.order, resource.id)
              .limit(1),
          );
        const candidates = page.docs.map((snap) => ({
          resource: { kind: 'block', id: snap.id },
          record: snap.data(),
          ref: snap.ref,
        }));
        if (
          resource.kind !== 'scene' &&
          (data.direction === 'up'
            ? value.state.mainOrder < current.order
            : value.state.mainOrder > current.order)
        )
          candidates.push({
            resource: { kind: 'scene', id: value.scene.id },
            record: value.scene,
            ref: value.sceneSnapshot.ref,
          });
        candidates.sort(
          (a, b) =>
            Math.abs(
              (a.resource.kind === 'scene' ? value.state.mainOrder : a.record.order) -
                current.order,
            ) -
            Math.abs(
              (b.resource.kind === 'scene' ? value.state.mainOrder : b.record.order) -
                current.order,
            ),
        );
        const neighbor = candidates[0];
        if (!neighbor) workFail('failed-precondition', 'O bloco já está nessa extremidade.');
        const neighborOrder =
            neighbor.resource.kind === 'scene' ? value.state.mainOrder : neighbor.record.order,
          mainPatch =
            resource.kind === 'scene'
              ? { mainBlockOrder: neighborOrder }
              : neighbor.resource.kind === 'scene'
                ? { mainBlockOrder: current.order }
                : {},
          plan = await scenes.prepareAdventureSceneAggregateWrite(tx, {
            uid,
            target: context.target,
            root: value.root,
            snapshot: value.sceneSnapshot,
            extraWords: value.state.extra,
            blockCount: value.state.count,
            structureChanged: true,
            mainPatch,
          });
        let block = plan.value;
        if (resource.kind === 'block') {
          block = {
            ...value.block,
            order: neighborOrder,
            revision: value.block.revision + 1,
            updatedAt: plan.timestamp,
          };
        }
        const neighborPatch = {
            order: current.order,
            revision: neighbor.record.revision + 1,
            updatedAt: plan.timestamp,
          },
          response = result(resource, plan.value, block);
        plan.commit();
        if (resource.kind === 'block') tx.update(value.blockSnapshot.ref, block);
        if (neighbor.resource.kind === 'block') tx.update(neighbor.ref, neighborPatch);
        recordReceipt(tx, op, response);
        return response;
      });
    },
    async archiveAdventureBlock(uid, data) {
      const context = adventureBlockScope(db, uid, data, [
          'blockId',
          'operationId',
          'expectedRevision',
          'archived',
        ]),
        resource = { kind: 'block', id: workId(data.blockId) };
      sceneRevision(data.expectedRevision);
      if (typeof data.archived !== 'boolean') workFail('invalid-argument', 'Arquivo inválido.');
      const op = operation(context, data, 'archive', {
        resource,
        expectedRevision: data.expectedRevision,
        archived: data.archived,
      });
      return db.runTransaction(async (tx) => {
        const value = await readAdventureResource(tx, db, context, resource),
          prior = await receipt(tx, op);
        if (prior) return replay(value, prior);
        if (value.block.revision !== data.expectedRevision) workConflict();
        const plan = await prepareAdditionalWrite(
          tx,
          value,
          { archived: data.archived },
          { structureChanged: value.block.archived !== data.archived },
        );
        plan.commit();
        recordReceipt(tx, op, plan.result);
        return plan.result;
      });
    },
    async deleteAdventureBlock(uid, data) {
      const context = adventureBlockScope(db, uid, data, [
          'blockId',
          'operationId',
          'expectedRevision',
        ]),
        resource = { kind: 'block', id: workId(data.blockId) };
      sceneRevision(data.expectedRevision);
      const op = operation(context, data, 'delete', {
        resource,
        expectedRevision: data.expectedRevision,
      });
      await db.runTransaction(async (tx) => {
        const prior = await receipt(tx, op);
        if (prior) {
          await readAdventureScene(tx, db, context, prior.sceneId);
          return;
        }
        const value = await readAdventureResource(tx, db, context, resource);
        if (value.block.revision !== data.expectedRevision) workConflict();
        const plan = await prepareAdditionalWrite(
          tx,
          value,
          { deleting: true },
          { removed: true, structureChanged: true },
        );
        plan.commit();
        tx.create(op.ref, {
          fingerprint: op.fingerprint,
          sceneId: value.scene.id,
          complete: false,
          processed: 0,
        });
      });
      return db.runTransaction(async (tx) => {
        const prior = await receipt(tx, op),
          value = await readAdventureScene(tx, db, context, prior.sceneId);
        if (prior.complete)
          return {
            complete: true,
            processed: prior.processed,
            ...adventureBlockTotals(value.scene),
          };
        const ref = db.doc(context.path + '/sceneBlocks/' + resource.id),
          block = (await tx.get(ref)).data(),
          imageUse = await prepareAdventureImageUse(
            tx,
            db,
            context,
            resource,
            block?.image ?? null,
            null,
          ),
          page = await tx.get(
            db
              .collection(ref.path + '/body')
              .orderBy('__name__')
              .limit(25),
          ),
          complete = page.docs.length < 25,
          processed = prior.processed + page.docs.length;
        page.docs.forEach((snap) => tx.delete(snap.ref));
        imageUse.commit();
        if (complete) tx.delete(ref);
        else if (block?.image) tx.update(ref, { image: null });
        tx.set(op.ref, { ...prior, complete, processed });
        return { complete, processed, ...adventureBlockTotals(value.scene) };
      });
    },
    async verifyAdventureBlockCount(uid, data) {
      const context = adventureBlockScope(db, uid, data, [
          'sceneId',
          'operationId',
          'expectedSceneRevision',
          'limit',
        ]),
        sceneId = workId(data.sceneId),
        limit = workLimit(data.limit);
      sceneRevision(data.expectedSceneRevision);
      const op = operation(context, data, 'verify', {
        sceneId,
        expectedSceneRevision: data.expectedSceneRevision,
      });
      return db.runTransaction(async (tx) => {
        const value = await readAdventureScene(tx, db, context, sceneId, { repair: true }),
          prior = await receipt(tx, op);
        if (prior?.complete) {
          if (value.scene.revision !== prior.sceneRevision) workConflict();
          return {
            complete: true,
            processed: prior.processed,
            ...adventureBlockTotals(value.scene),
          };
        }
        if (value.scene.revision !== data.expectedSceneRevision) workConflict();
        let query = db
          .collection(context.path + '/sceneBlocks')
          .where('sceneId', '==', sceneId)
          .where('deleting', '==', false)
          .orderBy('__name__')
          .limit(limit + 1)
          .select('ownerId', 'sceneId', 'archived', 'wordCount', 'deleting');
        if (prior?.cursor) query = query.startAfter(prior.cursor);
        const page = await tx.get(query),
          selected = page.docs.slice(0, limit);
        let words = prior?.words ?? 0,
          count = prior?.count ?? 0;
        for (const snap of selected) {
          const block = snap.data();
          if (block.ownerId !== uid || block.sceneId !== sceneId)
            workFail('failed-precondition', 'Bloco inconsistente.');
          if (!block.archived) {
            words += blockInteger(block.wordCount);
            count++;
          }
        }
        blockInteger(words);
        blockInteger(count);
        const processed = (prior?.processed ?? 0) + selected.length,
          complete = page.docs.length <= limit;
        if (!complete) {
          tx.set(op.ref, {
            fingerprint: op.fingerprint,
            words,
            count,
            processed,
            cursor: selected.at(-1).id,
            complete: false,
          });
          return {
            complete: false,
            processed,
            sceneRevision: value.scene.revision,
            sceneWordCount: null,
            structureRevision: value.state.structure,
            mainBodyHash: value.scene.bodyHash,
          };
        }
        const plan = await scenes.prepareAdventureSceneAggregateWrite(tx, {
          uid,
          target: context.target,
          root: value.root,
          snapshot: value.sceneSnapshot,
          extraWords: words,
          blockCount: count,
          repair: true,
        });
        plan.commit();
        tx.set(op.ref, {
          fingerprint: op.fingerprint,
          complete: true,
          processed,
          sceneRevision: plan.value.revision,
        });
        return { complete: true, processed, ...adventureBlockTotals(plan.value) };
      });
    },
  };
  return api;
}
