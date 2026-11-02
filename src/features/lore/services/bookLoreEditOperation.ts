import { bookContentId } from '../../../../functions/src/bookBackupSchema.mjs';
import { readObject, readCount } from './bookLoreReadContracts';
import { journalWire } from './bookLoreJournalContracts';
import type { BookLoreEditCheckpoint, BookLoreEditRecovery } from './bookLoreEditCheckpoint';
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
  loreCleanupBlocks,
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

/** Explicit operation; checkpoint recovery never sends. The host owns durable storage. */
export async function prepareBookLoreEditOperation(
  input: BookLoreEditOperationInput,
  port: BookLoreEditPort,
  options: BookLoreWriteOptions = {},
  recovery?: BookLoreEditRecovery,
) {
  const saved = recovery ? freezeLoreEditValue(recovery.checkpoint) : null,
    readControls = recovery?.controlsPage,
    restoringCleanup =
      !!saved &&
      typeof saved === 'object' &&
      'cancelRequested' in saved &&
      saved.cancelRequested === true;
  if (recovery && typeof readControls !== 'function') invalidLoreEdit();
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
  check(!restoringCleanup);
  for (const [index, item] of plannedUploads.entries()) {
    const uploadId = derived('lore-field', index),
      codec = await prepareBookLoreWritePayload(
        { uid, bookId: plan.bookId, loreId: plan.loreId, uploadId, ...item },
        restoringCleanup ? { ...options, signal: undefined } : options,
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
  function checkpoint(): BookLoreEditCheckpoint {
    const wire = (t: Task | null) => (t ? { method: t.method, input: t.input } : null);
    return freezeLoreEditValue({
      schemaVersion: 1,
      ...identity,
      sourceToken: plan.sourceToken,
      intentHash,
      phase,
      completedCalls,
      blockedReason,
      cancelRequested,
      initialized,
      reservationIndex,
      productionUploadIndex,
      cleanupUploadIndex,
      uploadCount: uploads.length,
      hasEditIntent: editIntent !== null,
      controlsHash: controlsHash(),
      inspection,
      edit,
      pending: {
        production: wire(pendingProduction),
        cleanup: wire(pendingCleanup),
        failedCancel: wire(failedCancel),
      },
    }) as BookLoreEditCheckpoint;
  }
  function requestCancel() {
    if (phase === 'empty') phase = 'cancelled';
    else if (!['applied', 'cancelled'].includes(phase)) {
      cancelRequested = true;
      phase = 'cancelling';
    }
    return snapshot();
  }
  function controlsHash() {
    let digest = hash({
      domain: 'writer-lore-edit-control-pages',
      intentHash,
      count: uploads.length,
    });
    for (const u of uploads)
      digest = hash({ previous: digest, id: u.id, startHash: u.startHash, progress: u.progress });
    return digest;
  }
  function ensureEditIntent() {
    if (editIntent) return;
    if (!inspection?.jobToken || uploads.some((u) => !u.progress?.jobToken)) invalidLoreEdit();
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
  function restoredProgress(kind: Task['kind'], value: unknown, index?: number) {
    const { id, ...raw } = readObject(
      value,
      ['id'],
      [
        'startHash',
        'jobToken',
        'phase',
        'revision',
        'nextIndex',
        'byteLength',
        'totalParts',
        'ready',
        'sealIndex',
        'cleanupIndex',
        'cleanedCount',
        'prepared',
        'reservedCount',
        'releasedCount',
        'blockedReason',
        'compilation',
        'adoption',
      ],
    );
    if (kind === 'inspection')
      return inspectionProgress(
        { ...raw, inspectionId: id },
        { id: inspectionId, startHash: inspectionHash },
      );
    if (kind === 'upload') {
      const u = uploads[index!]!;
      return uploadProgress(
        { ...raw, uploadId: id },
        { id: u.id, startHash: u.startHash },
        u.manifest,
      );
    }
    return parse({ kind: 'edit' } as Task, { ...raw, editId: id });
  }
  async function restoredTask(
    value: unknown,
    slot: 'production' | 'cleanup' | 'failedCancel',
  ): Promise<Task | null> {
    if (value === null) return null;
    const { wire, metadata } = journalWire(value, {
      bookId: plan.bookId,
      loreId: plan.loreId,
      sourceToken: plan.sourceToken,
    });
    const { method, input: request } = wire;
    if (
      !Object.values(names).includes(method) ||
      (slot === 'production' ? metadata.lane !== 'production' : metadata.lane === 'production') ||
      (slot === 'failedCancel' && method !== names.editCancel) ||
      (metadata.lane === 'diagnostic' && method !== names.editGet)
    )
      invalidLoreEdit();
    const index = uploads.findIndex((u) => u.id === metadata.id);
    const kind: Task['kind'] =
      metadata.id === inspectionId ? 'inspection' : metadata.id === editId ? 'edit' : 'upload';
    if (kind === 'upload' && index < 0) invalidLoreEdit();
    const expectedHash =
        kind === 'inspection'
          ? inspectionHash
          : kind === 'edit'
            ? editHash
            : uploads[index]!.startHash,
      p = kind === 'inspection' ? inspection : kind === 'edit' ? edit : uploads[index]!.progress;
    if (
      metadata.startHash !== expectedHash ||
      (metadata.jobToken !== null && metadata.jobToken !== p?.jobToken)
    )
      invalidLoreEdit();
    if (method.startsWith('start')) {
      const intent =
        kind === 'inspection'
          ? inspectionIntent
          : kind === 'edit'
            ? editIntent
            : uploads[index]!.intent;
      if (hash(request) !== hash(intent)) invalidLoreEdit();
    } else if (method !== names.editGet) {
      const cancel = method.startsWith('cancel');
      if (
        metadata.operationId !==
        unitId(method, metadata.id, cancel ? null : metadata.expectedRevision)
      )
        invalidLoreEdit();
      if (
        !cancel &&
        (!p || metadata.expectedRevision === null || metadata.expectedRevision > p.revision)
      )
        invalidLoreEdit();
    }
    if (method === names.append) {
      const u = uploads[index]!;
      if (!u.codec) invalidLoreEdit();
      const at = readCount(request.index);
      if (!cancelRequested && at !== u.progress?.nextIndex) invalidLoreEdit();
      const part = await u.codec.parts(at).next();
      check(!cancelRequested);
      if (part.done || !part.value || hash({ ...request, ...part.value }) !== hash(request))
        invalidLoreEdit();
    }
    let commit: Task['commit'];
    if (method === names.initialize) {
      if (initialized || metadata.expectedRevision !== 0) invalidLoreEdit();
      commit = () => {
        initialized = true;
      };
    } else if (method === names.reserve) {
      const u = uploads[reservationIndex];
      if (
        !initialized ||
        !u ||
        metadata.expectedRevision !== 1 + reservationIndex ||
        hash(request.target) !== hash(u.intent.target) ||
        hash(request.upload) !==
          hash({ uploadId: u.id, startHash: u.startHash, jobToken: u.progress?.jobToken })
      )
        invalidLoreEdit();
      commit = () => {
        reservationIndex++;
      };
    } else if (method === names.editGet) {
      if (!failedCancel) invalidLoreEdit();
      commit = () => {
        if (edit?.phase === 'adopted') return;
        pendingCleanup = failedCancel;
        failedCancel = null;
      };
    }
    return task(method, request, kind, kind === 'upload' ? index : undefined, commit);
  }
  async function hydrate(value: unknown, reader: BookLoreEditRecovery['controlsPage']) {
    check(!restoringCleanup);
    const v = readObject(value, [
      'schemaVersion',
      'uid',
      'writeId',
      'bookId',
      'loreId',
      'sourceToken',
      'intentHash',
      'phase',
      'completedCalls',
      'blockedReason',
      'cancelRequested',
      'initialized',
      'reservationIndex',
      'productionUploadIndex',
      'cleanupUploadIndex',
      'uploadCount',
      'controlsHash',
      'hasEditIntent',
      'inspection',
      'edit',
      'pending',
    ]);
    if (
      v.schemaVersion !== 1 ||
      v.uid !== uid ||
      v.writeId !== writeId ||
      v.bookId !== plan.bookId ||
      v.loreId !== plan.loreId ||
      v.sourceToken !== plan.sourceToken ||
      v.intentHash !== intentHash ||
      !['empty', 'preparing', 'ready', 'applied', 'cancelling', 'cancelled'].includes(
        v.phase as string,
      ) ||
      typeof v.cancelRequested !== 'boolean' ||
      typeof v.initialized !== 'boolean' ||
      typeof v.hasEditIntent !== 'boolean' ||
      v.uploadCount !== uploads.length ||
      (v.blockedReason !== null && !loreCleanupBlocks.includes(v.blockedReason as LoreCleanupBlock))
    )
      invalidLoreEdit();
    for (const key of [
      'completedCalls',
      'reservationIndex',
      'productionUploadIndex',
      'cleanupUploadIndex',
    ])
      readCount(v[key]);
    if (
      [v.reservationIndex, v.productionUploadIndex, v.cleanupUploadIndex].some(
        (n) => (n as number) > uploads.length,
      ) ||
      (!v.initialized && v.reservationIndex !== 0) ||
      (!v.hasEditIntent && (v.initialized || v.reservationIndex !== 0 || v.edit !== null))
    )
      invalidLoreEdit();
    // Bind every bounded page to this root, including pages read during a concurrent change.
    for (let offset = 0; offset < uploads.length; offset += 50) {
      const limit = Math.min(50, uploads.length - offset);
      const page = readObject(freezeLoreEditValue(await reader(offset, limit)), [
        'intentHash',
        'items',
        'nextOffset',
      ]);
      check(!restoringCleanup);
      const end = offset + limit;
      if (
        page.intentHash !== intentHash ||
        !Array.isArray(page.items) ||
        page.items.length !== limit ||
        page.nextOffset !== (end < uploads.length ? end : null)
      )
        invalidLoreEdit();
      for (const [local, raw] of page.items.entries()) {
        const item = readObject(raw, ['id', 'startHash', 'progress']),
          index = offset + local,
          u = uploads[index]!;
        if (item.id !== u.id || item.startHash !== u.startHash) invalidLoreEdit();
        u.progress =
          item.progress === null
            ? null
            : (restoredProgress('upload', item.progress, index) as LoreUploadProgress);
      }
    }
    if (v.controlsHash !== controlsHash()) invalidLoreEdit();
    inspection =
      v.inspection === null
        ? null
        : (restoredProgress('inspection', v.inspection) as LoreInspectionProgress);
    if (v.hasEditIntent) ensureEditIntent();
    edit = v.edit === null ? null : (restoredProgress('edit', v.edit) as LoreEditProgress);
    if (v.initialized && !edit?.jobToken) invalidLoreEdit();
    phase = v.phase as BookLoreEditPhase;
    cancelRequested = v.cancelRequested;
    initialized = v.initialized;
    completedCalls = v.completedCalls as number;
    blockedReason = v.blockedReason as LoreCleanupBlock | null;
    reservationIndex = v.reservationIndex as number;
    productionUploadIndex = v.productionUploadIndex as number;
    cleanupUploadIndex = v.cleanupUploadIndex as number;
    if (
      (phase === 'empty' && !plan.empty) ||
      (plan.empty && !['empty', 'cancelled'].includes(phase)) ||
      (phase === 'cancelling' && !cancelRequested) ||
      (cancelRequested && !['cancelling', 'cancelled', 'applied'].includes(phase)) ||
      (phase === 'applied' && edit?.phase !== 'adopted') ||
      (phase === 'ready' &&
        (edit?.compilation?.phase !== 'ready' ||
          !initialized ||
          reservationIndex !== uploads.length ||
          productionUploadIndex !== uploads.length)) ||
      (phase === 'cancelled' &&
        !plan.empty &&
        (cleanupUploadIndex !== uploads.length ||
          inspection?.phase !== 'cancelled' ||
          (editIntent !== null && edit?.phase !== 'cancelled')))
    )
      invalidLoreEdit();
    for (const [index, u] of uploads.entries()) {
      if (
        (index < cleanupUploadIndex && u.progress?.phase !== 'cancelled') ||
        (!cancelRequested &&
          index < productionUploadIndex &&
          !['sealed', 'reserved'].includes(u.progress?.phase ?? ''))
      )
        invalidLoreEdit();
    }
    const pending = readObject(v.pending, ['production', 'cleanup', 'failedCancel']);
    if (
      (['empty', 'applied', 'cancelled'].includes(phase) &&
        Object.values(pending).some((p) => p !== null)) ||
      (!cancelRequested && (pending.cleanup !== null || pending.failedCancel !== null))
    )
      invalidLoreEdit();
    failedCancel = await restoredTask(pending.failedCancel, 'failedCancel');
    pendingProduction = await restoredTask(pending.production, 'production');
    pendingCleanup = await restoredTask(pending.cleanup, 'cleanup');
    if (failedCancel && pendingCleanup?.method !== names.editGet) invalidLoreEdit();
    check(!restoringCleanup);
    if (phase === 'applied' || phase === 'cancelled') releaseValues();
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
    ensureEditIntent();
    if (!edit) return task(names.editStart, editIntent!, 'edit');
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
  if (recovery) await hydrate(saved, readControls!);
  return Object.freeze({ snapshot, checkpoint, controlsPage, advance, apply, requestCancel });
}

/** Restores protected data already reauthorized by the host. Performs no RPC. */
export function restoreBookLoreEditOperation(
  input: BookLoreEditOperationInput,
  recovery: BookLoreEditRecovery,
  port: BookLoreEditPort,
  options: BookLoreWriteOptions = {},
) {
  return prepareBookLoreEditOperation(input, port, options, recovery);
}
