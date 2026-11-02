import {
  recoveryCheck as check,
  recoveryObject as closed,
  type AdventureRestoreRecoveryIdentity,
} from './adventureRestoreRecoveryContracts';
import {
  readAdventureEffectIdentity,
  readAdventureRestoreEffectRecord,
  readAdventureRestoreEffectIntent,
  createAdventureRestoreEffectRecord,
  adventureRestoreEffectInput,
  adventureRestoreEffectFingerprint,
  effectObject as object,
  effectCount as count,
  type AdventureRestoreEffectAction,
  type AdventureRestoreEffectRecord,
  type AdventureRestoreEffectIntent,
} from './adventureRestoreEffectContracts';
import {
  readStoredAdventureRestoreEffect,
  compareStoredAdventureRestoreEffect,
} from './adventureRestoreEffectStore';
import {
  createAdventureRestoreEffectApi,
  type AdventureRestoreEffectApi,
} from './adventureRestoreEffectCallables';
import { createAdventureRestoreTransferApi } from './adventureRestoreTransferCallables';
import {
  readAdventureRestoreTransferJob,
  type AdventureRestoreTransferJob,
} from './adventureRestoreTransferJob';
import {
  readAdventureRestoreActivationReview,
  readAdventureRestoreMediaStatus,
  readAdventureRestoreArchiveStatus,
  ADVENTURE_RESTORE_ARCHIVE_PHASES,
  type AdventureRestoreActivationReview,
  type AdventureRestoreMediaStatus,
  type AdventureRestoreArchiveStatus,
} from './adventureRestoreFinalizationViews';
import { adventureRestoreMetadataHash } from './adventureRestoreTransferContracts';
import { validAdventureStagingView } from '../../../../functions/src/adventureRestoreStagingMeta.mjs';

