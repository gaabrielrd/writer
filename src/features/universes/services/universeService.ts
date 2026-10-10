import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { firestore, getFirebaseApp } from '@/shared/lib';
import type { Universe, UniverseInput } from '../model/universe';

async function call<T>(name: string, data: unknown): Promise<T> {
  try {
    return (
      await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name)(data)
    ).data;
  } catch (cause) {
    throw new Error(
      cause instanceof Error
        ? cause.message
        : 'Não foi possível salvar o universo. Tente novamente.',
      { cause },
    );
  }
}

export async function listUniverses(authorId: string): Promise<Universe[]> {
  const snapshot = await getDocs(
    query(collection(firestore, 'universes'), where('authorId', '==', authorId)),
  );
  return snapshot.docs
    .map((item) => ({ ...item.data(), id: item.id }) as Universe)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getUniverse(id: string): Promise<Universe | null> {
  const snapshot = await getDoc(doc(firestore, 'universes', id));
  return snapshot.exists() ? ({ ...snapshot.data(), id: snapshot.id } as Universe) : null;
}

export function createUniverse(input: UniverseInput, creationId: string): Promise<Universe> {
  return call('createUniverse', { ...input, creationId });
}

export function updateUniverse(id: string, input: UniverseInput): Promise<Universe> {
  return call('updateUniverse', { ...input, id });
}

export async function deleteUniverse(id: string): Promise<void> {
  await call('deleteUniverse', { id });
}
