import * as rpc from './adventureImportCallables';
import { getAdventureImportRecoveryKey } from './adventureImportKeyClient';
import {
  validateProtectedReviewSnapshot,
  sameLocalAdventureImport,
  compareLocalAdventureImport,
  readLocalAdventureImport,
  newImportRecord,
  nextImportRecord,
  importJournal,
  sealAdventureImportReview,
  openAdventureImportReview,
} from './adventureImportRecovery';
import {
  describeConfirmedReview,
  importDigest,
  importCheck,
  validateImportOutcome,
  validateImportProgress,
  validateImportKey,
  importObject,
  IMPORT_ENVELOPE_LIMIT,
  bytes,
  canonicalImport,
} from './adventureImportContracts';
import type {
  ConfirmedReview,
  ImportProgress,
  LocalImportRecord,
  ImportMutationInput,
  ImportAction,
  ImportJournal,
  ImportConfirmed,
  AppendImportInput,
  ImportPage,
} from '../model/adventureImport';
export function createAdventureImportSession(
  uid: string,
  check: () => void,
  onProgress: (p: ImportProgress) => void,
) {
  let memory: ConfirmedReview | null = null;
  function publish(p: ImportProgress) {
    check();
    onProgress(p);
    return p;
  }
  async function read(id: string) {
    check();
    const r = await readLocalAdventureImport(uid, id);
    check();
    return r;
  }
  async function change(
    id: string,
    current: LocalImportRecord | null,
    next: LocalImportRecord | null,
  ) {
    const saved = await compareLocalAdventureImport(uid, id, current, next, check);
    check();
    return saved;
  }
  async function ensure(id: string) {
    const r = await read(id);
    return r ?? (await change(id, null, newImportRecord(uid, id)))!;
  }
  async function get(id: string, token?: string) {
    check();
    const p = validateImportProgress(
      await rpc.getAdventureImport({ importId: id, ...(token ? { jobToken: token } : {}) }),
      uid,
    );
    check();
    importCheck(p.importId === id && (!token || p.jobToken === token));
    return publish(p);
  }
  async function clear(id: string, record: LocalImportRecord) {
    await change(id, record, nextImportRecord(record, { journal: null }));
  }
  function bindLocal(record: LocalImportRecord | null, progress: ImportProgress): void {
    if (!record) return;
    importCheck(record.ownerId === progress.ownerId && record.importId === progress.importId);
    if (record.journal?.jobToken) importCheck(record.journal.jobToken === progress.jobToken);
    if (record.snapshot) {
      try {
        validateProtectedReviewSnapshot(record.snapshot, uid, progress.importId);
      } catch {
        // Corrupt ciphertext is retained, and never used as identity or authorization.
        return;
      }
      importCheck(
        record.snapshot.jobToken === progress.jobToken &&
          record.snapshot.reviewHash === progress.reviewHash &&
          record.snapshot.keyId === progress.keyId,
      );
    }
  }
  async function finish(p: ImportProgress) {
    const r = await read(p.importId);
    if (r) {
      if (r.journal?.jobToken) importCheck(r.journal.jobToken === p.jobToken);
      if (r.snapshot) {
        try {
          validateProtectedReviewSnapshot(r.snapshot, uid, p.importId);
        } catch {
          return publish(p);
        }
        importCheck(
          r.snapshot.jobToken === p.jobToken &&
            r.snapshot.reviewHash === p.reviewHash &&
            r.snapshot.keyId === p.keyId,
        );
      }
      await change(p.importId, r, null);
    }
    return publish(p);
  }
  function definitive(cause: unknown) {
    const e = cause as { code?: string; details?: { reason?: string } };
    return (
      [
        'checkpoint-conflict',
        'state-conflict',
        'review-mismatch',
        'key-mismatch',
        'universe-unavailable',
        'payload-too-large',
        'invalid-input',
        'operation-mismatch',
      ].includes(e?.details?.reason ?? '') &&
      ['failed-precondition', 'invalid-argument'].includes((e.code ?? '').replace('functions/', ''))
    );
  }
  async function frozenReview(p: ImportProgress): Promise<ConfirmedReview> {
    check();
    let record = await ensure(p.importId);
    bindLocal(record, p);
    if (record.snapshot) {
      validateProtectedReviewSnapshot(record.snapshot, uid, p.importId);
      const s = record.snapshot;
      importCheck(
        s.jobToken === p.jobToken && s.reviewHash === p.reviewHash && s.keyId === p.keyId,
      );
      const input = {
        importId: p.importId,
        jobToken: p.jobToken,
        reviewHash: p.reviewHash,
        expectedKeyId: s.keyId,
      };
      const key = validateImportKey(await getAdventureImportRecoveryKey(input), uid, input);
      check();
      importCheck(sameLocalAdventureImport(await read(p.importId), record));
      const review = await openAdventureImportReview(s, key);
      check();
      importCheck(sameLocalAdventureImport(await read(p.importId), record));
      return review;
    }
    if (!memory)
      throw new Error(
        'Esta preparação ainda não tem cópia protegida neste dispositivo. Cancele ou reconstrua e confirme a mesma revisão.',
      );
    const described = await describeConfirmedReview(memory, p.importId);
    check();
    importCheck(described.start.reviewHash === p.reviewHash);
    const input = { importId: p.importId, jobToken: p.jobToken, reviewHash: p.reviewHash };
    const key = validateImportKey(await getAdventureImportRecoveryKey(input), uid, input);
    check();
    importCheck(key.keyId === p.keyId && sameLocalAdventureImport(await read(p.importId), record));
    publish({ ...p, recoveryKeyReady: true });
    const snapshot = await sealAdventureImportReview(described.review, key);
    check();
    record = (await change(p.importId, record, nextImportRecord(record, { snapshot })))!;
    importCheck(record.snapshot);
    return described.review;
  }
  async function execute(
    p: ImportProgress,
    action: Exclude<ImportAction, 'startAdventureImport'>,
    review?: ConfirmedReview,
    pending?: ImportJournal,
  ): Promise<ImportProgress> {
    check();
    let record = await ensure(p.importId);
    bindLocal(record, p);
    const id = p.importId;
    const operationId = pending?.operationId ?? crypto.randomUUID(),
      expectedCheckpoint = pending?.expectedCheckpoint ?? p.checkpoint;
    importCheck(expectedCheckpoint !== null);
    const base: ImportMutationInput = {
      importId: id,
      jobToken: p.jobToken,
      operationId,
      expectedCheckpoint,
    };
    let request: ImportMutationInput | AppendImportInput = base;
    if (action === 'appendAdventureImportSection') {
      const index = pending?.index ?? p.uploadedSections;
      importCheck(review && index !== null && review.sections[index]);
      request = { ...base, index, section: review.sections[index] };
      if (bytes(canonicalImport(request)) > IMPORT_ENVELOPE_LIMIT)
        throw new Error(
          'Esta seção excede o limite do pedido. Cancele e divida a revisão antes de importar.',
        );
      importCheck(record.snapshot?.reviewHash === p.reviewHash);
    }
    const fingerprint = await importDigest({ action, request });
    check();
    if (pending) {
      importCheck(pending.fingerprint === fingerprint && record.journal?.stamp === pending.stamp);
      record = (await change(id, record, nextImportRecord(record, { journal: pending })))!;
    } else {
      importCheck(!record.journal);
      record = (await change(
        id,
        record,
        nextImportRecord(record, {
          journal: importJournal(
            uid,
            id,
            action,
            operationId,
            fingerprint,
            p.jobToken,
            expectedCheckpoint,
            'index' in request ? request.index : null,
          ),
        }),
      ))!;
    }
    try {
      check();
      const raw =
        action === 'appendAdventureImportSection'
          ? await rpc.appendAdventureImportSection(request as AppendImportInput)
          : action === 'advanceAdventureImport'
            ? await rpc.advanceAdventureImport(base)
            : action === 'activateAdventureImport'
              ? await rpc.activateAdventureImport(base)
              : await rpc.cancelAdventureImport(base);
      check();
      const result = validateImportOutcome(raw, uid, action, operationId, id) as ImportConfirmed;
      importCheck(
        result.progress.jobToken === p.jobToken &&
          result.progress.reviewHash === p.reviewHash &&
          result.receipt.expectedCheckpoint === expectedCheckpoint,
      );
      if (action === 'appendAdventureImportSection')
        importCheck('index' in request && result.receipt.index === request.index);
      await clear(id, record);
      return publish(result.progress);
    } catch (cause) {
      check();
      if (definitive(cause)) {
        await clear(id, record);
      }
      throw cause;
    }
  }
  async function verify(id: string): Promise<ImportProgress | null> {
    let record = await read(id);
    const pending = record?.journal;
    if (pending?.action === 'startAdventureImport') {
      const raw = await rpc.resolveAdventureImportStart({
        operationId: pending.operationId,
        requestHash: pending.fingerprint,
        intent: 'cancel',
      });
      check();
      const result = validateImportOutcome(
        raw,
        uid,
        'startAdventureImport',
        pending.operationId,
        id,
      );
      if (result.kind === 'canceled') {
        await change(id, record, null);
        return null;
      }
      bindLocal(record, result.progress);
      await clear(id, record!);
      return publish(result.progress);
    }
    let p = await get(id);
    bindLocal(record, p);
    if (['activated', 'deleted'].includes(p.state)) return finish(p);
    if (p.state === 'deleting') {
      if (
        record?.journal &&
        record.journal.action !== 'cancelAdventureImport' &&
        record.journal.action !== 'advanceAdventureImport'
      ) {
        await clear(id, record);
        record = await read(id);
      }
    }
    const j = record?.journal;
    if (j) {
      const review =
        j.action === 'appendAdventureImportSection' ? await frozenReview(p) : undefined;
      p = await execute(p, j.action as Exclude<ImportAction, 'startAdventureImport'>, review, j);
    }
    return p;
  }
  async function run(id: string): Promise<ImportProgress | null> {
    let p = await verify(id);
    if (!p) return null;
    let review: ConfirmedReview | undefined;
    while (!['activated', 'deleted'].includes(p.state)) {
      check();
      if (p.state === 'uploading') {
        review ??= await frozenReview(p);
        p = await execute(p, 'appendAdventureImportSection', review);
      } else if (p.state === 'preparing' || p.state === 'deleting')
        p = await execute(p, 'advanceAdventureImport');
      else p = await execute(p, 'activateAdventureImport');
    }
    return finish(p);
  }
  async function start(
    review: ConfirmedReview,
    id: string = crypto.randomUUID(),
  ): Promise<ImportProgress | null> {
    const described = await describeConfirmedReview(review, id);
    check();
    memory = described.review;
    let record = await ensure(id);
    importCheck(!record.journal && !record.snapshot);
    record = (await change(
      id,
      record,
      nextImportRecord(record, {
        journal: importJournal(uid, id, 'startAdventureImport', id, described.fingerprint),
      }),
    ))!;
    const raw = await rpc.startAdventureImport(described.start);
    check();
    const result = validateImportOutcome(raw, uid, 'startAdventureImport', id, id);
    if (result.kind === 'canceled') {
      await change(id, record, null);
      return null;
    }
    importCheck(
      result.progress.reviewHash === described.start.reviewHash &&
        result.progress.sectionCount === review.sections.length,
    );
    bindLocal(record, result.progress);
    await clear(id, record);
    publish(result.progress);
    await frozenReview(result.progress);
    check();
    return run(id);
  }
  async function cancel(id: string): Promise<ImportProgress | null> {
    let record = await read(id);
    if (record?.journal?.action === 'startAdventureImport') {
      const known = await verify(id);
      if (!known) return null;
      record = await read(id);
    }
    let p = await get(id);
    bindLocal(record, p);
    if (['activated', 'deleted'].includes(p.state)) return finish(p);
    if (p.state === 'deleting' && record?.journal) {
      const confirmed = await verify(id);
      if (!confirmed) return null;
      p = confirmed;
    }
    if (p.state !== 'deleting' && !['deleted', 'activated'].includes(p.state)) {
      if (record?.journal) await clear(id, record);
      p = await execute(p, 'cancelAdventureImport');
    }
    while (p.state === 'deleting') {
      check();
      p = await execute(p, 'advanceAdventureImport');
    }
    return finish(p);
  }
  async function reconstruct(id: string, review: ConfirmedReview) {
    const p = await get(id);
    const described = await describeConfirmedReview(review, id);
    check();
    importCheck(described.start.reviewHash === p.reviewHash);
    memory = described.review;
    return run(id);
  }
  return { start, run, verify, cancel, get, reconstruct };
}
export async function listValidatedAdventureImports(
  uid: string,
  cursor: string | null = null,
): Promise<ImportPage> {
  const page = await rpc.listAdventureImports({ view: 'pending', limit: 25, cursor });
  importObject(page, ['items', 'nextCursor']);
  importCheck(
    Array.isArray(page.items) &&
      page.items.length <= 25 &&
      (page.nextCursor === null ||
        (typeof page.nextCursor === 'string' && page.nextCursor.length <= 4096)),
  );
  page.items.forEach((p) => validateImportProgress(p, uid));
  return page;
}
