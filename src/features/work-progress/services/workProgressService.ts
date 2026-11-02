import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import type {
  WorkTarget,
  WorkProgress,
  UpdateWorkProgressInput,
  WorkProgressMutation,
  PrepareWorkWordCountInput,
  WorkWordPreparation,
  WorkChecklistListInput,
  ChecklistPage,
  CreateWorkChecklistInput,
  UpdateWorkChecklistInput,
  DeleteWorkChecklistInput,
  ChecklistMutation,
  ChecklistDeletion,
  WorkPreferences,
  SaveWorkPreferencesInput,
  RecordWorkActivityInput,
  WorkActivityResult,
  WorkResumeListInput,
  ResumePage,
  ResolvedResume,
} from '../model/workProgress';
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
    )
      throw Object.assign(
        new Error('Não foi possível confirmar esta operação. Tente novamente.', { cause }),
        { code },
      );
    if (cause instanceof Error) throw cause;
    throw new Error('Não foi possível acessar seu progresso. Tente novamente.', { cause });
  }
}
export const getWorkProgress = (input: { target: WorkTarget }): Promise<WorkProgress | null> =>
  call('getWorkProgress', input);
export const updateWorkProgress = (input: UpdateWorkProgressInput): Promise<WorkProgressMutation> =>
  call('updateWorkProgress', input);
export const prepareWorkWordCount = (
  input: PrepareWorkWordCountInput,
): Promise<WorkWordPreparation> => call('prepareWorkWordCount', input);
export const listWorkChecklist = (input: WorkChecklistListInput): Promise<ChecklistPage> =>
  call('listWorkChecklist', input);
export const createWorkChecklistItem = (
  input: CreateWorkChecklistInput,
): Promise<ChecklistMutation> => call('createWorkChecklistItem', input);
export const updateWorkChecklistItem = (
  input: UpdateWorkChecklistInput,
): Promise<ChecklistMutation> => call('updateWorkChecklistItem', input);
export const deleteWorkChecklistItem = (
  input: DeleteWorkChecklistInput,
): Promise<ChecklistDeletion> => call('deleteWorkChecklistItem', input);
export const getWorkPreferences = (): Promise<WorkPreferences> => call('getWorkPreferences', {});
export const saveWorkPreferences = (input: SaveWorkPreferencesInput): Promise<WorkPreferences> =>
  call('saveWorkPreferences', input);
export const recordWorkActivity = (input: RecordWorkActivityInput): Promise<WorkActivityResult> =>
  call('recordWorkActivity', input);
export const listWorkResume = (input: WorkResumeListInput = {}): Promise<ResumePage> =>
  call('listWorkResume', input);
export const resolveWorkResume = (input: { target: WorkTarget }): Promise<ResolvedResume | null> =>
  call('resolveWorkResume', input);
