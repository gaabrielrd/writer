export const ADVENTURE_CONTENT_HASH_ALGORITHM: 'sha256/hash-wasm@4.12.0';
export interface AdventureContentHashState {
  readonly algorithm: typeof ADVENTURE_CONTENT_HASH_ALGORITHM;
  readonly state: string;
}
export interface AdventureContentHasher {
  update(bytes: Uint8Array): void;
  digest(): string;
  save(): AdventureContentHashState;
  destroy(): void;
}
export interface AdventureContentHash {
  create(saved?: AdventureContentHashState): AdventureContentHasher;
}
export function createAdventureContentHash(): Promise<AdventureContentHash>;
