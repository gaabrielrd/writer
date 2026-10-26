import type { BookRestoreIdentity } from '../model/bookRestorePreparation';
import type {
  BookRestoreEffectAction,
  BookRestoreEffectIntent,
  BookRestoreEffectRecord,
} from '../model/bookRestoreEffects';
import {
  readBookRestoreIdentity,
  restorePreparationCheck as check,
} from './bookRestorePreparationContracts';
import { createBookRestoreStartSession } from './bookRestoreStartSession';
import { readBookRestoreTransferJob, type BookRestoreTransferJob } from './bookRestoreTransferJob';
import {
  readBookRestoreEffectIntent,
  readBookRestoreEffectRecord,
  createBookRestoreEffectRecord,
  bookRestoreEffectInput,
  bookRestoreEffectFingerprint,
} from './bookRestoreEffectContracts';
import {
  readStoredBookRestoreEffect,
  compareStoredBookRestoreEffect,
} from './bookRestoreEffectStore';
import { bookRestoreEffectApi, type BookRestoreEffectApi } from './bookRestoreEffectCallables';
import {
  readBookRestoreActivationReview,
  readBookRestoreMediaStatus,
  readBookRestoreArchiveStatus,
  restoreViewObject as object,
  restoreViewCount as count,
  type BookRestoreActivationReview,
  type BookRestoreMediaStatus,
  type BookRestoreArchiveStatus,
} from './bookRestoreFinalizationViews';
type Store = {
  read: typeof readStoredBookRestoreEffect;
  compare: typeof compareStoredBookRestoreEffect;
};
export type BookRestoreEffectAck = {
  kind: 'confirmed' | 'already-complete' | 'retired';
  action: BookRestoreEffectAction;
  job?: BookRestoreTransferJob;
  media?: BookRestoreMediaStatus;
  archive?: BookRestoreArchiveStatus;
};
export function createBookRestoreEffectSession(options: {
  identity: BookRestoreIdentity;
  check: () => void;
  api?: BookRestoreEffectApi;
  storage?: Store;
  getJob?: () => Promise<BookRestoreTransferJob>;
  operationId?: () => string;
}) {
  const identity = Object.freeze(readBookRestoreIdentity(options.identity)),
    { check: guard, api = bookRestoreEffectApi, operationId = () => crypto.randomUUID() } = options,
    storage = options.storage ?? {
      read: readStoredBookRestoreEffect,
      compare: compareStoredBookRestoreEffect,
    },
    jobs = createBookRestoreStartSession({ ownerId: identity.ownerId, check: guard }),
    getter = options.getJob ?? (() => jobs.get(identity)),
    scope = { restoreId: identity.restoreId, jobToken: identity.jobToken };
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
  function bind(job: BookRestoreTransferJob) {
    check(
      job.ownerId === identity.ownerId &&
        job.restoreId === identity.restoreId &&
        job.jobToken === identity.jobToken &&
        job.bookId === identity.bookId,
    );
    return job;
  }
  async function current() {
    guard();
    const job = await getter();
    guard();
    return bind(job);
  }
  async function pending() {
    guard();
    const raw = await storage.read(identity.ownerId, identity.restoreId, guard);
    guard();
    if (raw === null) return null;
    const record = readBookRestoreEffectRecord(raw, identity.ownerId, identity.restoreId);
    readBookRestoreEffectIntent(record.intent, identity);
    return record;
  }
  async function clear(record: BookRestoreEffectRecord) {
    guard();
    const saved = await storage.compare(identity.ownerId, identity.restoreId, record, null, guard);
    guard();
    check(saved);
  }
  function jobReply(raw: unknown) {
    return bind(readBookRestoreTransferJob(raw, identity.ownerId, identity));
  }
  function confirmed(raw: unknown, intent: BookRestoreEffectIntent): BookRestoreEffectAck {
    check(object(raw) && raw.schemaVersion === 1);
    if (intent.action === 'finalizeBookRestoreMedia') {
      check(raw.kind === 'confirmed' || raw.kind === 'already-complete');
      const media = readBookRestoreMediaStatus(raw);
      check(media.state !== 'pending' && object(raw.receipt));
      if (raw.kind === 'confirmed') check(raw.receipt.operationId === intent.operationId);
      return { kind: raw.kind, action: intent.action, media };
    }
    if (intent.action === 'advanceBookRestoreArchiveCleanup') {
      check(raw.kind === 'confirmed' || raw.kind === 'already-complete');
      const archive = readBookRestoreArchiveStatus(raw.progress, identity);
      if (raw.kind === 'already-complete') check(archive.phase === 'done' && raw.receipt === null);
      else {
        const receipt = readBookRestoreArchiveStatus(raw.receipt, identity);
        check(
          object(raw.receipt) &&
            raw.receipt.lastOperationId === intent.operationId &&
            receipt.revision === intent.expectedRevision! + 1 &&
            archive.revision >= receipt.revision,
        );
      }
      return { kind: raw.kind, action: intent.action, archive };
    }
    check(raw.kind === 'confirmed' && object(raw.receipt));
    const r = raw.receipt;
    if (intent.action === 'activateBookRestore' && r.action === 'retireBookRestoreActivation') {
      check(
        r.schemaVersion === 1 &&
          r.operationId === intent.operationId &&
          r.expectedCheckpoint === intent.expectedCheckpoint &&
          r.checkpoint === intent.expectedCheckpoint! + 1 &&
          r.state === 'content-verified' &&
          object(r.preparation) &&
          r.preparation.schemaVersion === 13 &&
          r.preparation.phase === 'activation-ready' &&
          object(r.preparation.audit) &&
          r.preparation.audit.sealOperationId === intent.operationId &&
          !Object.hasOwn(r, 'activation'),
      );
      const job = jobReply(raw.progress);
      check(job.checkpoint >= r.checkpoint);
      return { kind: 'retired', action: intent.action, job };
    }
    check(
      r.schemaVersion === 1 &&
        r.operationId === intent.operationId &&
        r.action === intent.action &&
        r.expectedCheckpoint === intent.expectedCheckpoint &&
        r.checkpoint === intent.expectedCheckpoint! + 1,
    );
    const job = jobReply(raw.progress);
    check(job.checkpoint >= r.checkpoint);
    if (intent.action === 'activateBookRestore') {
      check(
        job.state === 'activated' &&
          object(r.activation) &&
          r.activation.schemaVersion === 1 &&
          r.activation.operationId === intent.operationId &&
          r.activation.reviewToken === intent.reviewToken &&
          r.activation.sourceCheckpoint === intent.expectedCheckpoint &&
          r.activation.requestHash === bookRestoreEffectFingerprint(intent) &&
          count(r.activation.activatedAt) &&
          Number.isFinite(new Date(r.activation.activatedAt).getTime()),
      );
    } else
      check(
        ['cancelling', 'cancelled'].includes(job.state) &&
          (intent.action === 'cancelBookRestore'
            ? r.state === 'cancelling'
            : ['cancelling', 'cancelled'].includes(r.state as string)),
      );
    return { kind: 'confirmed', action: intent.action, job };
  }
  async function execute(record: BookRestoreEffectRecord): Promise<BookRestoreEffectAck> {
    guard();
    let raw;
    try {
      raw = await api.mutate(record.intent.action, bookRestoreEffectInput(record.intent));
    } catch (error) {
      guard();
      const e = error as { code?: string; details?: { reason?: string } };
      if (
        record.intent.action !== 'activateBookRestore' ||
        !['failed-precondition', 'functions/failed-precondition'].includes(e?.code ?? '') ||
        e?.details?.reason !== 'activation-review-changed'
      )
        throw error;
      // The original ID arbitrates retirement against any in-flight activation.
      raw = await api.retireActivation(bookRestoreEffectInput(record.intent));
    }
    guard();
    const ack = confirmed(raw, record.intent);
    await clear(record);
    guard();
    return ack;
  }
  async function begin(
    action: BookRestoreEffectAction,
    values: {
      expectedCheckpoint?: number;
      expectedRevision?: number;
      reviewToken?: string;
    } = {},
  ) {
    const intent = readBookRestoreEffectIntent(
        {
          schemaVersion: 1,
          ...identity,
          action,
          operationId: operationId(),
          expectedCheckpoint: values.expectedCheckpoint ?? null,
          expectedRevision: values.expectedRevision ?? null,
          reviewToken: values.reviewToken ?? null,
        },
        identity,
      ),
      record = createBookRestoreEffectRecord(intent);
    guard();
    const saved = await storage.compare(identity.ownerId, identity.restoreId, null, record, guard);
    guard();
    check(saved);
    return execute(record);
  }
  return {
    pending,
    review: () =>
      unit(async () => {
        check((await pending()) === null);
        const job = await current();
        check(job.state === 'content-verified' && job.preparation?.phase === 'activation-ready');
        const raw = await api.review(scope);
        guard();
        const review = readBookRestoreActivationReview(raw, identity);
        check(review.checkpoint === job.checkpoint);
        return review;
      }),
    activate: (value: BookRestoreActivationReview) =>
      unit(async () => {
        const review = readBookRestoreActivationReview(value, identity);
        check((await pending()) === null);
        const job = await current();
        check(
          job.state === 'content-verified' &&
            job.preparation?.phase === 'activation-ready' &&
            job.checkpoint === review.checkpoint,
        );
        return begin('activateBookRestore', {
          expectedCheckpoint: review.checkpoint,
          reviewToken: review.reviewToken,
        });
      }),
    resume: () =>
      unit(async () => {
        const record = await pending();
        return record ? execute(record) : { kind: 'idle' as const };
      }),
    cancel: () =>
      unit(async () => {
        check((await pending()) === null);
        const job = await current();
        check(job.state !== 'activated');
        if (job.state === 'cancelling' || job.state === 'cancelled')
          return { kind: job.state, job };
        return begin('cancelBookRestore', { expectedCheckpoint: job.checkpoint });
      }),
    advance: () =>
      unit(async () => {
        const record = await pending();
        if (record) return execute(record);
        const job = await current();
        if (job.state === 'cancelled') return { kind: 'cancelled' as const, job };
        if (job.state === 'cancelling')
          return begin('advanceBookRestoreCleanup', { expectedCheckpoint: job.checkpoint });
        if (job.state !== 'activated') return { kind: 'needs-review' as const, job };
        const rawMedia = await api.media(scope);
        guard();
        const media = readBookRestoreMediaStatus(rawMedia);
        if (media.state === 'pending') return begin('finalizeBookRestoreMedia');
        const rawArchive = await api.archive(scope);
        guard();
        check(object(rawArchive) && rawArchive.schemaVersion === 1);
        const archive = readBookRestoreArchiveStatus(rawArchive.progress, identity);
        if (archive.phase === 'done') return { kind: 'complete' as const, job, media, archive };
        check(archive.phase !== 'waiting-for-media');
        return begin('advanceBookRestoreArchiveCleanup', { expectedRevision: archive.revision });
      }),
    reconcile: () =>
      unit(async () => {
        const record = await pending();
        if (!record) return { kind: 'idle' as const };
        const intent = record.intent;
        if (
          ['activateBookRestore', 'cancelBookRestore', 'advanceBookRestoreCleanup'].includes(
            intent.action,
          )
        ) {
          const raw = await api.resolve({
            ...scope,
            operationId: intent.operationId,
            requestHash: bookRestoreEffectFingerprint(intent),
          });
          guard();
          check(object(raw) && raw.schemaVersion === 1);
          if (raw.kind === 'confirmed') {
            const ack = confirmed(raw, intent);
            await clear(record);
            return ack;
          }
          check(raw.kind === 'unknown');
          const job = jobReply(raw.progress);
          if (job.checkpoint > intent.expectedCheckpoint!) {
            await clear(record);
            return { kind: 'superseded' as const, action: intent.action, job };
          }
          return { kind: 'unconfirmed' as const, action: intent.action };
        }
        if (intent.action === 'finalizeBookRestoreMedia') {
          const raw = await api.media(scope);
          guard();
          if (readBookRestoreMediaStatus(raw).state === 'pending')
            return { kind: 'unconfirmed' as const, action: intent.action };
          return execute(record);
        }
        const raw = await api.archive(scope);
        guard();
        check(object(raw) && raw.schemaVersion === 1);
        const archive = readBookRestoreArchiveStatus(raw.progress, identity);
        if (archive.phase === 'done') return execute(record);
        if (archive.revision <= intent.expectedRevision!)
          return { kind: 'unconfirmed' as const, action: intent.action };
        try {
          return await execute(record);
        } catch (error) {
          const e = error as { code?: string; details?: { reason?: string } };
          if (
            !['failed-precondition', 'functions/failed-precondition'].includes(e.code ?? '') ||
            e.details?.reason !== 'archive-revision-conflict'
          )
            throw error;
          const latest = await api.archive(scope);
          guard();
          check(object(latest) && latest.schemaVersion === 1);
          const progress = readBookRestoreArchiveStatus(latest.progress, identity);
          check(progress.revision > intent.expectedRevision!);
          await clear(record);
          return { kind: 'superseded' as const, action: intent.action, archive: progress };
        }
      }),
  };
}
