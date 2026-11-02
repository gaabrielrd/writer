import { readObject, readCount } from './bookLoreReadContracts';
import { freezeLoreEditValue, invalidLoreEdit } from './bookLoreWritePlan';
import { bookLoreWriteHash as hash, type BookLoreWriteOptions } from './bookLoreWritePayload';
import { prepareBookLoreCreationPlan, type BookLoreCreationInput } from './bookLoreCreationPlan';
import { creationProgress, type LoreCreationProgress } from './bookLoreCreationProgress';
import {
  uploadProgress,
  editProgress,
  progressResponse,
  type LoreUploadProgress,
  type LoreEditProgress,
} from './bookLoreWriteProgress';
import type { BookLoreEditPort } from './bookLoreEditOperation';

export type BookLoreCreationPhase =
  'preparing' | 'ready' | 'applied' | 'cancelling' | 'cancelled' | 'conflict';
interface Wire {
  readonly method: string;
  readonly input: Readonly<Record<string, unknown>>;
}
export interface BookLoreCreationRecovery {
  readonly checkpoint: unknown;
  readonly controlsPage: (this: void, offset: number, limit: number) => Promise<unknown>;
}
type Task = Wire & { kind: 'parent' | 'upload' | 'edit'; index?: number };
type Plan = Awaited<ReturnType<typeof prepareBookLoreCreationPlan>>;
type Upload = Plan['uploads'][number] & {
  progress: LoreUploadProgress | null;
  iterator: ReturnType<Plan['uploads'][number]['codec']['parts']> | null;
  iteratorIndex: number;
};
const names = {
  start: 'startBookLoreCreationReservation',
  get: 'getBookLoreCreationReservation',
  cancel: 'cancelBookLoreCreationReservation',
  cleanup: 'advanceBookLoreCreationCleanup',
  upload: 'startBookLoreFieldUpload',
  append: 'appendBookLoreFieldUpload',
  seal: 'advanceBookLoreFieldSeal',
  uploadGet: 'getBookLoreFieldUpload',
  edit: 'startBookLoreEditReservation',
  initialize: 'initializeBookLoreEditGeneration',
  reserve: 'reserveBookLoreEditUpload',
  compile: 'advanceBookLoreEditCompilation',
  apply: 'adoptBookLoreEditGeneration',
  editGet: 'getBookLoreEditReservation',
} as const;
const conflict = (error: unknown) =>
  !!error &&
  typeof error === 'object' &&
  'code' in error &&
  ['failed-precondition', 'functions/failed-precondition'].includes(String(error.code));

