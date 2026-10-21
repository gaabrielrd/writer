import type { EditorChatScope } from './editorChat';
import type { EditorChatEditorBridge } from './editorChatEditorBridge';

export interface EditorChatConfirmedSnapshot {
  content: string;
  revision: number;
  bodyHash: string;
}

/** Implemented by the writing host; autosave hooks stay inside their own feature. */
export interface EditorChatHost extends EditorChatScope {
  checkCurrent(this: void): void;
  getConfirmedSnapshot(this: void): EditorChatConfirmedSnapshot | null;
  getBridge(this: void): EditorChatEditorBridge | null;
  runExclusive<T>(this: void, work: () => Promise<T>): Promise<T>;
}
