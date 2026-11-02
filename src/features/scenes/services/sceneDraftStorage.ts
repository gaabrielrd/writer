import type { SceneProject } from '../model/scene';
export interface SceneDraft {
  content: string;
  revision: number;
  savedAt: number;
}
export function sceneDraftKey(uid: string, target: SceneProject, sceneId: string): string {
  return (
    'writer:scene-draft:' + [uid, target.kind, target.id, sceneId].map(encodeURIComponent).join(':')
  );
}
export function readSceneDraft(key: string): SceneDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (
      typeof value !== 'object' ||
      value === null ||
      !('content' in value) ||
      typeof value.content !== 'string' ||
      !('revision' in value) ||
      typeof value.revision !== 'number' ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 1 ||
      !('savedAt' in value) ||
      typeof value.savedAt !== 'number' ||
      !Number.isFinite(value.savedAt) ||
      value.savedAt < 0 ||
      value.savedAt > 8640000000000000
    )
      return null;
    return { content: value.content, revision: value.revision, savedAt: value.savedAt };
  } catch {
    return null;
  }
}
export function writeSceneDraft(key: string, draft: SceneDraft): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}
export function clearSceneDraft(key: string, expectedContent: string): void {
  try {
    if (readSceneDraft(key)?.content === expectedContent) localStorage.removeItem(key);
  } catch {
    /* A retained draft is offered again rather than silently lost. */
  }
}
