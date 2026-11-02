import type { BookLoreEditOutcomeRequest } from '../services/bookLoreEditOutcome';
export function nativeEditOutcomeFixture(identity: BookLoreEditOutcomeRequest): Promise<{
  input: BookLoreEditOutcomeRequest;
  call(this: void, method: string, value: unknown): Promise<unknown>;
  writes(): unknown[];
}>;
