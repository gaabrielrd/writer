import { createLiteraryReferenceReader } from './literaryReferences.mjs';
import { readLiteraryPlanSourceViews } from './literaryPlanning.mjs';
import { digest, workScope, readWorkMetadata } from './workProgressContracts.mjs';
import { integer, inconsistent, bornEqual } from './bookRestoreUploadContracts.mjs';
import { readBookEditorialHistoryOrigin, assertEditorialImmutableBefore } from './bookEditorialHistoryOrigin.mjs';
import { editorialBirth } from './bookRestoreEditorialBodyContracts.mjs';
import { nativeRestoreToken } from './bookRestoreIntegrityRead.mjs';
import { readBookEditorialHistoryItem } from './bookEditorialHistoryRead.mjs';
import { readOriginalEditorialReview, readEditorialReviewResolution, reviewAcknowledgementView } from './bookEditorialRestoreReviewStore.mjs';
const at = (bookId, collection, id) => 'books/' + bookId + '/' + collection + '/' + id;
export async function readBookEditorialRestoreReviewState(tx, dependencies, uid, request, includeSources = false) {
  const { db } = dependencies;
        const proof = await readBookEditorialHistoryOrigin(tx, dependencies, uid, request.bookId);
        const original = await readOriginalEditorialReview(tx, db, proof, request.id);
        const { snapshot, value } = original;
        const source = await readBookEditorialHistoryItem(tx, dependencies, uid, request.bookId, value.sourceArtifactId);
        if (source.value.artifact?.kind !== value.kind) inconsistent();
        const current = await tx.get(db.doc(at(request.bookId,
          value.kind === 'contract' ? 'literaryProduction' : 'literaryPlans', value.kind === 'contract' ? 'current' : request.id)));
        const saved = current.data();
        let native = null;
        if (current.exists) {
          integer(saved.revision, 1);
          const content = value.kind === 'contract' ? saved.contract : saved.plan;
          if (!content || typeof content !== 'object') inconsistent();
          native = { revision: saved.revision, contentHash: digest(content) };
        }
        // The immutable first version records the original native head birth.
        const originalVersion = await tx.get(db.doc(at(request.bookId,
          value.kind === 'contract' ? 'literaryContractVersions' : 'literaryPlanVersions',
          value.kind === 'contract' ? '1' : digest({ id: request.id, revision: 1 }))));
        if (originalVersion.exists) {
          assertEditorialImmutableBefore(originalVersion, proof.seal);
          const original = originalVersion.data();
          if (original.revision !== 1 || digest(value.kind === 'contract' ? original.contract : original.plan) !== value.nativeContentHash)
            inconsistent();
        }
        const originalHead = current.exists && originalVersion.exists &&
          bornEqual(current, { createTime: current.updateTime }) && bornEqual(current, originalVersion) &&
          native?.revision === value.nativeRevision && native.contentHash === value.nativeContentHash;
        const state = !current.exists ? 'missing' : originalHead ? 'unchanged' : 'changed';
        const resolution = await readEditorialReviewResolution(tx, db, proof, original, request.id);
        const reviewToken = digest({ domain: 'writer-book-restored-review-current-v1', context: proof.contextToken,
          editorialRevision: proof.root.data().literaryRevision ?? 0,
          review: nativeRestoreToken(snapshot), current: current.exists ? nativeRestoreToken(current) : null,
          originalVersion: originalVersion.exists ? nativeRestoreToken(originalVersion) : null, native,
          resolution: resolution ? nativeRestoreToken(resolution.snapshot) : null });
        let sources = [];
        if (includeSources && current.exists && value.kind === 'plan') {
          const context = workScope(db, uid, { target: { kind: 'book', id: request.bookId } }, []);
          const metadata = await readWorkMetadata(tx, context.ref, ['universeId']);
          const read = await createLiteraryReferenceReader(tx, context, metadata.data());
          sources = await readLiteraryPlanSourceViews(read, saved.plan.references);
        }
        const view = { schemaVersion: 1, bookId: request.bookId, sources,
          title: value.kind === 'contract' ? 'Contrato editorial' : saved?.plan?.title ?? 'Plano removido', id: value.id, kind: value.kind, state, reviewToken, native,
          original: { revision: value.nativeRevision, contentHash: value.nativeContentHash },
          historicalStatus: value.historicalStatus, historicalCollaboration: value.historicalCollaboration,
          pendingReferences: structuredClone(value.pendingReferences),
          reviewState: resolution ? 'acknowledged' : 'required',
          acknowledgement: resolution ? reviewAcknowledgementView(resolution.value) : null,
          currentChangedSinceAcknowledgement: resolution ?
            (native?.revision ?? null) !== resolution.value.nativeRevision || (native?.contentHash ?? null) !== resolution.value.nativeContentHash ||
            (current.exists ? editorialBirth(current) : null) !== resolution.value.nativeBirth : null,
          canUseOriginalDraft: state === 'unchanged' && resolution === null };
        return { view, proof, original, current, native, resolution };
}
