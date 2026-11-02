import { readObject, readHash } from './bookLoreReadContracts';
import { loreControlProgress, loreControlUnitId } from './bookLoreControlContracts';
import {
  visibilityScope,
  visibilityFail,
  type VisibilityState,
  type VisibilityRef,
} from './bookLoreVisibilitySelectionContracts';
import type { VisibilitySelectionStore } from './bookLoreVisibilitySelectionDb';
import type { BookLoreEditOutcomeRequest, BookLoreEditOutcome } from './bookLoreEditOutcome';
type Entry = Awaited<ReturnType<VisibilitySelectionStore['member']>>;
export interface VisibilityNative {
  call(this: void, method: string, input: unknown): Promise<unknown>;
  outcome(this: void, input: BookLoreEditOutcomeRequest): Promise<BookLoreEditOutcome | null>;
}
export const visibilityReadWire = (kind: 'inspection' | 'upload' | 'edit', ref: VisibilityRef) => ({
  [kind === 'inspection' ? 'inspectionId' : kind === 'upload' ? 'uploadId' : 'editId']: ref.id,
  startHash: ref.startHash,
  ...(ref.seen && ref.jobToken ? { jobToken: ref.jobToken } : {}),
});
export function visibilityOutcomeRequest(entry: Entry): BookLoreEditOutcomeRequest {
  const { root, member, state } = entry,
    scope = visibilityScope(root, member),
    edit = state.edit;
  if (!edit) visibilityFail();
  return {
    writeId: member.writeId,
    bookId: scope.bookId,
    loreId: member.loreId,
    sourceToken: member.sourceToken,
    editId: edit.id,
    startHash: edit.startHash,
    ...(edit.seen && edit.jobToken ? { jobToken: edit.jobToken } : {}),
    ...(state.outcome?.outcomeToken ? { outcomeToken: state.outcome.outcomeToken } : {}),
  };
}
export async function queryVisibilityApplied(entry: Entry, native: VisibilityNative) {
  if (!entry.state.edit) return null;
  const proof = await native.outcome(visibilityOutcomeRequest(entry));
  if (!proof) {
    if (entry.state.edit.seen) visibilityFail();
    return null;
  }
  if (!proof.applied) return proof;
  readHash(proof.jobToken);
  readHash(proof.outcomeToken);
  if (
    proof.changedFields.length !== 1 ||
    proof.changedFields[0] !== 'isPublic' ||
    proof.relationsChanged ||
    proof.adoption?.privacy.after.present !== true ||
    proof.adoption.privacy.after.value !== entry.root.manifest.value
  )
    visibilityFail();
  return proof;
}
async function progress(
  native: VisibilityNative,
  kind: 'inspection' | 'upload' | 'edit',
  ref: VisibilityRef,
) {
  const method =
      kind === 'inspection'
        ? 'getBookLoreSourceInspection'
        : kind === 'upload'
          ? 'getBookLoreFieldUpload'
          : 'getBookLoreEditReservation',
    raw = await native.call(method, visibilityReadWire(kind, ref));
  if (raw === null) {
    if (ref.seen) visibilityFail();
    return null;
  }
  return loreControlProgress(raw, kind, ref, ref.seen ? ref.jobToken : undefined);
}
export async function closeVisibilityMember(
  entry: Entry,
  native: VisibilityNative,
  save: (patch: Partial<VisibilityState>) => Promise<void>,
) {
  // Every pass checks for a possible original acceptance before cleaning.
  const accepted = await queryVisibilityApplied(entry, native);
  if (accepted?.applied) return { accepted, complete: false };
  if (accepted && entry.state.edit && !entry.state.edit.seen) {
    await save({ edit: { ...entry.state.edit, seen: true, jobToken: accepted.jobToken } });
    return { accepted: null, complete: false };
  }
  const scope = visibilityScope(entry.root, entry.member);
  for (const kind of ['inspection', 'edit', 'upload'] as const) {
    const ref = entry.state[kind];
    if (!ref) continue;
    const p = await progress(native, kind, ref);
    if (p && (!ref.seen || ref.jobToken !== p.jobToken)) {
      await save({ [kind]: { ...ref, seen: true, jobToken: p.jobToken } });
      return { accepted: null, complete: false };
    }
    const closed =
      kind === 'inspection' ? 'inspectionClosed' : kind === 'edit' ? 'editClosed' : 'uploadClosed';
    if (p?.phase === 'adopted') {
      const proof = await queryVisibilityApplied(entry, native);
      if (!proof?.applied) visibilityFail();
      return { accepted: proof, complete: false };
    }
    if (p?.phase === 'cancelled') {
      if (!entry.state[closed]) {
        await save({ [closed]: true });
        return { accepted: null, complete: false };
      }
      continue;
    }
    const cleaning = p?.phase === 'cancelling';
    if (cleaning && 'blockedReason' in p && p.blockedReason)
      throw Error('A limpeza aguarda o inventário do livro: ' + String(p.blockedReason));
    const method =
        kind === 'inspection'
          ? 'cancelBookLoreSourceInspection'
          : kind === 'edit'
            ? cleaning
              ? 'advanceBookLoreEditReservationCleanup'
              : 'cancelBookLoreEditReservation'
            : cleaning
              ? 'advanceBookLoreFieldCleanup'
              : 'cancelBookLoreFieldUpload',
      input = {
        ...visibilityReadWire(kind, ref),
        operationId: loreControlUnitId(scope, 'visibility-' + method, ref.id, p?.revision ?? null),
        ...(cleaning ? { expectedRevision: p.revision, jobToken: p.jobToken } : {}),
      };
    const raw = await native.call(method, input),
      envelope = readObject(raw, ['receipt', 'progress']),
      next = loreControlProgress(envelope.progress, kind, ref, ref.seen ? ref.jobToken : undefined);
    await save({
      [kind]: { ...ref, seen: true, jobToken: next.jobToken },
      [closed]: next.phase === 'cancelled',
    });
    return { accepted: null, complete: false };
  }
  return { accepted: null, complete: true };
}
export async function verifyVisibilityClosed(entry: Entry, native: VisibilityNative) {
  if (await queryVisibilityApplied(entry, native).then((p) => p?.applied)) visibilityFail();
  for (const kind of ['inspection', 'edit', 'upload'] as const) {
    const ref = entry.state[kind];
    if (!ref) continue;
    const p = await progress(native, kind, ref);
    if (p?.phase !== 'cancelled') visibilityFail();
  }
}
