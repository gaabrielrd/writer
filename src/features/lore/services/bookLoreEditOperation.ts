import { bookContentId } from '../../../../functions/src/bookBackupSchema.mjs';
import {
  freezeLoreEditValue,
  freezeBookLoreEditSource,
  planBookLoreEdit,
  invalidLoreEdit,
  type BookLoreEditSource,
  type BookLoreEditChange,
} from './bookLoreWritePlan';
import {
  prepareBookLoreWritePayload,
  bookLoreWriteHash as hash,
  type BookLoreWriteOptions,
} from './bookLoreWritePayload';
import {
  inspectionProgress,
  uploadProgress,
  editProgress,
  progressResponse,
  type LoreProgress,
  type LoreInspectionProgress,
  type LoreUploadProgress,
  type LoreEditProgress,
  type LoreCleanupBlock,
} from './bookLoreWriteProgress';

export interface BookLoreEditPort {
  call(this: void, method: string, input: unknown): Promise<unknown>;
}
export interface BookLoreEditOperationInput {
  uid: string;
  writeId: string;
  source: BookLoreEditSource;
  changes: readonly BookLoreEditChange[];
}
export type BookLoreEditPhase =
  'empty' | 'preparing' | 'ready' | 'applied' | 'cancelling' | 'cancelled';
type PreparedUpload = Awaited<ReturnType<typeof prepareBookLoreWritePayload>>;
type UploadWork = {
  id: string;
  codec: PreparedUpload | null;
  manifest: PreparedUpload['manifest'];
  intent: Record<string, unknown>;
  startHash: string;
  progress: LoreUploadProgress | null;
  iterator: ReturnType<PreparedUpload['parts']> | null;
  iteratorIndex: number;
};
interface PendingMetadata {
  method: string;
  operationId: string | null;
  requestHash: string;
}
export interface BookLoreEditUploadControl {
  readonly id: string;
  readonly startHash: string;
  readonly progress: LoreUploadProgress | null;
}
export interface BookLoreEditControlPage {
  readonly intentHash: string;
  readonly items: readonly BookLoreEditUploadControl[];
  readonly nextOffset: number | null;
}
export interface BookLoreEditOperationSnapshot {
  readonly schemaVersion: 1;
  readonly uid: string;
  readonly writeId: string;
  readonly bookId: string;
  readonly loreId: string;
  readonly sourceToken: string;
  readonly intentHash: string;
  readonly phase: BookLoreEditPhase;
  readonly completedCalls: number;
  readonly blockedReason: LoreCleanupBlock | null;
  readonly inspection: LoreInspectionProgress | null;
  readonly uploads: {
    readonly count: number;
    readonly completed: number;
    readonly cleaned: number;
    readonly current: BookLoreEditUploadControl | null;
  };
  readonly edit: LoreEditProgress | null;
  readonly pending: {
    production: PendingMetadata | null;
    cleanup: PendingMetadata | null;
    failedCancel: PendingMetadata | null;
  };
}
type Task = {
  method: string;
  input: Record<string, unknown>;
  kind: 'inspection' | 'upload' | 'edit';
  index?: number;
  direct: boolean;
  requestHash: string;
  commit?: (p: LoreProgress) => void;
};
const names = {
  inspectStart: 'startBookLoreSourceInspection',
  inspect: 'advanceBookLoreSourceInspection',
  inspectCancel: 'cancelBookLoreSourceInspection',
  uploadStart: 'startBookLoreFieldUpload',
  append: 'appendBookLoreFieldUpload',
  seal: 'advanceBookLoreFieldSeal',
  uploadCancel: 'cancelBookLoreFieldUpload',
  uploadClean: 'advanceBookLoreFieldCleanup',
  editStart: 'startBookLoreEditReservation',
  initialize: 'initializeBookLoreEditGeneration',
  reserve: 'reserveBookLoreEditUpload',
  compile: 'advanceBookLoreEditCompilation',
  apply: 'adoptBookLoreEditGeneration',
  editCancel: 'cancelBookLoreEditReservation',
  editClean: 'advanceBookLoreEditReservationCleanup',
  editGet: 'getBookLoreEditReservation',
};
const conflictCode = (error: unknown) =>
  error &&
  typeof error === 'object' &&
  'code' in error &&
  ['failed-precondition', 'functions/failed-precondition'].includes(String(error.code));

