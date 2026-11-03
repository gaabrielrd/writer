import { getFunctions } from 'firebase/functions';
import { httpsDomainCallable } from '@/shared/api/domainCallable';
import { getFirebaseApp } from '@/shared/lib';
import { type AssistedSession, capturePlatformTextGeneration } from '@/features/ai-assistant';
import type {
  PageCapability,
  PageAssistantReply,
  PageAssistantTarget,
} from '../model/pageAssistant';
export async function askPageAssistant(input: {
  prompt: string;
  page: string;
  target: PageAssistantTarget | null;
  capabilities: PageCapability[];
}): Promise<PageAssistantReply> {
  const result = await httpsDomainCallable<unknown, PageAssistantReply>(
    getFunctions(getFirebaseApp(), 'us-central1'),
    'pageAssistant',
    { timeout: 120000 },
  )({ ...input, generation: capturePlatformTextGeneration() });
  return result.data;
}

export async function loadProjectConception(projectId: string): Promise<AssistedSession | null> {
  return (
    await httpsDomainCallable<unknown, AssistedSession | null>(
      getFunctions(getFirebaseApp(), 'us-central1'),
      'assistedBook',
    )({ action: 'conception', projectId })
  ).data;
}

/** Fresh native source proof; no generation, debit or replay of a UI action. */
export async function inspectPageAssistantContext(
  target: PageAssistantTarget | null,
): Promise<{ contextProof: string | null }> {
  return (
    await httpsDomainCallable<unknown, { contextProof: string | null }>(
      getFunctions(getFirebaseApp(), 'us-central1'),
      'pageAssistant',
    )({ action: 'inspect', target })
  ).data;
}
