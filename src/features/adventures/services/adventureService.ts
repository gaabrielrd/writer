import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import type {
  Adventure,
  AdventureListInput,
  AdventurePageResult,
  CreateAdventureInput,
} from '../model/adventure';

async function call<T>(name: string, data: unknown): Promise<T> {
  try {
    return (
      await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name)(data)
    ).data;
  } catch (cause) {
    const code =
      typeof cause === 'object' && cause !== null && 'code' in cause ? String(cause.code) : '';
    if (
      ['internal', 'unavailable', 'deadline-exceeded', 'cancelled'].includes(
        code.replace(/^functions\//, ''),
      )
    ) {
      throw Object.assign(
        new Error('Não foi possível confirmar esta operação. Tente novamente.', { cause }),
        { code },
      );
    }
    if (cause instanceof Error) throw cause;
    throw new Error('Não foi possível acessar a aventura. Tente novamente.', { cause });
  }
}
export function createAdventure(input: CreateAdventureInput): Promise<Adventure> {
  return call('createAdventure', input);
}
export function getAdventure(id: string): Promise<Adventure | null> {
  return call('getAdventure', { id });
}
export function listAdventures(input: AdventureListInput = {}): Promise<AdventurePageResult> {
  return call('listStudioProjects', { ...input, kind: 'adventure' });
}
