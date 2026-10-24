import { bookLoreWriteHash as hash } from './bookLoreWritePayload';
import { journalFail, metadataJournalWire, type LoreJournalHead } from './bookLoreJournalContracts';
import {
  loreMetadataWire,
  loreControlUnitId,
  loreControlProgress,
  type LoreControlWorker,
  type LoreControlPending,
} from './bookLoreControlContracts';
import { progressResponse, type LoreEditProgress } from './bookLoreWriteProgress';
import type { BookLoreEditPort } from './bookLoreEditOperation';
import type { LoreControlContext, journalControlMap } from './bookLoreControlMap';
type MapAccess = ReturnType<typeof journalControlMap>;
const code = (error: unknown, name: string) =>
  !!error &&
  typeof error === 'object' &&
  'code' in error &&
  [name, 'functions/' + name].includes(String(error.code));
export function journalControlCleanup(ctx: LoreControlContext, map: MapAccess) {
  let busy = false;
  function checkPending(h: LoreJournalHead, pending: LoreControlPending, generation: string) {
    if (
      h.controls?.generation !== generation ||
      !h.controls.worker.pending ||
      hash(h.controls.worker.pending) !== hash(pending)
    )
      journalFail();
    return h.controls.worker;
  }
  function ack(h: LoreJournalHead, p: LoreControlPending) {
    if (!p.legacyLane) return h;
    const metadata = loreMetadataWire(p.wire, h.identity).metadata,
      unit = h[p.legacyLane];
    if (!unit || unit.requestHash !== metadata.requestHash || unit.state === 'sealing')
      journalFail();
    return { ...h, [p.legacyLane]: { ...unit, state: 'confirmed' as const } };
  }
  function absent(p: LoreControlPending, generation: string) {
    return ctx.mutate((h) => {
      const w = checkPending(h, p, generation),
        next = ack(h, p);
      return {
        ...next,
        controls: {
          ...h.controls!,
          worker: {
            ...w,
            pending: null,
            completedCalls: w.completedCalls + 1,
            ...(p.role === 'wanted' && w.stage === 'edit-get'
              ? { stage: 'edit-cancel' as const, progress: null }
              : {}),
          },
        },
      };
    });
  }
  async function known(wire: unknown) {
    const h = await ctx.inspect(),
      parsed = loreMetadataWire(wire, h.identity),
      found = await map.controlById(parsed.metadata.id);
    if (found.ref.startHash !== parsed.metadata.startHash) journalFail();
    return { ...parsed, ...found };
  }
  async function wanted(h: LoreJournalHead) {
    const c = h.controls!,
      w = c.worker,
      ref = w.stage.startsWith('edit-')
        ? c.edit!
        : w.stage === 'inspection'
          ? c.inspection
          : await map.uploadAt(w.uploadIndex),
      method =
        w.stage === 'edit-get'
          ? 'getBookLoreEditReservation'
          : w.stage === 'edit-cancel'
            ? 'cancelBookLoreEditReservation'
            : w.stage === 'edit-clean'
              ? 'advanceBookLoreEditReservationCleanup'
              : w.stage === 'inspection'
                ? 'cancelBookLoreSourceInspection'
                : w.progress?.phase === 'cancelling'
                  ? 'advanceBookLoreFieldCleanup'
                  : 'cancelBookLoreFieldUpload';
    if (method === 'cancelBookLoreEditReservation' && w.failedCancel) return w.failedCancel;
    const get = method.startsWith('get'),
      cancel = method.startsWith('cancel'),
      p = w.progress,
      key = w.stage.startsWith('edit-')
        ? 'editId'
        : w.stage === 'inspection'
          ? 'inspectionId'
          : 'uploadId';
    if (!get && !cancel && (!p?.jobToken || p.phase !== 'cancelling')) journalFail();
    return {
      method,
      input: {
        [key]: ref.id,
        startHash: ref.startHash,
        ...(p?.jobToken ? { jobToken: p.jobToken } : {}),
        ...(!get
          ? {
              operationId: loreControlUnitId(
                h.identity,
                method,
                ref.id,
                cancel ? null : p!.revision,
              ),
            }
          : {}),
        ...(!get && !cancel ? { expectedRevision: p!.revision } : {}),
      },
    };
  }
  async function select(h: LoreJournalHead): Promise<LoreControlPending> {
    const requested = await wanted(h),
      target = loreMetadataWire(requested, h.identity).metadata,
      w = h.controls!.worker;
    let wire = requested,
      legacyLane: LoreControlPending['legacyLane'] = null;
    if (h.diagnostic?.state === 'pending') {
      wire = metadataJournalWire(h.diagnostic);
      legacyLane = 'diagnostic';
    } else if (
      h.cleanup?.state === 'pending' &&
      w.stage !== 'edit-get' &&
      (!w.stage.startsWith('edit-') || h.cleanup.id === h.controls!.edit?.id)
    ) {
      wire = metadataJournalWire(h.cleanup);
      legacyLane = 'cleanup';
    }
    const parsed = await known(wire);
    const same =
      parsed.metadata.id === target.id &&
      (w.stage === 'edit-get') === parsed.wire.method.startsWith('get');
    return { wire: parsed.wire, role: same ? 'wanted' : 'replay', legacyLane };
  }
  async function advanceControlCleanup(port: BookLoreEditPort) {
    if (busy) throw Error('Uma etapa de cancelamento já está em andamento.');
    busy = true;
    try {
      let h = await ctx.inspect();
      if (!h.controls?.ready)
        throw Error('Conclua o mapa de controles antes de cancelar esta operação.');
      if (h.controls.worker.phase === 'idle') {
        h = await ctx.mutate((h) => {
          if (!h.controls?.ready || h.controls.worker.phase !== 'idle') journalFail();
          return {
            ...h,
            cancelRequested: true,
            controls: {
              ...h.controls,
              worker: {
                ...h.controls.worker,
                phase: 'running',
                stage: h.controls.edit ? 'edit-get' : 'uploads',
              },
            },
          };
        });
      }
      if (h.controls!.worker.phase !== 'running') return h;
      // No uploads still require a source fence; transition without an extra RPC.
      if (
        h.controls!.worker.stage === 'uploads' &&
        h.controls!.worker.uploadIndex === h.controls!.count
      ) {
        h = await ctx.mutate((h) => ({
          ...h,
          controls: {
            ...h.controls!,
            worker: {
              ...h.controls!.worker,
              stage: 'inspection',
              progress: null,
            },
          },
        }));
      }
      const generation = h.controls!.generation;
      let pending = h.controls!.worker.pending;
      if (!pending) {
        pending = await select(h);
        const selected = pending,
          before = hash(h.controls!.worker);
        h = await ctx.mutate((h) => {
          if (h.controls?.generation !== generation || hash(h.controls.worker) !== before)
            journalFail();
          return {
            ...h,
            controls: { ...h.controls, worker: { ...h.controls.worker, pending: selected } },
          };
        });
      }
      const p = pending,
        parsed = await known(p.wire),
        w = checkPending(await ctx.inspect(), p, generation);
      let raw: unknown;
      try {
        raw = await port.call(parsed.wire.method, parsed.wire.input);
      } catch (error) {
        await ctx.inspect();
        if (parsed.wire.method.startsWith('get') && code(error, 'not-found'))
          return await absent(p, generation);
        if (
          p.role === 'wanted' &&
          parsed.wire.method === 'cancelBookLoreEditReservation' &&
          code(error, 'failed-precondition')
        ) {
          return await ctx.mutate((h) => {
            const w = checkPending(h, p, generation);
            return {
              ...h,
              controls: {
                ...h.controls!,
                worker: { ...w, pending: null, failedCancel: p.wire, stage: 'edit-get' },
              },
            };
          });
        }
        throw error;
      }
      await ctx.inspect();
      if (raw === null && parsed.wire.method.startsWith('get')) return await absent(p, generation);
      const result = progressResponse(raw, parsed.wire.method.startsWith('get'), (value) =>
          loreControlProgress(
            value,
            parsed.kind,
            parsed.ref,
            parsed.metadata.jobToken ?? undefined,
          ),
        ),
        progress = result.progress;
      let nextWorker: LoreControlWorker = {
        ...w,
        pending: null,
        completedCalls: w.completedCalls + 1,
      };
      if (parsed.kind === 'edit' && progress.phase === 'adopted') {
        const edit = progress as LoreEditProgress;
        if (
          edit.revision < 1 ||
          edit.adoption?.operationId !==
            loreControlUnitId(h.identity, 'adoptBookLoreEditGeneration', edit.id, edit.revision - 1)
        )
          journalFail();
        nextWorker = {
          ...nextWorker,
          phase: 'applied',
          stage: 'edit-get',
          progress,
          blockedReason: null,
          failedCancel: null,
        };
      } else if (p.role === 'wanted') {
        const old = w.progress;
        if (old && old.id === progress.id && progress.revision < old.revision) {
          if (!p.legacyLane) journalFail();
        } else {
          nextWorker = {
            ...nextWorker,
            progress,
            blockedReason:
              result.blocked ??
              (parsed.kind === 'edit' ? (progress as LoreEditProgress).blockedReason : null),
          };
          if (w.stage.startsWith('edit-')) {
            if (progress.phase === 'cancelled')
              nextWorker = { ...nextWorker, stage: 'uploads', progress: null, failedCancel: null };
            else
              nextWorker = {
                ...nextWorker,
                stage: progress.phase === 'cancelling' ? 'edit-clean' : 'edit-cancel',
                ...(parsed.wire.method === 'cancelBookLoreEditReservation'
                  ? { failedCancel: null }
                  : {}),
              };
          } else if (w.stage === 'uploads' && progress.phase === 'cancelled') {
            const index = w.uploadIndex + 1;
            nextWorker = {
              ...nextWorker,
              uploadIndex: index,
              stage: index === h.controls!.count ? 'inspection' : 'uploads',
              progress: null,
              blockedReason: null,
            };
          } else if (w.stage === 'inspection' && progress.phase === 'cancelled') {
            nextWorker = {
              ...nextWorker,
              phase: 'cancelled',
              blockedReason: null,
              failedCancel: null,
            };
          }
        }
      }
      return await ctx.mutate((h) => {
        checkPending(h, p, generation);
        const next = ack(h, p);
        return { ...next, controls: { ...h.controls!, worker: nextWorker } };
      });
    } finally {
      busy = false;
    }
  }
  return { advanceControlCleanup };
}