/** Pure coordinator. Checkpoints contain private wire bytes; the host owns encrypted persistence. */
export async function prepareBookLoreCreationOperation(
  input: BookLoreCreationInput,
  port: BookLoreEditPort,
  options: BookLoreWriteOptions = {},
  recovery?: BookLoreCreationRecovery,
) {
  const { guard: hostGuard, signal, yieldControl } = options;
  const fixedOptions = { guard: hostGuard, signal, yieldControl };
  const saved = recovery ? freezeLoreEditValue(recovery.checkpoint) : null;
  const restoringCancel =
    !!saved &&
    typeof saved === 'object' &&
    'cancelRequested' in saved &&
    saved.cancelRequested === true;
  const plan = await prepareBookLoreCreationPlan(
    input,
    restoringCancel ? { ...fixedOptions, signal: undefined } : fixedOptions,
  );
  const identity = {
    uid: plan.uid,
    writeId: plan.writeId,
    bookId: plan.bookId,
    loreId: plan.loreId,
  };
  const uploads: Upload[] = plan.uploads.map((u) => ({
    ...u,
    progress: null,
    iterator: null,
    iteratorIndex: 0,
  }));
  let phase: BookLoreCreationPhase = 'preparing',
    parent: LoreCreationProgress | null = null,
    edit: LoreEditProgress | null = null,
    cancelRequested = false,
    initialized = false,
    uploadIndex = 0,
    reserved = 0,
    resolutionIndex = 0,
    completedCalls = 0,
    productionBusy = false,
    cleanupBusy = false,
    pendingProduction: Task | null = null,
    pendingCleanup: Task | null = null,
    failedCancel: Task | null = null;
  const check = (production = true) => {
    hostGuard?.();
    if (production) signal?.throwIfAborted();
  };
  const unit = (method: string, id: string, revision: number | null) =>
    hash({ domain: 'writer-book-lore-client-unit', ...identity, method, id, revision });
  const task = (
    method: string,
    value: Record<string, unknown>,
    kind: Task['kind'],
    index?: number,
  ): Task => ({
    method,
    input: freezeLoreEditValue(value) as Record<string, unknown>,
    kind,
    ...(index === undefined ? {} : { index }),
  });
  const ref = () => {
    if (!parent?.jobToken) invalidLoreEdit();
    return { creationId: plan.creationId, startHash: plan.startHash, jobToken: parent.jobToken };
  };
  const uploadIntent = (index: number) => {
    const u = uploads[index]!;
    return {
      bookId: plan.bookId,
      loreId: plan.loreId,
      uploadId: u.id,
      sourceToken: ref().jobToken,
      target: u.target,
      manifest: u.manifest,
      creation: ref(),
    };
  };
  const uploadHash = (index: number) =>
    hash({ domain: 'writer-lore-field-start', schemaVersion: 1, intent: uploadIntent(index) });
  const editIntent = () => ({
    bookId: plan.bookId,
    loreId: plan.loreId,
    editId: plan.editId,
    sourceToken: ref().jobToken,
    creation: ref(),
    fields: Object.fromEntries(
      plan.fields.map((f) => {
        const u = uploads[f.upload]!;
        if (!u.progress?.jobToken) invalidLoreEdit();
        return [
          f.field,
          { uploadId: u.id, startHash: uploadHash(f.upload), jobToken: u.progress.jobToken },
        ];
      }),
    ),
    relations: plan.relations,
  });
  const editHash = () =>
    hash({ domain: 'writer-lore-edit-start', schemaVersion: 1, intent: editIntent() });
  const parentControl = (method: string, revision?: number) => ({
    ...plan.intent,
    ...(parent?.jobToken ? { jobToken: parent.jobToken } : {}),
    ...(method === names.cancel || method === names.cleanup
      ? {
          operationId: unit(method, plan.creationId, method === names.cancel ? null : revision!),
        }
      : {}),
    ...(method === names.cleanup ? { expectedRevision: revision } : {}),
  });
  const uploadControl = (method: string, index: number) => {
    const u = uploads[index]!,
      p = u.progress;
    if (!p?.jobToken) invalidLoreEdit();
    return {
      uploadId: u.id,
      startHash: uploadHash(index),
      jobToken: p.jobToken,
      expectedRevision: p.revision,
      operationId: unit(method, u.id, p.revision),
    };
  };
  const editControl = (method: string, revision = edit?.revision) => {
    if (!edit?.jobToken || revision === undefined) invalidLoreEdit();
    return {
      editId: plan.editId,
      startHash: editHash(),
      jobToken: edit.jobToken,
      ...(method === names.editGet
        ? {}
        : { expectedRevision: revision, operationId: unit(method, plan.editId, revision) }),
    };
  };
  const descriptor = (t: Task | null) =>
    t ? { method: t.method, requestHash: hash(t.input) } : null;
  const wire = (t: Task | null) => (t ? { method: t.method, input: t.input } : null);
  function controlsPage(offset = 0, limit = 50) {
    check(false);
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset > uploads.length ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 50
    )
      invalidLoreEdit();
    const end = Math.min(offset + limit, uploads.length);
    return freezeLoreEditValue({
      intentHash: plan.intentHash,
      items: uploads.slice(offset, end).map((u) => ({ id: u.id, progress: u.progress })),
      nextOffset: end < uploads.length ? end : null,
    }) as {
      intentHash: string;
      items: readonly { id: string; progress: LoreUploadProgress | null }[];
      nextOffset: number | null;
    };
  }
  function controlsHash() {
    let h = hash({
      domain: 'writer-lore-creation-controls',
      intentHash: plan.intentHash,
      count: uploads.length,
    });
    for (const u of uploads) h = hash({ previous: h, id: u.id, progress: u.progress });
    return h;
  }
  function snapshot() {
    check(false);
    return freezeLoreEditValue({
      schemaVersion: 1,
      kind: 'creation',
      ...identity,
      creationId: plan.creationId,
      intentHash: plan.intentHash,
      phase,
      parent,
      edit,
      cancelRequested,
      completedCalls,
      initialized,
      reserved,
      uploads: {
        count: uploads.length,
        completed: uploadIndex,
        current: uploads[uploadIndex]
          ? { id: uploads[uploadIndex]!.id, progress: uploads[uploadIndex]!.progress }
          : null,
      },
      pending: {
        production: descriptor(pendingProduction),
        cleanup: descriptor(pendingCleanup),
        failedCancel: descriptor(failedCancel),
      },
    }) as BookLoreCreationSnapshot;
  }
  function checkpoint() {
    check(false);
    return freezeLoreEditValue({
      schemaVersion: 1,
      kind: 'creation',
      ...identity,
      creationId: plan.creationId,
      intentHash: plan.intentHash,
      phase,
      parent,
      edit,
      cancelRequested,
      completedCalls,
      initialized,
      reserved,
      uploadIndex,
      resolutionIndex,
      uploadCount: uploads.length,
      controlsHash: controlsHash(),
      pending: {
        production: wire(pendingProduction),
        cleanup: wire(pendingCleanup),
        failedCancel: wire(failedCancel),
      },
    }) as BookLoreCreationCheckpoint;
  }
  function finished(value: 'applied' | 'cancelled') {
    phase = value;
    pendingProduction = pendingCleanup = failedCancel = null;
    for (const u of uploads) u.iterator = null;
  }
  function requestCancel() {
    check(false);
    if (!['applied', 'cancelled', 'conflict'].includes(phase)) {
      cancelRequested = true;
      phase = 'cancelling';
    }
    return snapshot();
  }
  function ownAdoption(p: LoreEditProgress) {
    if (!p.adoption || p.adoption.operationId !== unit(names.apply, plan.editId, p.revision - 1))
      invalidLoreEdit();
    if (
      parent?.adoption &&
      (parent.adoption.editId !== plan.editId ||
        parent.adoption.operationId !== p.adoption.operationId)
    )
      invalidLoreEdit();
    edit = p;
    finished('applied');
  }
  async function makeProduction(): Promise<Task | null> {
    if (!parent) return task(names.start, plan.intent, 'parent');
    if (parent.phase === 'cancelled' || parent.phase === 'cancelling') {
      requestCancel();
      return null;
    }
    if (parent.adoption && parent.adoption.editId !== plan.editId) {
      phase = 'conflict';
      return null;
    }
    if (uploadIndex < uploads.length) {
      const index = uploadIndex,
        u = uploads[index]!,
        p = u.progress;
      if (!p) return task(names.upload, uploadIntent(index), 'upload', index);
      if (p.phase === 'uploading') {
        if (!u.iterator || u.iteratorIndex !== p.nextIndex) {
          u.iterator = u.codec.parts(p.nextIndex);
          u.iteratorIndex = p.nextIndex;
        }
        let part;
        try {
          part = await u.iterator.next();
        } catch (error) {
          u.iterator = null;
          throw error;
        }
        if (part.done || part.value.index !== p.nextIndex) invalidLoreEdit();
        u.iteratorIndex++;
        return task(
          names.append,
          { ...uploadControl(names.append, index), ...part.value },
          'upload',
          index,
        );
      }
      if (p.phase === 'verifying')
        return task(names.seal, uploadControl(names.seal, index), 'upload', index);
      requestCancel();
      return null;
    }
    if (!edit) return task(names.edit, editIntent(), 'edit');
    if (edit.phase === 'adopted') {
      ownAdoption(edit);
      return null;
    }
    if (edit.phase === 'cancelling' || edit.phase === 'cancelled') {
      requestCancel();
      return null;
    }
    if (!initialized) return task(names.initialize, editControl(names.initialize, 0), 'edit');
    if (reserved < uploads.length) {
      const u = uploads[reserved]!;
      return task(
        names.reserve,
        {
          ...editControl(names.reserve, 1 + reserved),
          target: u.target,
          upload: {
            uploadId: u.id,
            startHash: uploadHash(reserved),
            jobToken: u.progress!.jobToken,
          },
        },
        'edit',
      );
    }
    if (edit.compilation?.phase === 'ready') {
      phase = 'ready';
      return null;
    }
    return task(names.compile, editControl(names.compile), 'edit');
  }
  function makeApply() {
    if (phase !== 'ready' || !edit || cancelRequested)
      throw Error('Conclua a preparação antes de criar a ficha.');
    return task(names.apply, editControl(names.apply), 'edit');
  }
  function makeCleanup(): Task | null {
    if (parent?.phase === 'cancelled') {
      finished('cancelled');
      return null;
    }
    if (parent?.adoption) {
      if (parent.adoption.editId !== plan.editId) {
        phase = 'conflict';
        return null;
      }
      while (
        resolutionIndex < uploads.length &&
        uploads[resolutionIndex]!.progress?.jobToken &&
        ['sealed', 'reserved'].includes(uploads[resolutionIndex]!.progress!.phase)
      )
        resolutionIndex++;
      if (resolutionIndex < uploads.length)
        return task(
          names.uploadGet,
          {
            uploadId: uploads[resolutionIndex]!.id,
            startHash: uploadHash(resolutionIndex),
          },
          'upload',
          resolutionIndex,
        );
      return task(names.editGet, { editId: plan.editId, startHash: editHash() }, 'edit');
    }
    if (parent?.phase === 'cancelling')
      return task(names.cleanup, parentControl(names.cleanup, parent.cleanupRevision), 'parent');
    return task(names.cancel, parentControl(names.cancel), 'parent');
  }

  function parseParent(raw: unknown) {
    return creationProgress(raw, {
      creationId: plan.creationId,
      bookId: plan.bookId,
      loreId: plan.loreId,
      startHash: plan.startHash,
      token: parent?.jobToken,
    });
  }
  function parseUpload(raw: unknown, index: number) {
    return uploadProgress(
      raw,
      {
        id: uploads[index]!.id,
        startHash: uploadHash(index),
        token: uploads[index]!.progress?.jobToken,
      },
      uploads[index]!.manifest,
    );
  }
  function parseEdit(raw: unknown) {
    const p = editProgress(
      raw,
      { id: plan.editId, startHash: editHash(), token: edit?.jobToken },
      uploads.length + 7,
    );
    if (p.adoption && p.adoption.operationId !== unit(names.apply, plan.editId, p.revision - 1))
      invalidLoreEdit();
    return p;
  }
  function advanceUploadIndex() {
    while (
      uploadIndex < uploads.length &&
      ['sealed', 'reserved'].includes(uploads[uploadIndex]!.progress?.phase ?? '')
    )
      uploadIndex++;
  }
  async function dispatch(t: Task, cleanup: boolean) {
    check(!cleanup);
    const raw = await port.call(t.method, t.input);
    check(!cleanup);
    let parsedParent: LoreCreationProgress | null = null;
    let parsedUpload: LoreUploadProgress | null = null;
    let parsedEdit: LoreEditProgress | null = null;
    if (t.kind === 'parent') {
      if (t.method === names.cleanup) {
        const r = readObject(freezeLoreEditValue(raw), ['receipt', 'progress']);
        if (r.receipt !== null) parseParent(r.receipt);
        parsedParent = parseParent(r.progress);
      } else parsedParent = parseParent(raw);
    } else if (t.kind === 'upload') {
      parsedUpload = progressResponse(
        raw,
        t.method === names.upload || t.method === names.uploadGet,
        (v) => parseUpload(v, t.index!),
      ).progress as LoreUploadProgress;
    } else {
      parsedEdit = progressResponse(
        raw,
        t.method === names.edit || t.method === names.editGet,
        parseEdit,
      ).progress as LoreEditProgress;
    }
    if (['applied', 'cancelled', 'conflict'].includes(phase)) return;
    completedCalls++;
    // Even a late successful apply may win cancellation, but must be the exact own unit.
    if (parsedEdit?.phase === 'adopted') {
      ownAdoption(parsedEdit);
      return;
    }
    if (!cleanup && cancelRequested) return;
    if (parsedParent) {
      if ((parsedParent.cleanupRevision ?? 0) < (parent?.cleanupRevision ?? 0)) invalidLoreEdit();
      parent = parsedParent;
      if (parent.phase === 'cancelled') {
        cancelRequested = true;
        finished('cancelled');
        return;
      }
      if (parent.phase === 'cancelling') requestCancel();
      if (parent.adoption && parent.adoption.editId !== plan.editId) phase = 'conflict';
      if (t.method === names.get && failedCancel) {
        if (parent.phase === 'preparing' && failedCancel.method === names.cancel)
          pendingCleanup = failedCancel;
        else pendingCleanup = null;
        failedCancel = null;
      }
    } else if (parsedUpload) {
      const u = uploads[t.index!]!;
      if (parsedUpload.revision < (u.progress?.revision ?? 0)) invalidLoreEdit();
      u.progress = parsedUpload;
      advanceUploadIndex();
      if (cleanup && !['sealed', 'reserved'].includes(parsedUpload.phase)) phase = 'conflict';
    } else if (parsedEdit) {
      if (parsedEdit.revision < (edit?.revision ?? 0)) invalidLoreEdit();
      edit = parsedEdit;
      if (t.method === names.initialize) initialized = true;
      if (t.method === names.reserve) reserved++;
      if (cleanup) phase = 'conflict';
      else if (initialized && reserved === uploads.length && edit.compilation?.phase === 'ready')
        phase = 'ready';
    }
    if (cleanup) {
      if (pendingCleanup === t) pendingCleanup = null;
    } else if (pendingProduction === t) pendingProduction = null;
  }
  async function advance() {
    if (['ready', 'applied', 'cancelled', 'conflict'].includes(phase)) return snapshot();
    const cleanup = cancelRequested;
    if (cleanup ? cleanupBusy : productionBusy)
      throw Error('Uma unidade desta criação já está em andamento.');
    check(!cleanup);
    if (cleanup) cleanupBusy = true;
    else productionBusy = true;
    try {
      let t = cleanup ? pendingCleanup : pendingProduction;
      if (!t) {
        t = cleanup ? makeCleanup() : await makeProduction();
        if (!t || (!cleanup && cancelRequested)) return snapshot();
        if (cleanup) pendingCleanup = t;
        else pendingProduction = t;
      }
      try {
        await dispatch(t, cleanup);
      } catch (error) {
        if (
          cleanup &&
          [names.cancel, names.cleanup].includes(t.method as typeof names.cancel) &&
          conflict(error)
        ) {
          failedCancel = t;
          pendingCleanup = task(names.get, parentControl(names.get), 'parent');
        }
        throw error;
      }
      return snapshot();
    } finally {
      if (cleanup) cleanupBusy = false;
      else productionBusy = false;
    }
  }
  async function apply() {
    if (phase === 'applied') return snapshot();
    if (productionBusy) throw Error('Uma unidade desta criação já está em andamento.');
    check();
    const t = pendingProduction ?? makeApply();
    if (t.method !== names.apply || phase !== 'ready' || cancelRequested) invalidLoreEdit();
    pendingProduction = t;
    productionBusy = true;
    try {
      await dispatch(t, false);
      return snapshot();
    } finally {
      productionBusy = false;
    }
  }
  async function restoreTask(
    value: unknown,
    lane: 'production' | 'cleanup' | 'failedCancel',
  ): Promise<Task | null> {
    if (value === null) return null;
    const w = readObject(freezeLoreEditValue(value), ['method', 'input']);
    if (typeof w.method !== 'string') invalidLoreEdit();
    const method = w.method,
      r = readObject(w.input, [], Object.keys(w.input as object));
    let expected: Record<string, unknown>, kind: Task['kind'], index: number | undefined;
    if (
      [names.start, names.get, names.cancel, names.cleanup].includes(method as typeof names.start)
    ) {
      kind = 'parent';
      if (method === names.start) expected = plan.intent;
      else {
        if (r.jobToken !== undefined && r.jobToken !== parent?.jobToken) invalidLoreEdit();
        const revision = method === names.cleanup ? readCount(r.expectedRevision) : null;
        if (revision !== null && revision > (parent?.cleanupRevision ?? -1)) invalidLoreEdit();
        expected = {
          ...plan.intent,
          ...(r.jobToken === undefined ? {} : { jobToken: r.jobToken }),
          ...(method === names.cancel || method === names.cleanup
            ? {
                operationId: unit(method, plan.creationId, revision),
              }
            : {}),
          ...(revision === null ? {} : { expectedRevision: revision }),
        };
      }
    } else if (
      [names.upload, names.append, names.seal, names.uploadGet].includes(
        method as typeof names.upload,
      )
    ) {
      kind = 'upload';
      index = uploads.findIndex((u) => u.id === r.uploadId);
      if (index < 0) invalidLoreEdit();
      if (method === names.upload) expected = uploadIntent(index);
      else if (method === names.uploadGet)
        expected = { uploadId: uploads[index]!.id, startHash: uploadHash(index) };
      else {
        const u = uploads[index]!,
          revision = readCount(r.expectedRevision);
        if (!u.progress?.jobToken || revision > u.progress.revision) invalidLoreEdit();
        expected = {
          uploadId: u.id,
          startHash: uploadHash(index),
          jobToken: u.progress.jobToken,
          operationId: unit(method, u.id, revision),
          expectedRevision: revision,
        };
        if (method === names.append) {
          const part = await u.codec.parts(readCount(r.index)).next();
          if (part.done) invalidLoreEdit();
          expected = { ...expected, ...part.value };
        }
      }
    } else if (
      [
        names.edit,
        names.initialize,
        names.reserve,
        names.compile,
        names.apply,
        names.editGet,
      ].includes(method as typeof names.edit)
    ) {
      kind = 'edit';
      if (method === names.edit) expected = editIntent();
      else if (method === names.editGet)
        expected = {
          editId: plan.editId,
          startHash: editHash(),
          ...(r.jobToken === undefined ? {} : { jobToken: edit?.jobToken }),
        };
      else {
        const revision = readCount(r.expectedRevision);
        if (!edit?.jobToken || revision > edit.revision) invalidLoreEdit();
        expected = {
          editId: plan.editId,
          startHash: editHash(),
          jobToken: edit.jobToken,
          operationId: unit(method, plan.editId, revision),
          expectedRevision: revision,
        };
        if (method === names.initialize && (initialized || revision !== 0)) invalidLoreEdit();
        if (method === names.reserve) {
          const u = uploads[reserved];
          if (!initialized || !u || revision !== 1 + reserved) invalidLoreEdit();
          expected = {
            ...expected,
            target: u.target,
            upload: {
              uploadId: u.id,
              startHash: uploadHash(reserved),
              jobToken: u.progress?.jobToken,
            },
          };
        }
        if (method === names.apply && !(phase === 'ready' || cancelRequested)) invalidLoreEdit();
      }
    } else invalidLoreEdit();
    const diagnostic =
      method === names.get || method === names.uploadGet || method === names.editGet;
    if (
      lane === 'production'
        ? diagnostic || [names.cancel, names.cleanup].includes(method as typeof names.cancel)
        : !diagnostic && method !== names.cancel && method !== names.cleanup
    )
      invalidLoreEdit();
    if (lane === 'failedCancel' && method !== names.cancel && method !== names.cleanup)
      invalidLoreEdit();
    if (hash(r) !== hash(expected)) invalidLoreEdit();
    return task(method, r, kind!, index);
  }

  async function hydrate(value: unknown) {
    if (!recovery || typeof recovery.controlsPage !== 'function') invalidLoreEdit();
    const v = readObject(value, [
      'schemaVersion',
      'kind',
      'uid',
      'writeId',
      'bookId',
      'loreId',
      'creationId',
      'intentHash',
      'phase',
      'parent',
      'edit',
      'cancelRequested',
      'completedCalls',
      'initialized',
      'reserved',
      'uploadIndex',
      'resolutionIndex',
      'uploadCount',
      'controlsHash',
      'pending',
    ]);
    if (
      v.schemaVersion !== 1 ||
      v.kind !== 'creation' ||
      v.uid !== plan.uid ||
      v.writeId !== plan.writeId ||
      v.bookId !== plan.bookId ||
      v.loreId !== plan.loreId ||
      v.creationId !== plan.creationId ||
      v.intentHash !== plan.intentHash ||
      v.uploadCount !== uploads.length ||
      !['preparing', 'ready', 'applied', 'cancelling', 'cancelled', 'conflict'].includes(
        v.phase as string,
      ) ||
      typeof v.cancelRequested !== 'boolean' ||
      typeof v.initialized !== 'boolean'
    )
      invalidLoreEdit();
    parent = v.parent === null ? null : parseParent(v.parent);
    for (let offset = 0; offset < uploads.length; offset += 50) {
      const limit = Math.min(50, uploads.length - offset);
      const page = readObject(freezeLoreEditValue(await recovery.controlsPage(offset, limit)), [
        'intentHash',
        'items',
        'nextOffset',
      ]);
      check(!restoringCancel);
      const end = offset + limit;
      if (
        page.intentHash !== plan.intentHash ||
        !Array.isArray(page.items) ||
        page.items.length !== limit ||
        page.nextOffset !== (end < uploads.length ? end : null)
      )
        invalidLoreEdit();
      for (const [at, item] of page.items.entries()) {
        const u = readObject(item, ['id', 'progress']),
          index = offset + at;
        if (u.id !== uploads[index]!.id) invalidLoreEdit();
        if (u.progress !== null) {
          const raw = readObject(
            u.progress,
            ['id'],
            [
              'startHash',
              'jobToken',
              'phase',
              'revision',
              'nextIndex',
              'sealIndex',
              'totalParts',
              'byteLength',
              'cleanupIndex',
              'cleanedCount',
              'prepared',
            ],
          );
          const { id, ...p } = raw;
          uploads[index]!.progress = parseUpload({ ...p, uploadId: id }, index);
        }
      }
    }
    if (v.controlsHash !== controlsHash()) invalidLoreEdit();
    if (v.edit !== null) {
      const raw = readObject(
        v.edit,
        ['id'],
        [
          'startHash',
          'jobToken',
          'phase',
          'revision',
          'reservedCount',
          'releasedCount',
          'blockedReason',
          'compilation',
          'adoption',
        ],
      );
      const { id, ...p } = raw;
      edit = parseEdit({ ...p, editId: id });
    }
    phase = v.phase as BookLoreCreationPhase;
    cancelRequested = v.cancelRequested;
    initialized = v.initialized;
    completedCalls = readCount(v.completedCalls);
    reserved = readCount(v.reserved);
    uploadIndex = readCount(v.uploadIndex);
    resolutionIndex = readCount(v.resolutionIndex);
    let completed = 0;
    while (
      completed < uploads.length &&
      ['sealed', 'reserved'].includes(uploads[completed]!.progress?.phase ?? '')
    )
      completed++;
    if (
      reserved > uploads.length ||
      uploadIndex !== completed ||
      resolutionIndex > uploads.length ||
      (!initialized && reserved !== 0) ||
      (initialized && !edit?.jobToken) ||
      (phase === 'ready' &&
        (!initialized ||
          reserved !== uploads.length ||
          uploadIndex !== uploads.length ||
          edit?.compilation?.phase !== 'ready')) ||
      (phase === 'applied' && edit?.phase !== 'adopted') ||
      (phase === 'cancelling' && !cancelRequested) ||
      (phase === 'cancelled' && parent?.phase !== 'cancelled') ||
      (phase === 'conflict' && !parent?.adoption) ||
      (cancelRequested && !['cancelling', 'cancelled', 'applied', 'conflict'].includes(phase))
    )
      invalidLoreEdit();
    const pending = readObject(v.pending, ['production', 'cleanup', 'failedCancel']);
    if (
      (['applied', 'cancelled'].includes(phase) &&
        Object.values(pending).some((x) => x !== null)) ||
      (!cancelRequested && (pending.cleanup !== null || pending.failedCancel !== null))
    )
      invalidLoreEdit();
    pendingProduction = await restoreTask(pending.production, 'production');
    pendingCleanup = await restoreTask(pending.cleanup, 'cleanup');
    failedCancel = await restoreTask(pending.failedCancel, 'failedCancel');
    if (failedCancel && pendingCleanup?.method !== names.get) invalidLoreEdit();
    if (initialized && (!edit || edit.revision < 1)) invalidLoreEdit();
    if (edit && uploadIndex !== uploads.length) invalidLoreEdit();
    if (reserved > (edit?.reservedCount ?? 0)) invalidLoreEdit();
    if (!cancelRequested && pendingProduction) {
      const expected = phase === 'ready' ? makeApply() : await makeProduction();
      if (!expected || hash(wire(expected)) !== hash(wire(pendingProduction))) invalidLoreEdit();
    }
    if (pendingCleanup && !failedCancel) {
      const expected = makeCleanup();
      if (!expected || hash(wire(expected)) !== hash(wire(pendingCleanup))) invalidLoreEdit();
    }
    check(!restoringCancel);
  }
  if (recovery) await hydrate(saved);
  return Object.freeze({ snapshot, checkpoint, controlsPage, advance, apply, requestCancel });
}
export interface BookLoreCreationSnapshot {
  readonly schemaVersion: 1;
  readonly kind: 'creation';
  readonly uid: string;
  readonly writeId: string;
  readonly bookId: string;
  readonly loreId: string;
  readonly creationId: string;
  readonly intentHash: string;
  readonly phase: BookLoreCreationPhase;
  readonly parent: LoreCreationProgress | null;
  readonly edit: LoreEditProgress | null;
  readonly cancelRequested: boolean;
  readonly completedCalls: number;
  readonly initialized: boolean;
  readonly reserved: number;
  readonly uploads: {
    readonly count: number;
    readonly completed: number;
    readonly current: { readonly id: string; readonly progress: LoreUploadProgress | null } | null;
  };
  readonly pending: {
    readonly production: { readonly method: string; readonly requestHash: string } | null;
    readonly cleanup: { readonly method: string; readonly requestHash: string } | null;
    readonly failedCancel: { readonly method: string; readonly requestHash: string } | null;
  };
}

/** Private wire bytes: encrypted storage plus a fresh origin grant are required. */
export interface BookLoreCreationCheckpoint extends Omit<
  BookLoreCreationSnapshot,
  'uploads' | 'pending'
> {
  readonly uploadIndex: number;
  readonly resolutionIndex: number;
  readonly uploadCount: number;
  readonly controlsHash: string;
  readonly pending: {
    readonly production: Wire | null;
    readonly cleanup: Wire | null;
    readonly failedCancel: Wire | null;
  };
}
