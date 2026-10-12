import {
  parseWorkspacePreferences,
  validPanelPercent,
  type WorkspacePreferences,
} from '../model/workspacePreferences';

const key = (uid: string) => `writer:editor-workspace:${encodeURIComponent(uid)}`;
const changed = 'writer:editor-workspace-changed';

export function readWorkspacePreferences(uid: string): WorkspacePreferences {
  try {
    const raw = uid ? localStorage.getItem(key(uid)) : null;
    return parseWorkspacePreferences(raw ? JSON.parse(raw) : null);
  } catch {
    return parseWorkspacePreferences(null);
  }
}

export function saveWorkspacePreferences(uid: string, preferences: WorkspacePreferences): boolean {
  if (!uid || !validPanelPercent(preferences.panelPercent)) return false;
  try {
    localStorage.setItem(key(uid), JSON.stringify({ version: 1, ...preferences }));
    window.dispatchEvent(new CustomEvent(changed, { detail: uid }));
    return true;
  } catch {
    return false;
  }
}

export function subscribeWorkspacePreferences(uid: string, callback: () => void): () => void {
  const onLocal = (event: Event) => {
    if ((event as CustomEvent<string>).detail === uid) callback();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.storageArea === localStorage && (event.key === key(uid) || event.key === null))
      callback();
  };
  window.addEventListener(changed, onLocal);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(changed, onLocal);
    window.removeEventListener('storage', onStorage);
  };
}
