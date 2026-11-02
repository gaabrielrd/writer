import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import {
  isBlockFailureDefinitive,
  type AdventureBlockMutation,
  type AdventureBlockResource,
} from '../model/adventureBlock';
import type {
  AdventureBlockImageState,
  AdventureScenePreviewPage,
  ReadAdventurePreviewImageInput,
  ReadAdventureScenePreviewInput,
  SetAdventureBlockImageInput,
} from '../model/adventurePreview';

async function call<T>(name: string, input: unknown): Promise<T> {
  try {
    return (
      await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name)(input)
    ).data;
  } catch (cause) {
    if (isBlockFailureDefinitive(cause) && cause instanceof Error) throw cause;
    const code =
      typeof cause === 'object' && cause !== null && 'code' in cause
        ? String(cause.code)
        : 'functions/unavailable';
    throw Object.assign(
      new Error('Não foi possível confirmar o pedido. Tente novamente com o mesmo pedido.', {
        cause,
      }),
      { code },
    );
  }
}
export const getAdventureBlockImage = (input: {
  adventureId: string;
  resource: AdventureBlockResource;
}): Promise<AdventureBlockImageState> => call('getAdventureBlockImage', input);
export const setAdventureBlockImage = (
  input: SetAdventureBlockImageInput,
): Promise<AdventureBlockMutation> => call('setAdventureBlockImage', input);
export const readAdventureScenePreview = (
  input: ReadAdventureScenePreviewInput,
): Promise<AdventureScenePreviewPage> => call('readAdventureScenePreview', input);
export const readAdventurePreviewImage = (
  input: ReadAdventurePreviewImageInput,
): Promise<{ dataUrl: string }> => call('readAdventurePreviewImage', input);
