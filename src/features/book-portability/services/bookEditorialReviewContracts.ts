import type { LiteraryReference } from '@/features/literary-production';
import type { EditorialReviewWire, EditorialReviewReceipt, EditorialWithdrawalReceipt,
  EditorialReviewOutcome, EditorialReviewResolution, EditorialReviewView, EditorialReviewPage } from '../model/bookEditorialReview';
export function reviewCheck(value: unknown): asserts value {
  if (!value) throw new Error('A revisão retornou dados incompatíveis. Preserve o pedido e consulte novamente.');
}
const object = (raw: unknown): Record<string, unknown> => { reviewCheck(raw && typeof raw === 'object' && !Array.isArray(raw)); return raw as Record<string, unknown>; };
export function reviewClosed(raw: unknown, fields: string[], optional: string[] = []) {
  const value = object(raw);
  reviewCheck(fields.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => [...fields, ...optional].includes(key)));
  return value;
}
const text = (raw: unknown, max = 4096) => { reviewCheck(typeof raw === 'string' && raw.length > 0 && raw.length <= max); return raw; };
const count = (raw: unknown) => { reviewCheck(Number.isSafeInteger(raw) && (raw as number) >= 0); return raw as number; };
export const reviewHash = (raw: unknown) => { reviewCheck(typeof raw === 'string' && /^[a-f0-9]{64}$/.test(raw)); return raw; };
export function reviewId(raw: unknown) { reviewCheck(typeof raw === 'string' && (raw === 'contract' || /^restore-[a-f0-9]{64}$/.test(raw))); return raw; }
export function nativeReviewReference(raw: unknown): LiteraryReference {
  const value = reviewClosed(raw, ['kind', 'id', 'scopeId', 'sourceToken', 'revision', 'purpose']);
  reviewCheck(['act', 'chapter', 'scene', 'arc', 'event', 'localLore', 'globalLore', 'volumeUnit'].includes(String(value.kind)));
  text(value.id); if (value.scopeId !== null) text(value.scopeId);
  reviewHash(value.sourceToken); count(value.revision); reviewCheck(['source', 'subject'].includes(String(value.purpose)));
  return structuredClone(value) as unknown as LiteraryReference;
}
export function editorialReviewWire(raw: unknown): EditorialReviewWire {
  const value = reviewClosed(raw, ['bookId', 'id', 'operationId', 'reviewToken', 'decision'], ['references']);
  text(value.bookId, 128); text(value.operationId, 128); reviewId(value.id); reviewHash(value.reviewToken);
  reviewCheck(['keep-current', 'reconcile-references'].includes(String(value.decision)));
  if (value.decision === 'keep-current') reviewCheck(!Object.hasOwn(value, 'references'));
  else { reviewCheck(Array.isArray(value.references) && value.references.length <= 12); value.references.forEach(nativeReviewReference); }
  return structuredClone(value) as unknown as EditorialReviewWire;
}
function receipt(raw: unknown): EditorialReviewReceipt {
  const value = reviewClosed(raw, ['id', 'kind', 'operationId', 'decision', 'nativeRevision', 'nativeContentHash', 'acknowledgedAt', 'planChanged']);
  reviewId(value.id); text(value.operationId, 128); reviewCheck(['contract', 'plan'].includes(String(value.kind)));
  reviewCheck(['keep-current', 'reconcile-references'].includes(String(value.decision)));
  if (value.nativeRevision === null) reviewCheck(value.nativeContentHash === null);
  else { reviewCheck(count(value.nativeRevision) > 0); reviewHash(value.nativeContentHash); }
  count(value.acknowledgedAt); reviewCheck(typeof value.planChanged === 'boolean');
  return value as unknown as EditorialReviewReceipt;
}
function withdrawal(raw: unknown): EditorialWithdrawalReceipt {
  const value = reviewClosed(raw, ['id', 'operationId', 'retiredAt']); reviewId(value.id); text(value.operationId, 128); count(value.retiredAt);
  return value as unknown as EditorialWithdrawalReceipt;
}
export function editorialReviewOutcome(raw: unknown, wire: EditorialReviewWire): EditorialReviewOutcome {
  const value = reviewClosed(raw, ['schemaVersion', 'bookId', 'kind', 'receipt']);
  reviewCheck(value.schemaVersion === 1 && value.bookId === wire.bookId && ['confirmed', 'retired'].includes(String(value.kind)));
  const confirmed = value.kind === 'confirmed' ? receipt(value.receipt) : withdrawal(value.receipt);
  reviewCheck(confirmed.id === wire.id && confirmed.operationId === wire.operationId);
  if (value.kind === 'confirmed') reviewCheck((confirmed as EditorialReviewReceipt).decision === wire.decision);
  return value as unknown as EditorialReviewOutcome;
}
export function editorialReviewResolution(raw: unknown, bookId: string, operationId: string): EditorialReviewResolution {
  const value = object(raw);
  reviewClosed(value, ['schemaVersion', 'bookId', 'state'], value.state === 'unconfirmed' ? [] : ['receipt']);
  reviewCheck(value.schemaVersion === 1 && value.bookId === bookId && ['unconfirmed', 'confirmed', 'retired'].includes(String(value.state)));
  if (value.state !== 'unconfirmed') {
    const row = value.state === 'confirmed' ? receipt(value.receipt) : withdrawal(value.receipt); reviewCheck(row.operationId === operationId);
  }
  return value as unknown as EditorialReviewResolution;
}
export function editorialReviewView(raw: unknown, bookId: string, id: string): EditorialReviewView {
  const value = reviewClosed(raw, ['schemaVersion', 'bookId', 'sources', 'title', 'id', 'kind', 'state', 'reviewToken',
    'native', 'original', 'historicalStatus', 'historicalCollaboration', 'pendingReferences', 'reviewState',
    'acknowledgement', 'currentChangedSinceAcknowledgement', 'canUseOriginalDraft']);
  reviewCheck(value.schemaVersion === 1 && value.bookId === bookId && value.id === id);
  reviewId(value.id); reviewHash(value.reviewToken); text(value.title, 2000);
  reviewCheck(['contract', 'plan'].includes(String(value.kind)) && ['unchanged', 'changed', 'missing'].includes(String(value.state)));
  for (const state of [value.native, value.original]) if (state !== null) { const data = reviewClosed(state, ['revision', 'contentHash']); count(data.revision); reviewHash(data.contentHash); }
  reviewCheck(Array.isArray(value.sources) && value.sources.length <= 12 && Array.isArray(value.pendingReferences) && value.pendingReferences.length <= 12);
  for (const source of value.sources) {
    const row = reviewClosed(source, ['reference', 'label', 'available', 'changed'], ['currentReference']); nativeReviewReference(row.reference);
    if (row.currentReference !== null && row.currentReference !== undefined) nativeReviewReference(row.currentReference);
    reviewCheck(typeof row.available === 'boolean' && typeof row.changed === 'boolean' && (row.label === null || typeof row.label === 'string'));
  }
  reviewCheck(['required', 'acknowledged'].includes(String(value.reviewState)) && typeof value.canUseOriginalDraft === 'boolean');
  if (value.acknowledgement !== null) receipt(value.acknowledgement);
  return value as unknown as EditorialReviewView;
}
export function editorialReviewPage(raw: unknown, bookId: string): EditorialReviewPage {
  const value = reviewClosed(raw, ['schemaVersion', 'bookId', 'availability', 'items', 'next']);
  reviewCheck(value.schemaVersion === 1 && value.bookId === bookId && ['none', 'available'].includes(String(value.availability)));
  reviewCheck(Array.isArray(value.items) && value.items.length <= 50 && (value.next === null || typeof value.next === 'string'));
  for (const raw of value.items) { const row = reviewClosed(raw, ['id', 'kind', 'title', 'reviewState', 'acknowledgement']);
    reviewId(row.id); text(row.title, 2000); reviewCheck(['contract', 'plan'].includes(String(row.kind)) && ['required', 'acknowledged'].includes(String(row.reviewState)));
    if (row.acknowledgement !== null) receipt(row.acknowledgement); }
  return value as unknown as EditorialReviewPage;
}
export function stableReviewJSON(value: unknown): string {
  const order = (item: unknown): unknown => Array.isArray(item) ? item.map(order) : item && typeof item === 'object'
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, order((item as Record<string, unknown>)[key])])) : item;
  return JSON.stringify(order(value));
}
export async function reviewWireHash(wire: EditorialReviewWire): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableReviewJSON(wire)));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join('');
}
