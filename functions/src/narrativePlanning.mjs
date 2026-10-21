import { readAdventureLoreContext } from './adventureLore.mjs';
import { storedMetadata as storedAdventureLoreMetadata } from './adventureLoreContracts.mjs';
import { sceneRankBetween, validSceneRank } from './sceneRanks.mjs';
import { addNarrativeJobs } from './narrativeJobs.mjs';
import {
  fail,
  id,
  limit,
  version,
  date,
  digest,
  conflict,
  envelope,
  fields,
  resource,
  sequenceResource,
  sourceKey,
  sequenceKey,
  loreReference,
  reference,
  scope,
  itemPath,
  operation,
  observation,
  encodeCursor,
  decodeCursor,
  inputText,
} from './narrativeContracts.mjs';

export function createNarrativePlanningService({ db, now = Date.now }) {
  const root = async (context, tx, deleting = false) => {
    const snap = await tx.get(context.ref),
      p = snap.data();
    if (!p || p[context.owner] !== context.uid || (!deleting && p.deleting))
      fail('not-found', 'Projeto indisponível.');
    return p;
  };
  const controlRef = (context, value) =>
    db.doc(`${context.path}/narrativeControls/${sequenceKey(value)}`);
  const sequenceView = (value, state = {}) => ({
    resource: sequenceResource(value),
    structureRevision: state.structureRevision ?? 0,
    rankSlot: state.rankSlot ?? 'A',
    rebalancing: state.rebalancing ?? false,
    ...(state.rebalancing && state.rebalanceOperationId
      ? { rebalanceOperationId: state.rebalanceOperationId }
      : {}),
  });
  async function sequence(context, value, tx, structural = false) {
    if (value.kind === 'milestone') {
      const arc = (await tx.get(db.doc(`${context.path}/arcs/${value.arcId}`))).data();
      if (!arc || arc.ownerId !== context.uid || arc.deleting)
        fail('not-found', 'Arco indisponível.');
    }
    const ref = controlRef(context, value),
      snap = await tx.get(ref),
      state = sequenceView(value, snap.data());
    if (structural && state.rebalancing)
      fail('failed-precondition', 'Retome a reorganização antes de mudar a ordem.');
    return { ref, state };
  }
  const rankField = (state) => `rank${state.rankSlot}`;
  function summary(record, state) {
    return {
      ...recordSource(record),
      ownerId: record.ownerId,
      schemaVersion: 1,
      revision: record.revision,
      title: record.title,
      rank: record[rankField(state)],
      referenceCount: record.referenceCount ?? 0,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      ...(record.kind === 'event' ? { dateLabel: record.dateLabel ?? '' } : {}),
      ...(record.deleting
        ? { deleting: true, deletionOperationId: record.deletionOperationId }
        : {}),
    };
  }
  // Stored records contain additional fields; source extraction never passes the record to input validation.
  const recordSource = (record) => ({
    kind: record.kind,
    id: record.id,
    ...(record.kind === 'milestone' ? { arcId: record.arcId } : {}),
  });
  async function item(context, source, tx, { deleting = false } = {}) {
    const ref = db.doc(itemPath(context, source)),
      snap = await tx.get(ref),
      value = snap.data();
    if (!value || value.ownerId !== context.uid || (!deleting && value.deleting))
      fail('not-found', 'Item indisponível.');
    if (source.kind === 'milestone') await sequence(context, source, tx);
    return { ref, value };
  }
  async function receipt(tx, op) {
    const previous = (await tx.get(op.ref)).data();
    if (previous && previous.fingerprint !== op.fingerprint)
      fail('invalid-argument', 'Operação utilizada com outros dados.');
    return previous;
  }
  const saveReceipt = (tx, op, value) => tx.set(op.ref, { fingerprint: op.fingerprint, ...value });
  function writeRoot(tx, context, p, timestamp) {
    const revision = (p.narrativeRevision ?? 0) + 1;
    version(revision);
    tx.update(context.ref, {
      hasNarrativeResources: true,
      narrativeRevision: revision,
      updatedAt: timestamp,
    });
    return revision;
  }
  function writeSequence(tx, entry, timestamp, structure = true) {
    const state = {
      ...entry.state,
      structureRevision: entry.state.structureRevision + (structure ? 1 : 0),
      updatedAt: timestamp,
    };
    tx.set(entry.ref, state, { merge: true });
    return sequenceView(state.resource, state);
  }
  const result = (value, p, state, revision = p.narrativeRevision ?? 0) => ({
    item: summary(value, state),
    projectRevision: revision,
    sceneRevision: p.sceneRevision ?? 0,
    sequence: state,
  });
  const baseCursor = (context, kind, extra = {}) => ({
    uid: context.uid,
    target: context.target,
    kind,
    ...extra,
  });
  async function lore(context, p, ref, tx) {
    return (await loreState(context, p, ref, tx)).entity;
  }
  async function loreState(context, p, ref, tx) {
    let snapshot, worldSnapshot, localContext;
    if (ref.kind === 'book') {
      if (context.target.kind === 'book' && ref.scopeId === context.target.id)
        snapshot = await tx.get(db.doc(`${context.path}/lore/${ref.entityId}`));
    } else if (ref.kind === 'adventure') {
      if (context.target.kind === 'adventure' && ref.scopeId === context.target.id) {
        localContext = await readAdventureLoreContext(
          tx,
          db,
          context.uid,
          { adventureId: context.target.id },
          true,
          false,
        );
        snapshot = await tx.get(db.doc(context.path + '/lore/' + ref.entityId));
      }
    } else if (ref.scopeId === p.universeId) {
      worldSnapshot = await tx.get(db.doc(`universes/${ref.scopeId}`));
      const universe = worldSnapshot.data();
      if (universe?.authorId === context.uid && !universe.deleting)
        snapshot = await tx.get(db.doc(`universes/${ref.scopeId}/lore/${ref.entityId}`));
    }
    const rawEntity = snapshot?.data() ?? null,
      localEntity =
        localContext && rawEntity?.adventureToken === localContext.adventureToken
          ? storedAdventureLoreMetadata(rawEntity, localContext, ref.entityId)
          : null,
      entity =
        ref.kind === 'adventure'
          ? localEntity && !localEntity.deleted
            ? localEntity
            : null
          : rawEntity && !rawEntity.deleted && !rawEntity.deleting
            ? rawEntity
            : null,
      world = worldSnapshot?.data();
    return {
      entity,
      observed: {
        originAvailable: Boolean(entity),
        originUpdatedAt: entity?.updatedAt ?? 0,
        originRevision: entity?.revision ?? 0,
        originSnapshot: snapshot?.updateTime?.toMillis?.() ?? 0,
        originWorldSnapshot: worldSnapshot?.updateTime?.toMillis?.() ?? 0,
        originWorldDate: world?.updatedAt ?? 0,
        originLoreVersion: world?.loreVersion ?? 0,
        originLocalLoreVersion: p.loreVersion ?? 0,
        originLocalIdentity: localContext?.adventureToken ?? null,
        originPrivacyVersion: world?.privacyVersion ?? 0,
        linkedUniverseId: p.universeId ?? null,
      },
    };
  }
  async function resolve(context, p, ref, tx) {
    if (ref.kind === 'lore') {
      const value = await lore(context, p, ref.reference, tx);
      return value ? { label: value.name ?? '', category: value.category ?? '' } : null;
    }
    const value = (
      await tx.get(
        db.doc(
          `${context.path}/${ref.kind === 'scene' ? 'scenes' : 'timelineEvents'}/${ref.kind === 'scene' ? ref.sceneId : ref.eventId}`,
        ),
      )
    ).data();
    if (!value || value.ownerId !== context.uid || value.deleting) return null;
    return {
      label: value.title ?? '',
      ...(ref.kind === 'scene' ? { archived: Boolean(value.archived) } : {}),
    };
  }
  async function placement(context, value, seq, tx, data = {}, movingId = null) {
    const field = rankField(seq.state),
      collection = db.collection(itemPath(context, sequenceResource(value)));
    const load = async (itemId) => {
      if (itemId == null) return null;
      const record = (
        await tx.get(db.doc(`${itemPath(context, sequenceResource(value))}/${id(itemId)}`))
      ).data();
      if (!record || record.deleting || record.id === movingId || record.ownerId !== context.uid)
        fail('invalid-argument', 'Vizinho indisponível.');
      return record;
    };
    let before = await load(data.beforeId),
      after = await load(data.afterId);
    if (before && after && !(after[field] < before[field]))
      fail('invalid-argument', 'Vizinhos fora de ordem.');
    // Deleting records retain their rank until cleanup. They remain real neighbors so no unbounded scan is needed.
    let query;
    if (after)
      query = collection
        .orderBy(field)
        .orderBy('__name__')
        .startAfter(after[field], after.id)
        .limit(2);
    else if (before)
      query = collection
        .orderBy(field, 'desc')
        .orderBy('__name__', 'desc')
        .startAfter(before[field], before.id)
        .limit(2);
    else query = collection.orderBy(field, 'desc').orderBy('__name__', 'desc').limit(2);
    const neighbors = (await tx.get(query)).docs
      .map((snap) => snap.data())
      .filter((record) => record.id !== movingId);
    if (after) {
      if (before && neighbors[0]?.id !== before.id) conflict();
      before ??= neighbors[0] ?? null;
    } else after = neighbors[0] ?? null;
    return sceneRankBetween(after?.[field] ?? null, before?.[field] ?? null);
  }
  async function mutate(uid, data, method) {
    const create = method === 'createNarrativeItem';
    const context = scope(
      db,
      uid,
      data,
      create
        ? [
            'operationId',
            'resource',
            'title',
            'initialState',
            'objective',
            'plannedOutcome',
            'description',
            'dateLabel',
            'notes',
          ]
        : method === 'updateNarrativeItem'
          ? ['operationId', 'source', 'expectedRevision', 'patch']
          : method === 'moveNarrativeItem'
            ? [
                'operationId',
                'source',
                'expectedRevision',
                'expectedStructureRevision',
                'beforeId',
                'afterId',
              ]
            : ['operationId', 'source', 'expectedRevision', 'reference', 'remove'],
    );
    const source = resource(create ? data.resource : data.source, !create),
      normalized = { ...data };
    delete normalized.target;
    delete normalized.operationId;
    let patch, ref;
    if (create) {
      const ownFields = Object.fromEntries(
        Object.entries(data).filter(
          ([key]) => !['target', 'operationId', 'resource'].includes(key),
        ),
      );
      patch = inputText(source.kind, ownFields);
      normalized.fields = patch;
    } else {
      version(data.expectedRevision);
      if (method === 'updateNarrativeItem') {
        patch = inputText(source.kind, data.patch, true);
        if (!Object.keys(patch).length) fail('invalid-argument', 'Informe uma alteração.');
        normalized.patch = patch;
      }
      if (method === 'moveNarrativeItem') {
        version(data.expectedStructureRevision);
        if (data.beforeId != null) id(data.beforeId);
        if (data.afterId != null) id(data.afterId);
      }
      if (method === 'setNarrativeReference') {
        ref = reference(data.reference);
        if (data.remove !== undefined && typeof data.remove !== 'boolean')
          fail('invalid-argument', 'Remoção inválida.');
        normalized.reference = ref;
        normalized.remove = data.remove ?? false;
      }
    }
    const op = operation(db, context, data, method, normalized);
    return db.runTransaction(async (tx) => {
      const p = await root(context, tx),
        previous = await receipt(tx, op);
      if (previous) {
        const current = await item(context, previous.source, tx),
          seq = await sequence(context, previous.source, tx);
        if (!create && current.value.revision !== previous.revision) conflict();
        return result(current.value, p, seq.state);
      }
      const seq = await sequence(context, source, tx, create || method === 'moveNarrativeItem');
      let old, itemRef, value, linkRef, existing;
      if (!create) {
        ({ value: old, ref: itemRef } = await item(context, source, tx));
        if (old.revision !== data.expectedRevision) conflict();
      } else {
        itemRef = db.doc(`${itemPath(context, source)}/${op.id}`);
        if ((await tx.get(itemRef)).exists) fail('already-exists', 'Identidade já utilizada.');
      }
      const timestamp = date(now, p.updatedAt ?? 0);
      if (create) {
        const rank = await placement(context, source, seq, tx);
        value = {
          ...source,
          id: op.id,
          ownerId: uid,
          schemaVersion: 1,
          revision: 1,
          ...patch,
          rankA: rank,
          rankB: rank,
          referenceCount: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
      } else {
        value = { ...old, revision: old.revision + 1, updatedAt: timestamp };
        if (method === 'updateNarrativeItem') Object.assign(value, patch);
        else if (method === 'moveNarrativeItem') {
          if (seq.state.structureRevision !== data.expectedStructureRevision) conflict();
          value[rankField(seq.state)] = await placement(context, source, seq, tx, data, source.id);
        } else {
          linkRef = db.doc(`${context.path}/narrativeLinks/${digest({ source, reference: ref })}`);
          existing = (await tx.get(linkRef)).exists;
          if (!data.remove && !(await resolve(context, p, ref, tx)))
            fail('permission-denied', 'Referência indisponível.');
          value.referenceCount = Math.max(
            0,
            (old.referenceCount ?? 0) + (data.remove ? (existing ? -1 : 0) : existing ? 0 : 1),
          );
        }
      }
      envelope(value);
      version(value.revision);
      const projectRevision = writeRoot(tx, context, p, timestamp);
      if (create) tx.create(itemRef, value);
      else tx.update(itemRef, value);
      if (linkRef) {
        if (data.remove) tx.delete(linkRef);
        else
          tx.set(linkRef, {
            id: linkRef.id,
            source,
            sourceKey: sourceKey(source),
            sourceArcId:
              source.kind === 'milestone' ? source.arcId : source.kind === 'arc' ? source.id : null,
            reference: ref,
            ...(ref.kind === 'lore' ? { loreKey: digest(ref.reference) } : {}),
          });
      }
      const state =
        create || method === 'moveNarrativeItem' ? writeSequence(tx, seq, timestamp) : seq.state;
      saveReceipt(tx, op, {
        source: recordSource(value),
        revision: value.revision,
        createdAt: timestamp,
      });
      return result(value, p, state, projectRevision);
    });
  }
  async function page(
    context,
    p,
    tx,
    query,
    cursorContext,
    cursorInput,
    pageLimit,
    key = (snap) => snap.id,
    map = (snap) => snap.data(),
    extraObservation = {},
    extra = {},
  ) {
    const observed = { ...observation(p), ...extraObservation },
      cursor = decodeCursor(cursorInput, cursorContext, observed);
    if (cursor)
      query = cursorContext.ordered
        ? query.startAfter(cursor.key, cursor.id)
        : query.startAfter(cursor.id);
    const snapshot = await tx.get(query.limit(pageLimit + 1)),
      visible = snapshot.docs.slice(0, pageLimit),
      items = [];
    let last;
    for (const snap of visible) {
      const value = await map(snap);
      const candidate = {
        items: value == null ? items : [...items, value],
        nextCursor: encodeCursor(cursorContext, observed, key(snap), snap.id),
        projectRevision: p.narrativeRevision ?? 0,
        sceneRevision: p.sceneRevision ?? 0,
        ...extra,
      };
      if (Buffer.byteLength(JSON.stringify(candidate)) > 1000000) {
        if (!last) fail('failed-precondition', 'Item acima do orçamento de resposta.');
        break;
      }
      if (value != null) items.push(value);
      last = snap;
    }
    return {
      items,
      nextCursor:
        snapshot.docs.length > visible.length || last !== visible.at(-1)
          ? encodeCursor(cursorContext, observed, key(last), last.id)
          : null,
      projectRevision: p.narrativeRevision ?? 0,
      sceneRevision: p.sceneRevision ?? 0,
      ...extra,
    };
  }
  const api = {
    createNarrativeItem: (uid, data) => mutate(uid, data, 'createNarrativeItem'),
    updateNarrativeItem: (uid, data) => mutate(uid, data, 'updateNarrativeItem'),
    moveNarrativeItem: (uid, data) => mutate(uid, data, 'moveNarrativeItem'),
    setNarrativeReference: (uid, data) => mutate(uid, data, 'setNarrativeReference'),
    async getNarrativeContext(uid, data) {
      const context = scope(db, uid, data, []);
      try {
        return await db.runTransaction(async (tx) => {
          const p = await root(context, tx),
            index = (
              await tx.get(db.doc(`${context.path}/narrativeControls/entity-scenes`))
            ).data();
          return {
            target: context.target,
            ownerId: uid,
            title: p.title,
            universeId: p.universeId ?? null,
            projectRevision: p.narrativeRevision ?? 0,
            sceneRevision: p.sceneRevision ?? 0,
            updatedAt: p.updatedAt ?? 0,
            hasResources: p.hasNarrativeResources ?? false,
            entityIndexReady: index?.complete ?? false,
            ...(index?.operationId && !index.complete
              ? { entityIndexOperationId: index.operationId }
              : {}),
          };
        });
      } catch (error) {
        if (error.code === 'not-found') return null;
        throw error;
      }
    },
    async getNarrativeItem(uid, data) {
      const context = scope(db, uid, data, ['source']),
        source = resource(data.source, true);
      try {
        return await db.runTransaction(async (tx) => {
          await root(context, tx);
          const current = await item(context, source, tx),
            seq = await sequence(context, source, tx);
          const long = Object.fromEntries(
            fields[source.kind].map((key) => [key, current.value[key] ?? '']),
          );
          return { ...summary(current.value, seq.state), ...long };
        });
      } catch (error) {
        if (error.code === 'not-found') return null;
        throw error;
      }
    },
    async listNarrativeItems(uid, data) {
      const context = scope(db, uid, data, ['resource', 'cursor', 'limit']),
        value = resource(data.resource),
        pageLimit = limit(data.limit);
      return db.runTransaction(async (tx) => {
        const p = await root(context, tx),
          seq = await sequence(context, value, tx),
          field = rankField(seq.state),
          c = baseCursor(context, 'items', { resource: value, ordered: true });
        return page(
          context,
          p,
          tx,
          db.collection(itemPath(context, value)).orderBy(field).orderBy('__name__'),
          c,
          data.cursor,
          pageLimit,
          (snap) => {
            const rank = snap.data()[field];
            if (!validSceneRank(rank)) fail('failed-precondition', 'Posição inválida.');
            return rank;
          },
          (snap) => summary(snap.data(), seq.state),
          { structure: seq.state.structureRevision, rankSlot: seq.state.rankSlot },
          { sequence: seq.state },
        );
      });
    },
    async listNarrativeReferences(uid, data) {
      const context = scope(db, uid, data, ['source', 'cursor', 'limit']),
        source = resource(data.source, true),
        pageLimit = limit(data.limit);
      return db.runTransaction(async (tx) => {
        const p = await root(context, tx);
        await item(context, source, tx);
        return page(
          context,
          p,
          tx,
          db
            .collection(`${context.path}/narrativeLinks`)
            .where('sourceKey', '==', sourceKey(source))
            .orderBy('__name__'),
          baseCursor(context, 'references', { source }),
          data.cursor,
          pageLimit,
          undefined,
          async (snap) => {
            const link = snap.data(),
              available = await resolve(context, p, link.reference, tx);
            return {
              id: snap.id,
              reference: link.reference,
              available: Boolean(available),
              ...(available ?? {}),
            };
          },
        );
      });
    },
    async listNarrativeLoreOptions(uid, data) {
      const context = scope(db, uid, data, ['scope', 'cursor', 'limit']),
        pageLimit = limit(data.limit);
      if (
        !['book', 'adventure', 'universe'].includes(data.scope) ||
        (['book', 'adventure'].includes(data.scope) && context.target.kind !== data.scope)
      )
        fail('invalid-argument', 'Escopo de lore inválido.');
      return db.runTransaction(async (tx) => {
        const p = await root(context, tx);
        const localContext =
          data.scope === 'adventure'
            ? await readAdventureLoreContext(
                tx,
                db,
                uid,
                { adventureId: context.target.id },
                true,
                false,
              )
            : null;
        let path,
          world = null;
        if (['book', 'adventure'].includes(data.scope)) path = `${context.path}/lore`;
        else if (p.universeId) {
          world = (await tx.get(db.doc(`universes/${id(p.universeId)}`))).data();
          if (world?.authorId === uid && !world.deleting) path = `universes/${p.universeId}/lore`;
        }
        const c = baseCursor(context, 'lore-options', { scope: data.scope }),
          observed = {
            originId: p.universeId ?? null,
            originDate: world?.updatedAt ?? 0,
            originLore: world?.loreVersion ?? 0,
            originLocalLore: p.loreVersion ?? 0,
            originLocalIdentity: localContext?.adventureToken ?? null,
            originPrivacy: world?.privacyVersion ?? 0,
            available: Boolean(path),
          };
        if (!path) {
          decodeCursor(data.cursor, c, { ...observation(p), ...observed });
          return {
            items: [],
            nextCursor: null,
            projectRevision: p.narrativeRevision ?? 0,
            sceneRevision: p.sceneRevision ?? 0,
          };
        }
        return page(
          context,
          p,
          tx,
          (data.scope === 'adventure'
            ? db.collection(path).where('deleted', '==', false)
            : db.collection(path)
          ).orderBy('__name__'),
          c,
          data.cursor,
          pageLimit,
          undefined,
          (snap) => {
            if (localContext) storedAdventureLoreMetadata(snap.data(), localContext, snap.id);
            return {
              reference: {
                kind: data.scope,
                scopeId: data.scope === 'universe' ? p.universeId : context.target.id,
                entityId: snap.id,
              },
              name: snap.data().name ?? '',
              category: snap.data().category ?? '',
            };
          },
          observed,
        );
      });
    },
    async listEntityScenes(uid, data) {
      const context = scope(db, uid, data, ['reference', 'cursor', 'limit']),
        ref = loreReference(data.reference),
        pageLimit = limit(data.limit);
      return db.runTransaction(async (tx) => {
        const p = await root(context, tx),
          control = (
            await tx.get(db.doc(`${context.path}/narrativeControls/entity-scenes`))
          ).data();
        if (!control?.complete)
          fail(
            'failed-precondition',
            'Prepare o índice de referências antes de consultar.',
            'entity-index-not-ready',
          );
        const origin = await loreState(context, p, ref, tx);
        return page(
          context,
          p,
          tx,
          db
            .collection(`${context.path}/sceneLoreLinks`)
            .where('loreKey', '==', digest(ref))
            .orderBy('__name__'),
          baseCursor(context, 'entity-scenes', { reference: ref }),
          data.cursor,
          pageLimit,
          undefined,
          async (snap) => {
            const link = snap.data(),
              value = (await tx.get(db.doc(`${context.path}/scenes/${id(link.sceneId)}`))).data(),
              live = (
                await tx.get(
                  db.doc(`${context.path}/scenes/${link.sceneId}/references/${digest(ref)}`),
                )
              ).exists;
            const available = Boolean(
              origin.entity && live && value?.ownerId === uid && !value.deleting,
            );
            return {
              id: snap.id,
              sceneId: link.sceneId,
              available,
              ...(available
                ? {
                    title: value.title,
                    archived: Boolean(value.archived),
                    parentId: value.parentId ?? null,
                  }
                : {}),
            };
          },
          origin.observed,
        );
      });
    },
    async listEntityNarrativeItems(uid, data) {
      const context = scope(db, uid, data, ['reference', 'cursor', 'limit']),
        ref = loreReference(data.reference),
        pageLimit = limit(data.limit);
      return db.runTransaction(async (tx) => {
        const p = await root(context, tx),
          origin = await loreState(context, p, ref, tx),
          c = baseCursor(context, 'entity-items', { reference: ref });
        if (!origin.entity) {
          decodeCursor(data.cursor, c, { ...observation(p), ...origin.observed });
          return {
            items: [],
            nextCursor: null,
            projectRevision: p.narrativeRevision ?? 0,
            sceneRevision: p.sceneRevision ?? 0,
          };
        }
        return page(
          context,
          p,
          tx,
          db
            .collection(`${context.path}/narrativeLinks`)
            .where('loreKey', '==', digest(ref))
            .orderBy('__name__'),
          c,
          data.cursor,
          pageLimit,
          undefined,
          async (snap) => {
            try {
              const current = await item(context, snap.data().source, tx),
                seq = await sequence(context, snap.data().source, tx);
              return summary(current.value, seq.state);
            } catch (error) {
              if (error.code === 'not-found') return null;
              throw error;
            }
          },
          origin.observed,
        );
      });
    },
  };
  addNarrativeJobs(api, {
    db,
    now,
    root,
    sequence,
    controlRef,
    sequenceView,
    rankField,
    item,
    writeRoot,
    writeSequence,
    receipt,
    saveReceipt,
    baseCursor,
  });
  return api;
}
