import { getFunctions } from 'firebase/functions';
import { httpsDomainCallable as httpsCallable } from '@/shared/api/domainCallable';
import { getFirebaseApp } from '@/shared/lib';
import type {
  StartAdventureDeletionInput,
  AdvanceAdventureDeletionInput,
} from '../model/adventureDeletion';
export interface AdventureDeletionTransport {
  getSource(input: { adventureId: string }): Promise<unknown>;
  start(input: StartAdventureDeletionInput): Promise<unknown>;
  resolveStart(input: StartAdventureDeletionInput & { intent: 'cancel' }): Promise<unknown>;
  get(input: { adventureId: string }): Promise<unknown>;
  list(input: { cursor?: string; limit?: number }): Promise<unknown>;
  advance(input: AdvanceAdventureDeletionInput): Promise<unknown>;
}
type Command =
  | 'getAdventureDeletionSource'
  | 'startAdventureDeletion'
  | 'resolveAdventureDeletionStart'
  | 'getAdventureDeletion'
  | 'listAdventureDeletions'
  | 'advanceAdventureDeletion';
async function call(name: Command, input: unknown): Promise<unknown> {
  return (
    await httpsCallable<unknown, unknown>(getFunctions(getFirebaseApp(), 'us-central1'), name, {
      timeout: 120_000,
    })(input)
  ).data;
}
/** Not composed into product UI until authenticated endpoints and recovery gates are complete. */
export const adventureDeletionTransport: AdventureDeletionTransport = {
  getSource: (input) => call('getAdventureDeletionSource', input),
  start: (input) => call('startAdventureDeletion', input),
  resolveStart: (input) => call('resolveAdventureDeletionStart', input),
  get: (input) => call('getAdventureDeletion', input),
  list: (input) => call('listAdventureDeletions', input),
  advance: (input) => call('advanceAdventureDeletion', input),
};
