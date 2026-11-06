import type { LiteraryWritingSnapshot } from '../../../../functions/src/literaryWritingProtocol.mjs';
export interface AutocompleteScope {
  bookId: string;
  chapterId: string;
}
export interface AutocompleteOffer {
  requestId: string;
  bookId: string;
  chapterId: string;
  beforeHash: string;
  text: string;
  expiresAt: number;
  applyCost: number;
  editorial?: LiteraryWritingSnapshot | null;
}
export interface AtomicAutocompleteApply {
  offer: AutocompleteOffer;
  before: string;
  after: string;
  commit: () => void;
}
export interface AutocompleteApplication {
  state: 'confirmed';
  requestId: string;
  operationId: string;
  fingerprint: string;
  chapterId: string;
  beforeHash: string;
  afterHash: string;
  credits: number;
  chargedCredits: number;
  wordCount: number;
  updatedAt: number;
}
export interface PendingAutocompleteApply {
  version: 1;
  actorId: string;
  bookId: string;
  chapterId: string;
  requestId: string;
  operationId: string;
  beforeHash: string;
  afterHash: string;
}