/** Explicit in-memory operation; the host owns durable recovery and public RPC wiring. */
export async function prepareBookLoreEditOperation(
  input: BookLoreEditOperationInput,
  port: BookLoreEditPort,
  options: BookLoreWriteOptions = {},
) {
  const uid = bookContentId(input.uid),
    writeId = bookContentId(input.writeId);
  if (uid.length > 128) invalidLoreEdit();
  const source = freezeBookLoreEditSource(input.source),
    fullPlan = planBookLoreEdit(source, input.changes),
    { uploads: plannedUploads, ...plan } = fullPlan,
    identity = { uid, writeId, bookId: plan.bookId, loreId: plan.loreId },
    derived = (kind: string, index = 0) =>
      kind + '-' + hash({ domain: 'writer-book-lore-client-job', ...identity, kind, index }),
    inspectionId = derived('lore-source'),
    editId = derived('lore-edit'),
    inspectionIntent = Object.freeze({
      bookId: plan.bookId,
      loreId: plan.loreId,
      inspectionId,
      sourceToken: plan.sourceToken,
    }),
    inspectionHash = hash({
      domain: 'writer-lore-source-inspection',
      schemaVersion: 1,
      intent: inspectionIntent,
    }),
    uploads: UploadWork[] = [];
  function check(production = true) {
    options.guard?.();
    if (production) options.signal?.throwIfAborted();
  }
  check();
  for (const [index, item] of plannedUploads.entries()) {
    const uploadId = derived('lore-field', index),
      codec = await prepareBookLoreWritePayload(
        { uid, bookId: plan.bookId, loreId: plan.loreId, uploadId, ...item },
        options,
      ),
      intent = Object.freeze({
        bookId: plan.bookId,
        loreId: plan.loreId,
        uploadId,
        sourceToken: plan.sourceToken,
        target: item.target,
        manifest: codec.manifest,
      });
    uploads.push({
      id: uploadId,
      codec,
      manifest: codec.manifest,
      intent,
      startHash: hash({ domain: 'writer-lore-field-start', schemaVersion: 1, intent }),
      progress: null as LoreUploadProgress | null,
      iterator: null as ReturnType<PreparedUpload['parts']> | null,
      iteratorIndex: 0,
    });
  }
  let phase: BookLoreEditPhase = plan.empty ? 'empty' : 'preparing',
    blockedReason: LoreCleanupBlock | null = null,
    cancelRequested = false,
    completedCalls = 0,
    inspection: LoreInspectionProgress | null = null,
    edit: LoreEditProgress | null = null,
    editIntent: Record<string, unknown> | null = null,
    editHash: string | null = null,
    initialized = false,
    reservationIndex = 0,
    productionUploadIndex = 0,
    cleanupUploadIndex = 0,
    runningProduction = false,
    runningCleanup = false,
    pendingProduction: Task | null = null,
    pendingCleanup: Task | null = null,
    failedCancel: Task | null = null;
  const intentHash = hash({
    ...identity,
    sourceToken: plan.sourceToken,
    fields: plan.fields,
    relations: plan.relations,
    uploads: uploads.map((u) => ({ target: u.intent.target, manifest: u.manifest })),
  });
  const maxSlots =
    uploads.length + 7 + Math.ceil(((source.data.relations ?? []) as unknown[]).length / 64);
  const unitId = (method: string, id: string, revision: number | null) =>
    hash({ domain: 'writer-book-lore-client-unit', ...identity, method, id, revision });
  const task = (
    method: string,
    value: Record<string, unknown>,
    kind: Task['kind'],
    index?: number,
    commit?: Task['commit'],
  ): Task => {
    const request = freezeLoreEditValue(value) as Record<string, unknown>;
    return {
      method,
      input: request,
      kind,
      index,
      commit,
      requestHash: hash(request),
      direct: [names.inspectStart, names.uploadStart, names.editStart, names.editGet].includes(
        method,
      ),
    };
  };
  const control = (
    method: string,
    kind: Task['kind'],
    p: LoreProgress | null,
    index?: number,
    revision?: number,
  ) => {
    const id =
        kind === 'inspection' ? inspectionId : kind === 'edit' ? editId : uploads[index!]!.id,
      startHash =
        kind === 'inspection'
          ? inspectionHash
          : kind === 'edit'
            ? editHash
            : uploads[index!]!.startHash;
    if (!startHash) invalidLoreEdit();
    const expectedRevision = revision ?? p?.revision,
      key = kind === 'inspection' ? 'inspectionId' : kind === 'edit' ? 'editId' : 'uploadId',
      cancel = [names.inspectCancel, names.uploadCancel, names.editCancel].includes(method),
      get = method === names.editGet;
    if (!cancel && !get && (expectedRevision === undefined || !p?.jobToken)) invalidLoreEdit();
    return {
      [key]: id,
      startHash,
      ...(p?.jobToken ? { jobToken: p.jobToken } : {}),
      ...(!get ? { operationId: unitId(method, id, cancel ? null : expectedRevision!) } : {}),
      ...(!cancel && !get ? { expectedRevision } : {}),
    };
  };
  function parse(t: Task, value: unknown): LoreProgress {
    if (t.kind === 'inspection')
      return inspectionProgress(value, {
        id: inspectionId,
        startHash: inspectionHash,
        token: inspection?.jobToken,
      });
    if (t.kind === 'upload') {
      const u = uploads[t.index!]!;
      return uploadProgress(
        value,
        { id: u.id, startHash: u.startHash, token: u.progress?.jobToken },
        u.manifest,
      );
    }
    if (!editHash) invalidLoreEdit();
    const p = editProgress(
      value,
      { id: editId, startHash: editHash, token: edit?.jobToken },
      maxSlots,
    );
    if (p.adoption && p.adoption.operationId !== unitId(names.apply, editId, p.revision - 1))
      invalidLoreEdit();
    return p;
  }
  function accept(t: Task, p: LoreProgress) {
    const old =
      t.kind === 'inspection' ? inspection : t.kind === 'edit' ? edit : uploads[t.index!]!.progress;
    if (old && p.revision < old.revision) invalidLoreEdit();
    if (t.kind === 'inspection') inspection = p as LoreInspectionProgress;
    else if (t.kind === 'upload') uploads[t.index!]!.progress = p as LoreUploadProgress;
    else edit = p as LoreEditProgress;
  }
  function releaseValues() {
    for (const u of uploads) {
      u.codec = null;
      u.iterator = null;
    }
  }
  function applied(p: LoreEditProgress) {
    edit = p;
    phase = 'applied';
    releaseValues();
    blockedReason = null;
    pendingProduction = null;
    pendingCleanup = null;
    failedCancel = null;
  }
  const descriptor = (t: Task | null): PendingMetadata | null =>
    t
      ? {
          method: t.method,
          operationId: typeof t.input.operationId === 'string' ? t.input.operationId : null,
          requestHash: t.requestHash,
        }
      : null;
  function currentUploadControl(): BookLoreEditUploadControl | null {
    if (['empty', 'applied', 'cancelled'].includes(phase)) return null;
    const u = uploads[cancelRequested ? cleanupUploadIndex : productionUploadIndex];
    return u ? { id: u.id, startHash: u.startHash, progress: u.progress } : null;
  }
  function controlsPage(offset = 0, limit = 50): BookLoreEditControlPage {
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
      intentHash,
      items: uploads
        .slice(offset, end)
        .map((u) => ({ id: u.id, startHash: u.startHash, progress: u.progress })),
      nextOffset: end < uploads.length ? end : null,
    }) as BookLoreEditControlPage;
  }
  function snapshot(): BookLoreEditOperationSnapshot {
    return freezeLoreEditValue({
      schemaVersion: 1,
      ...identity,
      sourceToken: plan.sourceToken,
      intentHash,
      phase,
      completedCalls,
      blockedReason,
      inspection,
      uploads: {
        count: uploads.length,
        completed: productionUploadIndex,
        cleaned: cleanupUploadIndex,
        current: currentUploadControl(),
      },
      edit,
      pending: {
        production: descriptor(pendingProduction),
        cleanup: descriptor(pendingCleanup),
        failedCancel: descriptor(failedCancel),
      },
    }) as BookLoreEditOperationSnapshot;
  }
  function requestCancel() {
    if (phase === 'empty') phase = 'cancelled';
    else if (!['applied', 'cancelled'].includes(phase)) {
      cancelRequested = true;
      phase = 'cancelling';
    }
    return snapshot();
  }
  async function productionTask(): Promise<Task | null> {
    if (!inspection) return task(names.inspectStart, inspectionIntent, 'inspection');
    if (inspection.phase === 'cancelled') {
      requestCancel();
      return null;
    }
    if (!inspection.ready)
      return task(names.inspect, control(names.inspect, 'inspection', inspection), 'inspection');
    while (productionUploadIndex < uploads.length) {
      const index = productionUploadIndex,
        u = uploads[index]!;
      const p = u.progress;
      if (!p) return task(names.uploadStart, u.intent, 'upload', index);
      if (['cancelling', 'cancelled'].includes(p.phase)) {
        requestCancel();
        return null;
      }
      if (p.phase === 'uploading') {
        if (!u.iterator || u.iteratorIndex !== p.nextIndex) {
          if (!u.codec) invalidLoreEdit();
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
        if (part.done || !part.value || typeof part.value !== 'object') invalidLoreEdit();
        const value = part.value;
        if (value.index !== p.nextIndex) invalidLoreEdit();
        u.iteratorIndex++;
        return task(
          names.append,
          { ...control(names.append, 'upload', p, index), ...value },
          'upload',
          index,
        );
      }
      if (p.phase === 'verifying')
        return task(names.seal, control(names.seal, 'upload', p, index), 'upload', index);
      if (!['sealed', 'reserved'].includes(p.phase)) invalidLoreEdit();
      productionUploadIndex++;
    }
    if (!editIntent) {
      const fields = Object.fromEntries(
        plan.fields.map((f) => [
          f.field,
          'remove' in f
            ? null
            : {
                uploadId: uploads[f.upload]!.id,
                startHash: uploads[f.upload]!.startHash,
                jobToken: uploads[f.upload]!.progress!.jobToken,
              },
        ]),
      );
      editIntent = freezeLoreEditValue({
        bookId: plan.bookId,
        loreId: plan.loreId,
        editId,
        sourceToken: plan.sourceToken,
        inspection: { inspectionId, startHash: inspectionHash, jobToken: inspection.jobToken },
        fields,
        ...(plan.relations ? { relations: plan.relations } : {}),
      }) as Record<string, unknown>;
      editHash = hash({ domain: 'writer-lore-edit-start', schemaVersion: 1, intent: editIntent });
    }
    if (!edit) return task(names.editStart, editIntent, 'edit');
    if (edit.phase === 'adopted') {
      applied(edit);
      return null;
    }
    if (['cancelling', 'cancelled'].includes(edit.phase)) {
      requestCancel();
      return null;
    }
    // Initialization and slots have deterministic original CAS, so completed units can replay.
    if (!initialized)
      return task(
        names.initialize,
        control(names.initialize, 'edit', edit, undefined, 0),
        'edit',
        undefined,
        () => {
          initialized = true;
        },
      );
    if (reservationIndex < uploads.length) {
      const index = reservationIndex,
        u = uploads[index]!;
      return task(
        names.reserve,
        {
          ...control(names.reserve, 'edit', edit, undefined, 1 + index),
          target: u.intent.target,
          upload: { uploadId: u.id, startHash: u.startHash, jobToken: u.progress!.jobToken },
        },
        'edit',
        undefined,
        () => {
          reservationIndex++;
        },
      );
    }
    if (edit.compilation?.phase === 'ready') {
      phase = 'ready';
      return null;
    }
    return task(names.compile, control(names.compile, 'edit', edit), 'edit');
  }
  function cleanupTask(): Task | null {
    if (editHash) {
      if (edit?.phase === 'adopted') {
        applied(edit);
        return null;
      }
      if (edit?.phase !== 'cancelled') {
        const method = edit?.phase === 'cancelling' ? names.editClean : names.editCancel;
        return task(method, control(method, 'edit', edit), 'edit');
      }
    }
    while (cleanupUploadIndex < uploads.length) {
      const index = cleanupUploadIndex,
        u = uploads[index]!;
      if (u.progress?.phase === 'cancelled') {
        cleanupUploadIndex++;
        continue;
      }
      const method = u.progress?.phase === 'cancelling' ? names.uploadClean : names.uploadCancel;
      return task(method, control(method, 'upload', u.progress, index), 'upload', index);
    }
    if (inspection?.phase !== 'cancelled')
      return task(
        names.inspectCancel,
        control(names.inspectCancel, 'inspection', inspection),
        'inspection',
      );
    phase = 'cancelled';
    releaseValues();
    blockedReason = null;
    pendingProduction = null;
    pendingCleanup = null;
    failedCancel = null;
    return null;
  }
  async function dispatch(t: Task, cleanup: boolean) {
    check(!cleanup);
    const raw = await port.call(t.method, t.input);
    check(!cleanup);
    const response = progressResponse(raw, t.direct, (v) => parse(t, v)),
      p = response.progress;
    completedCalls++;
    if (t.kind === 'edit' && p.phase === 'adopted') {
      applied(p as LoreEditProgress);
      return;
    }
    if (phase === 'applied' || phase === 'cancelled') return;
    // A late producer reply must never overwrite a cleanup checkpoint.
    if (!cleanup && cancelRequested) return;
    accept(t, p);
    blockedReason =
      response.blocked ?? (t.kind === 'edit' ? (p as LoreEditProgress).blockedReason : null);
    if (cleanup) {
      if (pendingCleanup === t) pendingCleanup = null;
    } else if (pendingProduction === t) pendingProduction = null;
    t.commit?.(p);
  }
  async function advance() {
    if (['empty', 'applied', 'cancelled'].includes(phase)) return snapshot();
    const cleanup = cancelRequested;
    if (cleanup ? runningCleanup : runningProduction)
      throw new Error('Uma unidade desta operação já está em andamento.');
    check(!cleanup);
    if (cleanup) runningCleanup = true;
    else runningProduction = true;
    try {
      let t = cleanup ? pendingCleanup : pendingProduction;
      if (!t) {
        t = cleanup ? cleanupTask() : await productionTask();
        if (!t) return snapshot();
        // Cancellation can arrive while a skipped prefix yields to the event loop.
        if (!cleanup && cancelRequested) return snapshot();
        if (cleanup) pendingCleanup = t;
        else pendingProduction = t;
      }
      try {
        await dispatch(t, cleanup);
      } catch (error) {
        if (cleanup && t.method === names.editCancel && conflictCode(error)) {
          failedCancel = t;
          pendingCleanup = task(
            names.editGet,
            control(names.editGet, 'edit', edit),
            'edit',
            undefined,
            () => {
              if (edit?.phase === 'adopted') return;
              pendingCleanup = failedCancel;
              failedCancel = null;
            },
          );
        }
        throw error;
      }
      return snapshot();
    } finally {
      if (cleanup) runningCleanup = false;
      else runningProduction = false;
    }
  }
  async function apply() {
    if (phase === 'applied' || phase === 'empty') return snapshot();
    if (cancelRequested || phase !== 'ready' || !edit || runningProduction)
      throw new Error('Conclua a preparação antes de confirmar a edição.');
    if (pendingProduction && pendingProduction.method !== names.apply) invalidLoreEdit();
    const t = pendingProduction ?? task(names.apply, control(names.apply, 'edit', edit), 'edit');
    pendingProduction = t;
    runningProduction = true;
    try {
      await dispatch(t, false);
      return snapshot();
    } finally {
      runningProduction = false;
    }
  }
  return Object.freeze({ snapshot, controlsPage, advance, apply, requestCancel });
}