export type AdventureRestoreEffectAck = Readonly<{
  kind: 'confirmed' | 'retired' | 'already-complete';
  action: AdventureRestoreEffectAction;
  job?: AdventureRestoreTransferJob;
  media?: AdventureRestoreMediaStatus;
  archive?: AdventureRestoreArchiveStatus;
}>;
type Storage = {
  read: typeof readStoredAdventureRestoreEffect;
  compare: typeof compareStoredAdventureRestoreEffect;
};
const conflict = (error: unknown, reason: string) => {
  const e = error as { code?: string; details?: { reason?: string } } | null;
  return (
    ['failed-precondition', 'functions/failed-precondition'].includes(e?.code ?? '') &&
    e?.details?.reason === reason
  );
};
export function createAdventureRestoreEffectSession(options: {
  identity: AdventureRestoreRecoveryIdentity;
  check: () => void;
  api?: AdventureRestoreEffectApi;
  storage?: Storage;
  getJob?: () => Promise<unknown>;
  operationId?: () => string;
}) {
  const identity = readAdventureEffectIdentity(options.identity),
    { check: guard, operationId = () => crypto.randomUUID() } = options,
    api = options.api ?? createAdventureRestoreEffectApi(identity.ownerId, guard),
    storage = options.storage ?? {
      read: readStoredAdventureRestoreEffect,
      compare: compareStoredAdventureRestoreEffect,
    },
    jobs = createAdventureRestoreTransferApi(identity.ownerId, guard),
    scope = Object.freeze({ restoreId: identity.restoreId, jobToken: identity.jobToken }),
    getJob = options.getJob ?? (() => jobs.get(scope));
  let running = false;
  async function unit<T>(work: () => Promise<T>): Promise<T> {
    guard();
    check(!running);
    running = true;
    try {
      return await work();
    } finally {
      running = false;
    }
  }
  function jobReply(raw: unknown) {
    const p = readAdventureRestoreTransferJob(raw, identity.ownerId, identity);
    check(p.adventureId === identity.adventureId && p.reviewHash === identity.reviewHash);
    return p;
  }
  async function current() {
    guard();
    const raw = await getJob();
    guard();
    return jobReply(raw);
  }
  async function pending() {
    guard();
    const raw = await storage.read(identity.ownerId, identity.restoreId, guard);
    guard();
    if (raw === null) return null;
    const r = readAdventureRestoreEffectRecord(raw, identity.ownerId, identity.restoreId);
    readAdventureRestoreEffectIntent(r.intent, identity);
    return r;
  }
  async function clear(record: AdventureRestoreEffectRecord) {
    guard();
    const ok = await storage.compare(identity.ownerId, identity.restoreId, record, null, guard);
    guard();
    check(ok);
  }
  function mediaReply(raw: unknown) {
    check(object(raw) && raw.schemaVersion === 1);
    return readAdventureRestoreMediaStatus(raw.media);
  }
  function archiveReply(raw: unknown) {
    check(object(raw) && raw.schemaVersion === 1);
    return readAdventureRestoreArchiveStatus(raw.progress, identity);
  }
  function confirmed(
    raw: unknown,
    intent: AdventureRestoreEffectIntent,
  ): AdventureRestoreEffectAck {
    check(object(raw) && raw.schemaVersion === 1);
    if (intent.action === 'advanceAdventureRestoreMedia') {
      const media = mediaReply(raw);
      if (raw.kind === 'already-complete') {
        check(
          raw.receipt === null && media.complete && media.checkpoint === intent.expectedCheckpoint,
        );
        return { kind: 'already-complete', action: intent.action, media };
      }
      check(raw.kind === 'confirmed' && object(raw.receipt));
      const r = raw.receipt;
      check(
        r.action === intent.action &&
          r.operationId === intent.operationId &&
          r.checkpoint === intent.expectedCheckpoint + 1 &&
          count(r.completedAt) &&
          r.completedAt <= 8640000000000000 &&
          media.checkpoint >= r.checkpoint &&
          ['ready', 'unavailable', 'complete'].includes(r.state as string),
      );
      if (r.state === 'complete')
        check(
          r.assetId === null &&
            r.imageId === null &&
            media.complete &&
            media.checkpoint === r.checkpoint,
        );
      else
        check(
          typeof r.assetId === 'string' &&
            /^[a-f0-9]{64}$/.test(r.assetId) &&
            typeof r.imageId === 'string' &&
            /^restore-[a-f0-9]{64}$/.test(r.imageId) &&
            (r.state === 'ready' ? media.ready > 0 : media.unavailable > 0) &&
            (media.checkpoint === r.checkpoint ? !media.complete : true),
        );
      return { kind: 'confirmed', action: intent.action, media };
    }
    if (intent.action === 'advanceAdventureRestoreArchiveCleanup') {
      const archive = archiveReply(raw);
      if (raw.kind === 'already-complete') {
        check(raw.receipt === null && archive.phase === 'done');
        return { kind: 'already-complete', action: intent.action, archive };
      }
      check(raw.kind === 'confirmed' && object(raw.receipt) && object(raw.progress));
      const historical = raw.receipt,
        latest = raw.progress;
      check(
        [
          'contextToken',
          'mediaToken',
          'firstOperationId',
          'activationOperationId',
          'mediaOperationId',
        ].every((k) => historical[k] === latest[k]),
      );
      const r = readAdventureRestoreArchiveStatus(raw.receipt, identity);
      check(
        raw.receipt.lastOperationId === intent.operationId &&
          r.checkpoint === intent.expectedCheckpoint + 1 &&
          archive.checkpoint >= r.checkpoint &&
          ADVENTURE_RESTORE_ARCHIVE_PHASES.indexOf(archive.phase) >=
            ADVENTURE_RESTORE_ARCHIVE_PHASES.indexOf(r.phase) &&
          Object.keys(r.removed).every(
            (k) =>
              archive.removed[k as keyof typeof r.removed] >=
              r.removed[k as keyof typeof r.removed],
          ) &&
          (r.completedAt === null || r.completedAt === archive.completedAt),
      );
      return { kind: 'confirmed', action: intent.action, archive };
    }
    check(raw.kind === 'confirmed' && object(raw.receipt));
    const r = raw.receipt,
      job = jobReply(raw.progress);
    check(
      r.schemaVersion === 1 &&
        r.operationId === intent.operationId &&
        r.sequence === null &&
        r.expectedCheckpoint === intent.expectedCheckpoint &&
        r.checkpoint === intent.expectedCheckpoint + 1 &&
        job.checkpoint >= r.checkpoint,
    );
    if (job.checkpoint === r.checkpoint) {
      check(
        object(raw.progress) &&
          job.state === r.state &&
          adventureRestoreMetadataHash([r.validation ?? null, r.staging ?? null]) ===
            adventureRestoreMetadataHash([
              raw.progress.validation ?? null,
              raw.progress.staging ?? null,
            ]),
      );
    }
    if (intent.action === 'activateAdventureRestore') {
      if (r.action === 'retireAdventureRestoreActivation') {
        check(
          r.state === 'content-verified' &&
            object(r.staging) &&
            validAdventureStagingView(r.staging) &&
            r.staging.phase === 'audit-ready' &&
            !Object.hasOwn(r, 'activation'),
        );
        return { kind: 'retired', action: intent.action, job };
      }
      check(
        r.action === intent.action &&
          r.state === 'activated' &&
          job.state === 'activated' &&
          object(r.activation),
      );
      const a = r.activation;
      check(object(raw.progress) && object(raw.progress.activation));
      const actualActivation = raw.progress.activation;
      check(
        closed(a, [
          'schemaVersion',
          'operationId',
          'requestHash',
          'reviewToken',
          'sourceCheckpoint',
          'activatedAt',
          'mediaState',
        ]) &&
          a.schemaVersion === 1 &&
          a.operationId === intent.operationId &&
          a.sourceCheckpoint === intent.expectedCheckpoint &&
          a.reviewToken === intent.reviewToken &&
          a.requestHash === adventureRestoreEffectFingerprint(intent) &&
          count(a.activatedAt) &&
          a.activatedAt <= 8640000000000000 &&
          ['pending', 'none'].includes(a.mediaState as string) &&
          job.checkpoint === r.checkpoint &&
          Object.entries(a).every(([k, v]) => actualActivation[k] === v),
      );
    } else
      check(
        r.action === intent.action &&
          ['cancelling', 'cancelled'].includes(job.state) &&
          (intent.action === 'cancelAdventureRestore'
            ? r.state === 'cancelling'
            : ['cancelling', 'cancelled'].includes(r.state as string)),
      );
    return { kind: 'confirmed', action: intent.action, job };
  }
  async function execute(record: AdventureRestoreEffectRecord) {
    guard();
    let raw;
    try {
      raw = await api.mutate(record.intent.action, adventureRestoreEffectInput(record.intent));
    } catch (error) {
      guard();
      if (
        record.intent.action !== 'activateAdventureRestore' ||
        !conflict(error, 'activation-review-changed')
      )
        throw error;
      raw = await api.retireActivation(adventureRestoreEffectInput(record.intent));
    }
    guard();
    const ack = confirmed(raw, record.intent);
    await clear(record);
    guard();
    return ack;
  }
  async function begin(
    action: AdventureRestoreEffectAction,
    expectedCheckpoint: number,
    reviewToken: string | null = null,
  ) {
    const intent = readAdventureRestoreEffectIntent(
        {
          schemaVersion: 1,
          ...identity,
          action,
          operationId: operationId(),
          expectedCheckpoint,
          reviewToken,
        },
        identity,
      ),
      record = createAdventureRestoreEffectRecord(intent);
    guard();
    const ok = await storage.compare(identity.ownerId, identity.restoreId, null, record, guard);
    guard();
    check(ok);
    return execute(record);
  }
  return {
    pending,
    review: () =>
      unit(async () => {
        check((await pending()) === null);
        const job = await current();
        check(
          job.state === 'content-verified' &&
            job.staging?.phase === 'audit-ready' &&
            job.staging.libraryIncluded,
        );
        const raw = await api.review(scope);
        guard();
        const review = readAdventureRestoreActivationReview(raw, identity);
        check(review.checkpoint === job.checkpoint);
        return review;
      }),
    activate: (value: AdventureRestoreActivationReview) => {
      // Snapshot the displayed consent before any asynchronous work.
      const review = readAdventureRestoreActivationReview(value, identity);
      return unit(async () => {
        check((await pending()) === null);
        const job = await current();
        check(
          job.state === 'content-verified' &&
            job.staging?.phase === 'audit-ready' &&
            job.staging.libraryIncluded &&
            job.checkpoint === review.checkpoint,
        );
        return begin('activateAdventureRestore', review.checkpoint, review.reviewToken);
      });
    },
    resume: () =>
      unit(async () => {
        const r = await pending();
        return r ? execute(r) : { kind: 'idle' as const };
      }),
    cancel: () =>
      unit(async () => {
        check((await pending()) === null);
        const job = await current();
        check(job.state !== 'activated');
        if (job.state === 'cancelling' || job.state === 'cancelled')
          return { kind: job.state, job };
        return begin('cancelAdventureRestore', job.checkpoint);
      }),
    advance: () =>
      unit(async () => {
        const r = await pending();
        if (r) return execute(r);
        const job = await current();
        if (job.state === 'cancelled') return { kind: 'cancelled' as const, job };
        if (job.state === 'cancelling')
          return begin('advanceAdventureRestoreCleanup', job.checkpoint);
        if (job.state !== 'activated') return { kind: 'needs-review' as const, job };
        const rawMedia = await api.media(scope);
        guard();
        const media = mediaReply(rawMedia);
        if (!media.complete) return begin('advanceAdventureRestoreMedia', media.checkpoint);
        const rawArchive = await api.archive(scope);
        guard();
        const archive = archiveReply(rawArchive);
        if (archive.phase === 'done') return { kind: 'complete' as const, job, media, archive };
        check(archive.phase !== 'waiting-for-media');
        return begin('advanceAdventureRestoreArchiveCleanup', archive.checkpoint);
      }),
    reconcile: () =>
      unit(async () => {
        const record = await pending();
        if (!record) return { kind: 'idle' as const };
        const i = record.intent;
        if (
          [
            'activateAdventureRestore',
            'cancelAdventureRestore',
            'advanceAdventureRestoreCleanup',
          ].includes(i.action)
        ) {
          const raw = await api.resolve({
            ...scope,
            operationId: i.operationId,
            requestHash: adventureRestoreEffectFingerprint(i),
          });
          guard();
          check(object(raw) && raw.schemaVersion === 1);
          if (raw.kind === 'confirmed') {
            const ack = confirmed(raw, i);
            await clear(record);
            return ack;
          }
          check(raw.kind === 'unresolved');
          const job = jobReply(raw.progress);
          if (job.checkpoint > i.expectedCheckpoint) {
            await clear(record);
            return { kind: 'superseded' as const, action: i.action, job };
          }
          check(job.checkpoint === i.expectedCheckpoint);
          return { kind: 'unconfirmed' as const, action: i.action };
        }
        const mediaAction = i.action === 'advanceAdventureRestoreMedia';
        const raw = await (mediaAction ? api.media(scope) : api.archive(scope));
        guard();
        const progress = mediaAction ? mediaReply(raw) : archiveReply(raw);
        if (progress.checkpoint <= i.expectedCheckpoint)
          return { kind: 'unconfirmed' as const, action: i.action };
        try {
          return await execute(record);
        } catch (error) {
          guard();
          if (
            !conflict(
              error,
              mediaAction ? 'media-checkpoint-conflict' : 'archive-checkpoint-conflict',
            )
          )
            throw error;
          const latestRaw = await (mediaAction ? api.media(scope) : api.archive(scope));
          guard();
          const latest = mediaAction ? mediaReply(latestRaw) : archiveReply(latestRaw);
          check(
            latest.checkpoint > i.expectedCheckpoint && latest.checkpoint >= progress.checkpoint,
          );
          await clear(record);
          return { kind: 'superseded' as const, action: i.action };
        }
      }),
  };
}
