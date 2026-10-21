import { countVisibleWords } from './visibleWordCount.mjs';
import { isCampaignDeletionError } from './campaignDeletionGuard.mjs';
import { createWorkProgressLedger } from './workProgressLedger.mjs';
import { addWorkProgressLegacy } from './workProgressLegacy.mjs';
import {
  digest,
  workFail,
  workConflict,
  workClosed,
  workId,
  workTarget,
  workPath,
  workRevision,
  workLimit,
  workTitle,
  workDate,
  workScope,
  workProject,
  readWorkControl,
  workOperation,
  readWorkReceipt,
  writeWorkReceipt,
  workCursor,
  encodeWorkCursor,
  workItem,
  readWorkMetadata,
} from './workProgressContracts.mjs';

const MAX_STORED_BODY_BYTES = 1_048_576;
const COUNT_WORK_BYTES = 2 * MAX_STORED_BODY_BYTES;
const activityRef = (db, uid) => db.doc('users/' + uid + '/workActivityState/current');
const preferenceRef = (db, uid) => db.doc('users/' + uid + '/workPreferences/current');
const preparationView = (control) => ({
  complete: control.countReady,
  processed: control.processed,
  wordCount: control.countReady ? control.wordCount : null,
});
const totals = (control) => ({
  checklistRevision: control.checklistRevision,
  total: control.checklistTotal,
  completed: control.checklistCompleted,
});
const metadataView = (control) => ({
  revision: control.revision,
  editorialState: control.editorialState,
  wordGoal: control.wordGoal,
});
function requireKind(context, kinds) {
  if (!kinds.includes(context.target.kind))
    workFail('invalid-argument', 'Esta operação não se aplica a esse projeto.');
}
function authorizeUser(uid, data, keys) {
  if (!uid) workFail('unauthenticated', 'Entre na sua conta.');
  return workClosed(data, keys);
}
function resource(value, target) {
  workClosed(value, value?.kind === 'project' ? ['kind'] : ['kind', 'id']);
  if (value.kind === 'project') return { kind: 'project' };
  if (
    (value.kind === 'chapter' && target.kind === 'book') ||
    (value.kind === 'scene' && target.kind !== 'campaign')
  )
    return { kind: value.kind, id: workId(value.id) };
  workFail('invalid-argument', 'Recurso inválido para esse projeto.');
}
export function createWorkProgressService({ db, now = Date.now, countWords = countVisibleWords }) {
  const ledger = createWorkProgressLedger({ db, countWords });
  function activate(tx, context, root, control) {
    if (!root.hasProgressResources) {
      tx.update(context.ref, {
        hasProgressResources: true,
        ...(context.target.kind === 'campaign' ? {} : { editorialState: control.editorialState }),
      });
    }
  }
  async function activityVersion(tx, uid) {
    return (await tx.get(activityRef(db, uid))).data()?.revision ?? 0;
  }
  function progressView(context, root, control, activityRevision) {
    return {
      target: context.target,
      ownerId: context.uid,
      title: root.title,
      revision: control.revision,
      activityRevision,
      archived: root.status === 'archived',
      editorialState: context.target.kind === 'campaign' ? null : control.editorialState,
      wordGoal: context.target.kind === 'campaign' ? null : control.wordGoal,
      manuscript:
        context.target.kind === 'campaign'
          ? null
          : {
              ready: control.countReady,
              wordCount: control.countReady ? control.wordCount : null,
              ...(!control.countReady && control.operationId
                ? { operationId: control.operationId, processed: control.processed }
                : {}),
            },
      checklist:
        context.target.kind === 'book'
          ? null
          : { total: control.checklistTotal, completed: control.checklistCompleted },
    };
  }
  async function availableResource(tx, context, value) {
    if (value.kind === 'project') return true;
    const ref = db.doc(
      context.path + '/' + (value.kind === 'chapter' ? 'chapters' : 'scenes') + '/' + value.id,
    );
    const stored = (
      await readWorkMetadata(tx, ref, ['ownerId', 'bookId', 'parentId', 'archived', 'deleting'])
    ).data();
    if (!stored || stored.deleting || (stored.bookId && stored.bookId !== context.target.id))
      return false;
    if (value.kind === 'chapter') return true;
    if (stored.ownerId !== context.uid) return false;
    if (stored.parentId !== null && stored.parentId !== undefined) {
      const parent = (
        await readWorkMetadata(
          tx,
          db.doc(
            context.path +
              '/' +
              (context.target.kind === 'book' ? 'chapters' : 'parts') +
              '/' +
              stored.parentId,
          ),
          ['ownerId', 'contentMode', 'deleting'],
        )
      ).data();
      if (
        !parent ||
        (parent.ownerId && parent.ownerId !== context.uid) ||
        (parent.deleting && !stored.archived)
      )
        return false;
      if (context.target.kind === 'book' && parent.contentMode !== 'scenes') return false;
    }
    return (await readWorkMetadata(tx, db.doc(ref.path + '/body/current'), ['hash', 'revision']))
      .exists;
  }
  async function resolve(tx, context, root, row) {
    const candidate = row?.resource ? resource(row.resource, context.target) : { kind: 'project' };
    const valid = await availableResource(tx, context, candidate);
    return {
      target: context.target,
      title: root.title,
      resource: valid ? candidate : { kind: 'project' },
      fallback: !valid,
    };
  }
  const api = {
    async getWorkProgress(uid, data) {
      const context = workScope(db, uid, data, []);
      try {
        return await db.runTransaction(async (tx) => {
          const root = await workProject(tx, context),
            control = await readWorkControl(tx, db, context, root),
            activityRevision = await activityVersion(tx, uid);
          return progressView(context, root, control.value, activityRevision);
        });
      } catch (error) {
        if (error.code === 'not-found' || isCampaignDeletionError(error)) return null;
        throw error;
      }
    },
    async updateWorkProgress(uid, data) {
      const context = workScope(db, uid, data, ['operationId', 'expectedRevision', 'patch']);
      requireKind(context, ['book', 'adventure']);
      workRevision(data.expectedRevision);
      workClosed(data.patch, ['editorialState', 'wordGoal']);
      if (!Object.keys(data.patch).length) workFail('invalid-argument', 'Informe uma alteração.');
      if (
        'editorialState' in data.patch &&
        !['draft', 'review', 'ready'].includes(data.patch.editorialState)
      )
        workFail('invalid-argument', 'Estado editorial inválido.');
      if (
        'wordGoal' in data.patch &&
        data.patch.wordGoal !== null &&
        (!Number.isSafeInteger(data.patch.wordGoal) || data.patch.wordGoal < 1)
      )
        workFail('invalid-argument', 'Informe uma meta inteira positiva.');
      const op = workOperation(db, uid, 'updateWorkProgress', data, {
        target: context.target,
        expectedRevision: data.expectedRevision,
        patch: data.patch,
      });
      return db.runTransaction(async (tx) => {
        const root = await workProject(tx, context),
          control = await readWorkControl(tx, db, context, root),
          previous = await readWorkReceipt(tx, op);
        if (previous) {
          if (previous.revision !== control.value.revision) workConflict();
          return metadataView(control.value);
        }
        if (control.value.revision !== data.expectedRevision) workConflict();
        const next = {
          ...control.value,
          ...data.patch,
          revision: control.value.revision + 1,
          updatedAt: workDate(now, control.value.updatedAt ?? 0),
        };
        activate(tx, context, root, next);
        tx.update(context.ref, { editorialState: next.editorialState });
        tx.set(control.ref, next);
        writeWorkReceipt(tx, op, { revision: next.revision });
        return metadataView(next);
      });
    },
    async prepareWorkWordCount(uid, data) {
      const context = workScope(db, uid, data, ['operationId', 'limit']);
      requireKind(context, ['book', 'adventure']);
      const limit = workLimit(data.limit),
        op = workOperation(db, uid, 'prepareWorkWordCount', data, { target: context.target });
      await db.runTransaction(async (tx) => {
        const root = await workProject(tx, context),
          control = await readWorkControl(tx, db, context, root),
          previous = await readWorkReceipt(tx, op);
        if (previous) return;
        if (control.value.countReady) {
          writeWorkReceipt(tx, op, {
            kind: 'count',
            target: context.target,
            operationId: control.value.operationId ?? op.id,
          });
          return;
        }
        const next = { ...control.value, operationId: control.value.operationId ?? op.id };
        activate(tx, context, root, next);
        tx.set(control.ref, next);
        writeWorkReceipt(tx, op, {
          kind: 'count',
          target: context.target,
          operationId: next.operationId,
        });
      });
      let bytes = 0,
        attempts = 0;
      while (attempts < limit && bytes <= COUNT_WORK_BYTES - MAX_STORED_BODY_BYTES) {
        const page = await db.runTransaction(async (tx) => {
          const root = await workProject(tx, context),
            control = await readWorkControl(tx, db, context, root);
          if (control.value.countReady)
            return { done: true, value: preparationView(control.value) };
          let query = db
            .collection(context.path + '/' + control.value.phase)
            .orderBy('__name__')
            .limit(limit - attempts);
          if (typeof query.select === 'function')
            query = query.select(
              'ownerId',
              'bookId',
              'parentId',
              'archived',
              'contentMode',
              'deleting',
            );
          if (control.value.cursor) query = query.startAfter(control.value.cursor);
          const snapshot = await tx.get(query);
          if (!snapshot.docs.length) {
            const next = {
              ...control.value,
              cursor: null,
              phase: control.value.phase === 'chapters' ? 'scenes' : 'done',
              countReady: control.value.phase === 'scenes',
            };
            tx.set(control.ref, next);
            if (next.countReady && context.target.kind === 'book')
              tx.update(context.ref, { wordCount: next.wordCount });
            return { done: next.countReady, value: preparationView(next), docs: [] };
          }
          return {
            done: false,
            phase: control.value.phase,
            docs: snapshot.docs.map((item) => ({ id: item.id })),
          };
        });
        if (page.done) return page.value;
        if (!page.docs.length) continue;
        for (const entry of page.docs) {
          if (attempts >= limit || bytes > COUNT_WORK_BYTES - MAX_STORED_BODY_BYTES) break;
          const result = await db.runTransaction(async (tx) => {
            const root = await workProject(tx, context),
              control = await readWorkControl(tx, db, context, root);
            if (
              control.value.countReady ||
              control.value.phase !== page.phase ||
              (control.value.cursor !== null &&
                Buffer.compare(Buffer.from(entry.id), Buffer.from(control.value.cursor)) <= 0)
            )
              return { bytes: 0, processed: false };
            const kind = page.phase === 'chapters' ? 'chapter' : 'scene',
              sourceRef = db.doc(context.path + '/' + page.phase + '/' + entry.id),
              snapshot = await tx.get(sourceRef),
              stored = snapshot.data();
            let content;
            if (stored)
              content =
                kind === 'chapter'
                  ? (stored.content ?? '')
                  : (await tx.get(db.doc(sourceRef.path + '/body/current'))).data()?.content;
            const plan = await ledger.prepareChanges(tx, {
              target: context.target,
              root,
              changes: [
                {
                  kind,
                  id: entry.id,
                  ...(typeof content === 'string' ? { content } : {}),
                  removed: !stored,
                },
              ],
            });
            const next = {
              ...control.value,
              wordCount: plan.wordCount,
              countRevision: plan.control?.countRevision ?? control.value.countRevision,
              cursor: entry.id,
              processed: control.value.processed + 1,
            };
            plan.commit();
            tx.set(control.ref, next);
            return { bytes: Buffer.byteLength(content ?? ''), processed: true };
          });
          bytes += result.bytes;
          attempts++;
        }
      }
      return db.runTransaction(async (tx) => {
        const root = await workProject(tx, context),
          control = await readWorkControl(tx, db, context, root);
        return preparationView(control.value);
      });
    },
    async listWorkChecklist(uid, data) {
      const context = workScope(db, uid, data, ['filter', 'cursor', 'limit']);
      requireKind(context, ['adventure', 'campaign']);
      const filter = data.filter ?? 'all',
        limit = workLimit(data.limit);
      if (!['all', 'pending', 'completed'].includes(filter))
        workFail('invalid-argument', 'Filtro inválido.');
      return db.runTransaction(async (tx) => {
        const root = await workProject(tx, context),
          control = await readWorkControl(tx, db, context, root),
          scope = { uid, target: context.target, filter },
          cursor = workCursor(data.cursor, scope, control.value.checklistRevision);
        let query = db
          .collection(context.path + '/workChecklist')
          .orderBy('__name__')
          .limit(limit + 1);
        if (filter !== 'all') query = query.where('completed', '==', filter === 'completed');
        if (cursor) query = query.startAfter(cursor.id);
        const page = await tx.get(query),
          items = page.docs
            .slice(0, limit)
            .map((item) => workItem({ ...item.data(), id: item.id }));
        return {
          items,
          ...totals(control.value),
          nextCursor:
            page.docs.length > limit
              ? encodeWorkCursor({
                  version: 1,
                  scope,
                  revision: control.value.checklistRevision,
                  id: page.docs[limit - 1].id,
                })
              : null,
        };
      });
    },
    createWorkChecklistItem: (uid, data) => checklistMutation(uid, data, 'create'),
    updateWorkChecklistItem: (uid, data) => checklistMutation(uid, data, 'update'),
    deleteWorkChecklistItem: (uid, data) => checklistMutation(uid, data, 'delete'),
    async getWorkPreferences(uid, data = {}) {
      authorizeUser(uid, data, []);
      return db.runTransaction(async (tx) => {
        const stored = (await tx.get(preferenceRef(db, uid))).data();
        return stored
          ? { revision: stored.revision, timeZone: stored.timeZone }
          : { revision: 0, timeZone: null };
      });
    },
    async saveWorkPreferences(uid, data) {
      authorizeUser(uid, data, ['operationId', 'expectedRevision', 'timeZone']);
      workRevision(data.expectedRevision);
      if (
        typeof data.timeZone !== 'string' ||
        data.timeZone.length > 100 ||
        /^[+-]/.test(data.timeZone)
      )
        workFail('invalid-argument', 'Fuso inválido.');
      let timeZone;
      try {
        timeZone = new Intl.DateTimeFormat('pt-BR', { timeZone: data.timeZone }).resolvedOptions()
          .timeZone;
      } catch {
        workFail('invalid-argument', 'Escolha um fuso IANA válido.');
      }
      const op = workOperation(db, uid, 'saveWorkPreferences', data, {
        expectedRevision: data.expectedRevision,
        timeZone: data.timeZone,
      });
      return db.runTransaction(async (tx) => {
        const ref = preferenceRef(db, uid),
          stored = (await tx.get(ref)).data() ?? { revision: 0 },
          previous = await readWorkReceipt(tx, op);
        if (previous) {
          if (previous.revision !== stored.revision) workConflict();
          return { revision: stored.revision, timeZone: stored.timeZone };
        }
        if (stored.revision !== data.expectedRevision) workConflict();
        const next = { revision: stored.revision + 1, timeZone };
        tx.set(ref, next);
        writeWorkReceipt(tx, op, { revision: next.revision });
        return next;
      });
    },
    async recordWorkActivity(uid, data) {
      const context = workScope(db, uid, data, [
          'resource',
          'operationId',
          'expectedActivityRevision',
        ]),
        value = resource(data.resource, context.target);
      workRevision(data.expectedActivityRevision);
      const op = workOperation(db, uid, 'recordWorkActivity', data, {
        target: context.target,
        resource: value,
        expectedActivityRevision: data.expectedActivityRevision,
      });
      return db.runTransaction(async (tx) => {
        await workProject(tx, context);
        if (!(await availableResource(tx, context, value)))
          workFail('not-found', 'Recurso indisponível.');
        const state = activityRef(db, uid),
          stored = (await tx.get(state)).data() ?? { revision: 0, accessedAt: 0 },
          previous = await readWorkReceipt(tx, op);
        if (previous)
          return { activityRevision: previous.activityRevision, accessedAt: previous.accessedAt };
        if (stored.revision !== data.expectedActivityRevision) workConflict();
        const activityRevision = stored.revision + 1,
          accessedAt = workDate(now, stored.accessedAt);
        tx.set(state, { revision: activityRevision, accessedAt });
        tx.set(db.doc('users/' + uid + '/workActivity/' + digest(context.target)), {
          target: context.target,
          kind: context.target.kind,
          resource: value,
          accessedAt,
        });
        writeWorkReceipt(tx, op, { activityRevision, accessedAt });
        return { activityRevision, accessedAt };
      });
    },
    async resolveWorkResume(uid, data) {
      const context = workScope(db, uid, data, []);
      try {
        return await db.runTransaction(async (tx) => {
          const root = await workProject(tx, context),
            row = (
              await tx.get(db.doc('users/' + uid + '/workActivity/' + digest(context.target)))
            ).data();
          return resolve(tx, context, root, row);
        });
      } catch (error) {
        if (error.code === 'not-found') return null;
        throw error;
      }
    },
    async listWorkResume(uid, data = {}) {
      authorizeUser(uid, data, ['kind', 'cursor', 'limit']);
      const limit = workLimit(data.limit),
        kind = data.kind ?? 'all';
      if (kind !== 'all' && !['book', 'adventure', 'campaign'].includes(kind))
        workFail('invalid-argument', 'Tipo inválido.');
      return db.runTransaction(async (tx) => {
        const revision = await activityVersion(tx, uid),
          scope = { uid, kind },
          cursor = workCursor(data.cursor, scope, revision);
        let query = db
          .collection('users/' + uid + '/workActivity')
          .orderBy('accessedAt', 'desc')
          .orderBy('__name__', 'desc')
          .limit(limit + 1);
        if (kind !== 'all') query = query.where('kind', '==', kind);
        if (cursor) query = query.startAfter(cursor.date, cursor.id);
        const page = await tx.get(query),
          items = [];
        for (const entry of page.docs.slice(0, limit)) {
          const row = entry.data(),
            target = workTarget(row.target),
            context = { db, uid, target, path: workPath(target), ref: db.doc(workPath(target)) };
          let root;
          try {
            root = await workProject(tx, context);
          } catch (error) {
            if (error.code === 'not-found' || isCampaignDeletionError(error)) continue;
            throw error;
          }
          const resolved = await resolve(tx, context, root, row);
          items.push({
            target,
            title: resolved.title,
            resource: resolved.resource,
            accessedAt: row.accessedAt,
          });
        }
        const last = page.docs[Math.min(limit, page.docs.length) - 1];
        return {
          items,
          activityRevision: revision,
          nextCursor:
            page.docs.length > limit
              ? encodeWorkCursor({
                  version: 1,
                  scope,
                  revision,
                  id: last.id,
                  date: last.data().accessedAt,
                })
              : null,
        };
      });
    },
  };
  async function checklistMutation(uid, data, method) {
    const keys =
      method === 'create'
        ? ['operationId', 'title']
        : method === 'update'
          ? ['id', 'operationId', 'expectedRevision', 'patch']
          : ['id', 'operationId', 'expectedRevision'];
    const context = workScope(db, uid, data, keys);
    requireKind(context, ['adventure', 'campaign']);
    if (method !== 'create') {
      workId(data.id);
      workRevision(data.expectedRevision);
    }
    let patch;
    if (method === 'create') patch = { title: workTitle(data.title), completed: false };
    if (method === 'update') {
      workClosed(data.patch, ['title', 'completed']);
      if (!Object.keys(data.patch).length) workFail('invalid-argument', 'Informe uma alteração.');
      patch = { ...data.patch };
      if ('title' in patch) patch.title = workTitle(patch.title);
      if ('completed' in patch && typeof patch.completed !== 'boolean')
        workFail('invalid-argument', 'Conclusão inválida.');
    }
    const op = workOperation(db, uid, 'checklist-' + method, data, {
      target: context.target,
      ...(method === 'create'
        ? { title: patch.title }
        : { id: data.id, expectedRevision: data.expectedRevision, ...(patch ? { patch } : {}) }),
    });
    const id = method === 'create' ? op.id : data.id;
    return db.runTransaction(async (tx) => {
      const root = await workProject(tx, context),
        control = await readWorkControl(tx, db, context, root),
        previous = await readWorkReceipt(tx, op),
        ref = db.doc(context.path + '/workChecklist/' + id),
        item = (await tx.get(ref)).data();
      if (previous) {
        if (method === 'delete') return totals(control.value);
        if (!item || (method === 'update' && item.revision !== previous.revision)) workConflict();
        return { item: workItem({ ...item, id }), ...totals(control.value) };
      }
      if (method === 'create' ? Boolean(item) : !item) workFail('not-found', 'Item indisponível.');
      if (method !== 'create' && item.revision !== data.expectedRevision) workConflict();
      const timestamp = workDate(now, item?.updatedAt ?? 0),
        next =
          method === 'create'
            ? { id, ...patch, revision: 1, createdAt: timestamp, updatedAt: timestamp }
            : method === 'update'
              ? { ...item, ...patch, revision: item.revision + 1, updatedAt: timestamp }
              : null;
      const updated = {
        ...control.value,
        checklistRevision: control.value.checklistRevision + 1,
        checklistTotal:
          control.value.checklistTotal + (method === 'create' ? 1 : method === 'delete' ? -1 : 0),
        checklistCompleted:
          control.value.checklistCompleted +
          Number(next?.completed ?? false) -
          Number(item?.completed ?? false),
      };
      if (
        !Number.isSafeInteger(updated.checklistTotal) ||
        updated.checklistTotal < 0 ||
        updated.checklistCompleted < 0
      )
        workFail('failed-precondition', 'Totais do checklist inconsistentes.');
      activate(tx, context, root, updated);
      tx.set(control.ref, updated);
      if (next) tx.set(ref, next);
      else tx.delete(ref);
      writeWorkReceipt(tx, op, { id, revision: next?.revision ?? item.revision });
      return next ? { item: workItem(next), ...totals(updated) } : totals(updated);
    });
  }
  addWorkProgressLegacy(api, { db, now, countWords, ledger });
  return api;
}
