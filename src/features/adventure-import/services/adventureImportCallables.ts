import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import type {
  StartImportInput,
  ResolveImportStartInput,
  ImportStartResult,
  ListImportsInput,
  ImportPage,
  ImportProgress,
  ImportMutationInput,
  AppendImportInput,
  ImportConfirmed,
} from '../model/adventureImport';
const call = async <T>(name: string, input: unknown): Promise<T> =>
  (await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name)(input))
    .data;
export const startAdventureImport = (input: StartImportInput) =>
  call<ImportStartResult>('startAdventureImport', input);
export const resolveAdventureImportStart = (input: ResolveImportStartInput) =>
  call<ImportStartResult>('resolveAdventureImportStart', input);
export const listAdventureImports = (input: ListImportsInput) =>
  call<ImportPage>('listAdventureImports', input);
export const getAdventureImport = (input: { importId: string; jobToken?: string }) =>
  call<ImportProgress>('getAdventureImport', input);
export const appendAdventureImportSection = (input: AppendImportInput) =>
  call<ImportConfirmed>('appendAdventureImportSection', input);
export const advanceAdventureImport = (input: ImportMutationInput) =>
  call<ImportConfirmed>('advanceAdventureImport', input);
export const activateAdventureImport = (input: ImportMutationInput) =>
  call<ImportConfirmed>('activateAdventureImport', input);
export const cancelAdventureImport = (input: ImportMutationInput) =>
  call<ImportConfirmed>('cancelAdventureImport', input);
