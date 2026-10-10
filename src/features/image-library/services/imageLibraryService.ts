import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import type { ImagePage } from '../model/image';

async function call<T>(name: string, data: object): Promise<T> {
  try {
    return (
      await httpsCallable<object, T>(getFunctions(getFirebaseApp(), 'us-central1'), name)(data)
    ).data;
  } catch (error) {
    const code = (error as { code?: string }).code;
    const message =
      code === 'functions/failed-precondition'
        ? 'A imagem está em uso. Remova-a dos livros antes de excluir.'
        : 'Não foi possível acessar a biblioteca. Tente novamente.';
    throw new Error(message, { cause: error });
  }
}
export async function listLibraryImages(cursor?: string): Promise<ImagePage> {
  return call<ImagePage>('listLibraryImages', { cursor: cursor ?? null });
}
export async function renameLibraryImage(id: string, name: string): Promise<void> {
  await call('renameLibraryImage', { id, name });
}
export async function deleteLibraryImage(id: string): Promise<void> {
  await call('deleteLibraryImage', { id });
}
