export type BookRestoreSourceDescriptor =
  | {
      format: 'writer-book-archive';
      version: 1;
      byteLength: number;
      sha256: string;
    }
  | {
      format: 'writer-book-backup';
      version: 1 | 2 | 3 | 4 | 5 | 6;
      byteLength: number;
      sha256: string;
    };
export type BookRestoreStartIntent = {
  schemaVersion: 1;
  ownerId: string;
  operationId: string;
  source: BookRestoreSourceDescriptor;
  reviewHash: string;
};
export type BookRestoreStartRequest = {
  operationId: string;
  source: BookRestoreSourceDescriptor;
  reviewHash: string;
};
