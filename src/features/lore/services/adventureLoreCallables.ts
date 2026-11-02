import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import type {
  AdventureLoreListInput,
  AdventureLoreList,
  AdventureLoreGetInput,
  AdventureLoreGet,
  AdventureLoreSave,
  AdventureLoreWrite,
  AdventureLoreResolve,
  AdventureLoreOutcome,
} from '../model/adventureLore';
async function call<T>(name: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name)(input)
  ).data;
}
export const listAdventureLore = (input: AdventureLoreListInput) =>
  call<AdventureLoreList>('listAdventureLore', input);
export const getAdventureLore = (input: AdventureLoreGetInput) =>
  call<AdventureLoreGet>('getAdventureLore', input);
export const saveAdventureLore = (input: AdventureLoreSave) =>
  call<AdventureLoreOutcome>('saveAdventureLore', input);
export const deleteAdventureLore = (input: AdventureLoreWrite) =>
  call<AdventureLoreOutcome>('deleteAdventureLore', input);
export const resolveAdventureLoreOperation = (input: AdventureLoreResolve) =>
  call<AdventureLoreOutcome>('resolveAdventureLoreOperation', input);
