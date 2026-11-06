export type PersonaCatalogState = { schemaVersion: 1; revision: number };
export function normalizePersonaCatalogState(value: unknown): PersonaCatalogState;
export function nextPersonaCatalogState(value: unknown): PersonaCatalogState;
