export const ADVENTURE_HISTORY_SEED: 'writer-adventure-history-v1\n';
export interface AdventureHistoryTextManifest {
  readonly byteLength: number;
  readonly chunkCount: number;
  readonly contentHash: string;
}
export interface AdventureHistoryBodyManifest {
  readonly schemaVersion: 1;
  readonly versionId: string;
  readonly layout: 'fixed64k';
  readonly headerHash: string;
  readonly byteLength: number;
  readonly contentHash: string;
  readonly chunkCount: number;
}
export function adventureHistoryBodyManifest(
  versionId: string,
  headerHash: string,
  native: AdventureHistoryTextManifest,
): AdventureHistoryBodyManifest;
export function adventureHistoryDigestLine(
  versionId: string,
  header: AdventureHistoryTextManifest,
  body: AdventureHistoryBodyManifest,
): string;
export function adventureHistoryManifest(
  versions: number,
  nativeRecords: number,
  textBytes: number,
  digest: string,
): { schemaVersion: 1; versions: number; nativeRecords: number; textBytes: number; digest: string };
