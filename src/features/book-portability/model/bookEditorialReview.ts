import type { LiteraryReference, LiteraryPlanState } from '@/features/literary-production';
import type { BookEditorialReference } from '../../../../functions/src/bookEditorialProtocol.mjs';
export interface EditorialReviewReceipt {
  id: string;
  kind: 'contract' | 'plan';
  operationId: string;
  decision: 'keep-current' | 'reconcile-references';
  nativeRevision: number | null;
  nativeContentHash: string | null;
  acknowledgedAt: number;
  planChanged: boolean;
}
export interface EditorialWithdrawalReceipt {
  id: string;
  operationId: string;
  retiredAt: number;
}
export type EditorialReviewOutcome =
  | { schemaVersion: 1; bookId: string; kind: 'confirmed'; receipt: EditorialReviewReceipt }
  | { schemaVersion: 1; bookId: string; kind: 'retired'; receipt: EditorialWithdrawalReceipt };
export type EditorialReviewResolution =
  | { schemaVersion: 1; bookId: string; state: 'unconfirmed' }
  | { schemaVersion: 1; bookId: string; state: 'confirmed'; receipt: EditorialReviewReceipt }
  | { schemaVersion: 1; bookId: string; state: 'retired'; receipt: EditorialWithdrawalReceipt };
export interface EditorialReviewWire {
  bookId: string;
  id: string;
  operationId: string;
  reviewToken: string;
  decision: 'keep-current' | 'reconcile-references';
  references?: LiteraryReference[];
}
export interface EditorialReviewView {
  schemaVersion: 1;
  bookId: string;
  id: string;
  kind: 'contract' | 'plan';
  title: string;
  state: 'unchanged' | 'changed' | 'missing';
  reviewToken: string;
  native: { revision: number; contentHash: string } | null;
  original: { revision: number; contentHash: string };
  historicalStatus: string | null;
  historicalCollaboration: { version: 1; mode: 'guidance' | 'supervised' | 'continuous' } | null;
  pendingReferences: BookEditorialReference[];
  sources: LiteraryPlanState['sources'];
  reviewState: 'required' | 'acknowledged';
  acknowledgement: EditorialReviewReceipt | null;
  currentChangedSinceAcknowledgement: boolean | null;
  canUseOriginalDraft: boolean;
}
export interface EditorialReviewPage {
  schemaVersion: 1;
  bookId: string;
  availability: 'none' | 'available';
  items: Array<
    Pick<EditorialReviewView, 'id' | 'kind' | 'title' | 'reviewState' | 'acknowledgement'>
  >;
  next: string | null;
}
export interface EditorialReviewApi {
  list(bookId: string, after?: string | null): Promise<EditorialReviewPage>;
  get(bookId: string, id: string): Promise<EditorialReviewView>;
  apply(wire: EditorialReviewWire): Promise<EditorialReviewOutcome>;
  retire(wire: EditorialReviewWire): Promise<EditorialReviewOutcome>;
  resolve(bookId: string, operationId: string): Promise<EditorialReviewResolution>;
}
