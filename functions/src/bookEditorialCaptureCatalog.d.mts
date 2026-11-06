export type BookEditorialCaptureFamily =
  | 'impact-control'
  | 'impact-graph'
  | 'impact-node'
  | 'impact-link'
  | 'impact-visit'
  | 'impact-witness'
  | 'impact-check'
  | 'workflow-job'
  | 'sequence-job'
  | 'draft-job'
  | 'draft-unit'
  | 'milestone-job'
  | 'milestone-unit'
  | 'publication-job'
  | 'publication-chapter'
  | 'publication-removal'
  | 'reader-guide-current'
  | 'reader-guide-version'
  | 'integration-job'
  | 'integration-request'
  | 'review-job'
  | 'review-unit'
  | 'review-analysis'
  | 'generation'
  | 'prose'
  | 'contract-current'
  | 'contract-version'
  | 'plan-current'
  | 'plan-version'
  | 'progress-current'
  | 'progress-version'
  | 'preparation-current'
  | 'preparation-version'
  | 'finding-current'
  | 'finding-version'
  | 'impact-current'
  | 'impact-version';
export const BOOK_EDITORIAL_CAPTURE_CATALOG_VERSION: 1;
export const BOOK_EDITORIAL_CAPTURE_FENCE_COVERAGE: 'editorial-saved-records-v1';
export const BOOK_EDITORIAL_CAPTURE_FAMILIES: readonly BookEditorialCaptureFamily[];
export const BOOK_EDITORIAL_CAPTURE_LIMITS: Readonly<{
  pageItems: 50;
  partBytes: 65536;
  itemBytes: number;
}>;
export const BOOK_EDITORIAL_CAPTURE_DEFINITIONS: Readonly<
  Record<
    BookEditorialCaptureFamily,
    {
      collection: string;
      kind: string;
      role: 'current' | 'version';
      singleton?: string;
      listFields?: readonly string[];
      impactFamily?: string;
      orchestrationFamily?: string;
      checkpointFamily?: string;
      publicationFamily?: string;
      integrationFamily?: string;
      reviewFamily?: string;
      decisionFamily?: string;
    }
  >
>;
export interface BookEditorialCaptureSource {
  schemaVersion: 1;
  bookId: string;
  bookSourceToken: string;
  editorialSourceToken: string;
  coverage: 'saved-editorial-records-only';
}
export interface BookEditorialCaptureCatalog extends BookEditorialCaptureSource {
  catalogVersion: 1;
  catalogToken: string;
  families: BookEditorialCaptureFamily[];
  fenceCoverage: string;
}
export interface BookEditorialCaptureItem {
  id: string;
  itemToken: string;
}
export interface BookEditorialCapturePage extends BookEditorialCaptureSource {
  family: BookEditorialCaptureFamily;
  items: BookEditorialCaptureItem[];
  nextCursor: string | null;
  lastId: string | null;
}
export interface BookEditorialCaptureMetadata
  extends BookEditorialCaptureSource, BookEditorialCaptureItem {
  family: BookEditorialCaptureFamily;
  state: 'artifact' | 'current-alias';
  artifactId: string;
  projectionToken: string;
  contentHash: string;
  payload: 'editorial-bundle' | 'editorial-artifact';
  recordCount: number;
}
export interface BookEditorialCapturePart extends BookEditorialCaptureMetadata {
  index?: number;
  byteLength?: number;
  chunkCount?: number;
  chunkHash?: string;
  chunkBase64?: string;
}
export type BookEditorialCaptureRequest = Pick<
  BookEditorialCaptureSource,
  'bookId' | 'bookSourceToken' | 'editorialSourceToken'
>;
export type BookEditorialRecordRequest = BookEditorialCaptureRequest &
  BookEditorialCaptureItem & {
    family: BookEditorialCaptureFamily;
    projectionToken?: string;
  };
export interface BookEditorialCaptureApi {
  getSource(
    this: void,
    input: {
      bookId: string;
      expectedBookSourceToken?: string;
    },
  ): Promise<BookEditorialCaptureSource>;
  catalog(this: void, input: BookEditorialCaptureRequest): Promise<BookEditorialCaptureCatalog>;
  list(
    this: void,
    input: BookEditorialCaptureRequest & {
      family: BookEditorialCaptureFamily;
      limit: number;
      cursor?: string;
    },
  ): Promise<BookEditorialCapturePage>;
  read(
    this: void,
    input: BookEditorialRecordRequest & { index: number },
  ): Promise<BookEditorialCapturePart>;
  inspect(this: void, input: BookEditorialRecordRequest): Promise<BookEditorialCaptureMetadata>;
  verify(
    this: void,
    input: BookEditorialRecordRequest & { projectionToken: string },
  ): Promise<BookEditorialCaptureMetadata>;
  verifySource(this: void, input: BookEditorialCaptureRequest): Promise<BookEditorialCaptureSource>;
}
