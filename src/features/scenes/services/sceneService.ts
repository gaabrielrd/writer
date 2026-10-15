import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import type {
  SceneJob,
  DeleteSceneGroupInput,
  SceneSource,
  SceneSourceListInput,
  ArchiveSceneInput,
  ConvertChapterInput,
  CreateSceneGroupInput,
  CreateSceneInput,
  DeleteSceneGroupsInput,
  MoveSceneInput,
  SceneAssemblyInput,
  SceneAssemblyPage,
  SceneDocument,
  SceneGroup,
  SceneGroupDetail,
  SceneGroupListInput,
  SceneJobInput,
  SceneJobProgress,
  SceneListInput,
  SceneMutationResult,
  ScenePage,
  SceneProject,
  SceneReferenceInput,
  SceneReferenceView,
  SceneSummary,
  UpdateSceneInput,
} from '../model/scene';
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
    throw new Error('Não foi possível acessar as cenas. Tente novamente.', { cause });
  }
}
export const createScene = (input: CreateSceneInput): Promise<SceneMutationResult> =>
  call('createScene', input);
export const updateScene = (input: UpdateSceneInput): Promise<SceneMutationResult> =>
  call('updateScene', input);
export const moveScene = (input: MoveSceneInput): Promise<SceneMutationResult> =>
  call('moveScene', input);
export const archiveScene = (input: ArchiveSceneInput): Promise<SceneMutationResult> =>
  call('archiveScene', input);
export const getScene = (input: {
  target: SceneProject;
  sceneId: string;
}): Promise<SceneDocument | null> => call('getScene', input);
export const listScenes = (input: SceneListInput): Promise<ScenePage<SceneSummary>> =>
  call('listScenes', input);
export const listSceneGroups = (input: SceneGroupListInput): Promise<ScenePage<SceneGroup>> =>
  call('listSceneGroups', input);
export const getSceneGroup = (input: {
  target: SceneProject;
  parentId: string | null;
}): Promise<SceneGroupDetail | null> => call('getSceneGroup', input);
export const createSceneGroup = (input: CreateSceneGroupInput): Promise<SceneGroup> =>
  call('createSceneGroup', input);
export const convertChapterToScenes = (input: ConvertChapterInput): Promise<SceneMutationResult> =>
  call('convertChapterToScenes', input);
export const setSceneReference = (input: SceneReferenceInput): Promise<SceneMutationResult> =>
  call('setSceneReference', input);
export const listSceneReferences = (input: {
  target: SceneProject;
  sceneId: string;
  cursor?: string | null;
  limit?: number;
}): Promise<ScenePage<SceneReferenceView>> => call('listSceneReferences', input);
export const readSceneAssembly = (input: SceneAssemblyInput): Promise<SceneAssemblyPage> =>
  call('readSceneAssembly', input);
export const rebalanceSceneRanks = (input: SceneJobInput): Promise<SceneJobProgress> =>
  call('rebalanceSceneRanks', input);
export const deleteSceneGroup = (input: DeleteSceneGroupInput): Promise<SceneJobProgress> =>
  call('deleteSceneGroup', input);
export const deleteSceneGroups = (input: DeleteSceneGroupsInput): Promise<SceneJobProgress> =>
  call('deleteSceneGroups', input);
export const deleteSceneBook = (input: SceneJobInput): Promise<SceneJobProgress> =>
  call('deleteSceneBook', input);
export const listSceneSources = (input: SceneSourceListInput): Promise<ScenePage<SceneSource>> =>
  call('listSceneSources', input);

export const getSceneJob = (input: {
  target: SceneProject;
  operationId: string;
}): Promise<SceneJob | null> => call('getSceneJob', input);
