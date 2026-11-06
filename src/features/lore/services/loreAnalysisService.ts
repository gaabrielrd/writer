import { capturePlatformTextGeneration } from '@/features/ai-assistant';
import { getFunctions } from 'firebase/functions';
import { httpsDomainCallable as httpsCallable } from '@/shared/api/domainCallable';
import { getFirebaseApp } from '@/shared/lib';
import type {
  DetectedLoreEntity,
  LoreAnalysis,
  LoreChange,
  LoreAnalysisRequest,
  LoreAnalysisEditorialContext,
} from '../model/loreAnalysis';

async function call<T>(name: string, data: unknown): Promise<T> {
  try {
    return (
      await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name, {
        timeout: name === 'analyzeChapterLore' ? 540000 : 120000,
      })(data)
    ).data;
  } catch (cause) {
    throw new Error(
      cause instanceof Error
        ? cause.message
        : 'Não foi possível concluir a atualização do compêndio.',
      { cause },
    );
  }
}
export const getLoreAnalysisEditorialContext = (bookId: string, chapterId: string) =>
  call<LoreAnalysisEditorialContext>('getLoreAnalysisEditorialContext', { bookId, chapterId });
export const analyzeChapterLore = (request: LoreAnalysisRequest) => {
  request.generation ??= capturePlatformTextGeneration();
  return call<LoreAnalysis>('analyzeChapterLore', request);
};
export const prepareBYOKLore = (request: LoreAnalysisRequest, entities: DetectedLoreEntity[]) =>
  call<LoreAnalysis>('prepareBYOKLore', { ...request, entities });
export const applyLoreAnalysis = (id: string, text: string, changes: LoreChange[]) =>
  call<{ credits: number; applied: number }>('applyLoreAnalysis', { id, text, changes });
