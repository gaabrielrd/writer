import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import type {
  NarrativeTarget,
  NarrativeSource,
  NarrativeContext,
  NarrativeItem,
  NarrativeSummary,
  NarrativePage,
  NarrativeMutationResult,
  NarrativeJob,
  NarrativeJobInput,
  CreateNarrativeItemInput,
  UpdateNarrativeItemInput,
  MoveNarrativeItemInput,
  DeleteNarrativeItemInput,
  RebalanceNarrativeRanksInput,
  NarrativeJobProgress,
  NarrativeListInput,
  NarrativeReferenceInput,
  NarrativeReferenceListInput,
  NarrativeReferenceView,
  NarrativeLoreListInput,
  NarrativeLoreOption,
  EntityNarrativeListInput,
  EntitySceneLink,
} from '../model/narrative';
async function call<T>(name: string, input: unknown): Promise<T> {
  try {
    return (
      await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name)(input)
    ).data;
  } catch (cause) {
    const code =
      typeof cause === 'object' && cause !== null && 'code' in cause ? String(cause.code) : '';
    if (
      ['internal', 'unavailable', 'deadline-exceeded', 'cancelled'].includes(
        code.replace(/^functions\//, ''),
      )
    )
      throw Object.assign(
        new Error('Não foi possível confirmar esta operação. Tente novamente.', { cause }),
        { code },
      );
    if (cause instanceof Error) throw cause;
    throw new Error('Não foi possível acessar o planejamento. Tente novamente.', { cause });
  }
}
export const getNarrativeContext = (input: {
  target: NarrativeTarget;
}): Promise<NarrativeContext | null> => call('getNarrativeContext', input);
export const createNarrativeItem = (
  input: CreateNarrativeItemInput,
): Promise<NarrativeMutationResult> => call('createNarrativeItem', input);
export const updateNarrativeItem = (
  input: UpdateNarrativeItemInput,
): Promise<NarrativeMutationResult> => call('updateNarrativeItem', input);
export const getNarrativeItem = (input: {
  target: NarrativeTarget;
  source: NarrativeSource;
}): Promise<NarrativeItem | null> => call('getNarrativeItem', input);
export const listNarrativeItems = (
  input: NarrativeListInput,
): Promise<NarrativePage<NarrativeSummary>> => call('listNarrativeItems', input);
export const moveNarrativeItem = (
  input: MoveNarrativeItemInput,
): Promise<NarrativeMutationResult> => call('moveNarrativeItem', input);
export const deleteNarrativeItem = (
  input: DeleteNarrativeItemInput,
): Promise<NarrativeJobProgress> => call('deleteNarrativeItem', input);
export const setNarrativeReference = (
  input: NarrativeReferenceInput,
): Promise<NarrativeMutationResult> => call('setNarrativeReference', input);
export const listNarrativeReferences = (
  input: NarrativeReferenceListInput,
): Promise<NarrativePage<NarrativeReferenceView>> => call('listNarrativeReferences', input);
export const listNarrativeLoreOptions = (
  input: NarrativeLoreListInput,
): Promise<NarrativePage<NarrativeLoreOption>> => call('listNarrativeLoreOptions', input);
export const listEntityScenes = (
  input: EntityNarrativeListInput,
): Promise<NarrativePage<EntitySceneLink>> => call('listEntityScenes', input);
export const listEntityNarrativeItems = (
  input: EntityNarrativeListInput,
): Promise<NarrativePage<NarrativeSummary>> => call('listEntityNarrativeItems', input);
export const prepareEntitySceneIndex = (input: NarrativeJobInput): Promise<NarrativeJobProgress> =>
  call('prepareEntitySceneIndex', input);
export const rebalanceNarrativeRanks = (
  input: RebalanceNarrativeRanksInput,
): Promise<NarrativeJobProgress> => call('rebalanceNarrativeRanks', input);
export const getNarrativeJob = (input: {
  target: NarrativeTarget;
  operationId: string;
}): Promise<NarrativeJob | null> => call('getNarrativeJob', input);
