export interface TemporaryValidationIndex {
  add(this: void, key: readonly string[], value: Record<string, unknown>): Promise<void>;
  get(this: void, key: readonly string[]): Promise<Record<string, unknown> | undefined>;
  dispose(this: void): Promise<void>;
}
