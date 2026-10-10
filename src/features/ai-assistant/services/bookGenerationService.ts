import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';

export interface BookGenerationContext {
  title: string;
  genre: string;
  synopsis: string;
}
export type BookAssetKind = 'synopsis' | 'cover';
export interface BookGenerationQuote {
  synopsis: number;
  cover: number;
}
export interface BookAssetSuggestion {
  id: string;
  kind: BookAssetKind;
  cost: number;
  text?: string;
  previewUrl?: string;
}
export interface AcceptedBookAsset {
  id: string;
  kind: BookAssetKind;
  credits: number;
  text?: string;
  coverUrl?: string;
  imageId?: string;
}
async function call<Input, Output>(name: string, data: Input): Promise<Output> {
  try {
    const callable = httpsCallable<Input, Output>(
      getFunctions(getFirebaseApp(), 'us-central1'),
      name,
      { timeout: 120000 },
    );
    return (await callable(data)).data;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (
      code === 'functions/resource-exhausted' ||
      code === 'functions/failed-precondition' ||
      code === 'functions/not-found'
    ) {
      throw new Error(error instanceof Error ? error.message : 'Não foi possível concluir.', {
        cause: error,
      });
    }
    throw new Error(
      'A IA está indisponível. Tente novamente ou continue preenchendo manualmente.',
      { cause: error },
    );
  }
}
export const quoteBookGeneration = () =>
  call<Record<string, never>, BookGenerationQuote>('bookGenerationQuote', {});
export const generateBookAsset = (
  context: BookGenerationContext,
  kind: BookAssetKind,
  requestId: string,
) =>
  call<BookGenerationContext & { kind: BookAssetKind; requestId: string }, BookAssetSuggestion>(
    'generateBookAsset',
    { ...context, kind, requestId },
  );
export const acceptBookAsset = (id: string) =>
  call<{ id: string }, AcceptedBookAsset>('acceptBookAsset', { id });
export const discardBookAsset = (id: string) =>
  call<{ id: string }, { discarded: boolean }>('discardBookAsset', { id });
