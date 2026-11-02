import type { EditorChatCapture } from './editorChat';

export type EditorChatCaptureSource = 'auto' | EditorChatCapture['source'];
export type EditorChatEditorTarget = Pick<EditorChatCapture, 'editorHash' | 'from' | 'to'>;

/** Own manuscript only. Authorization and the confirmed source base belong to the host. */
export interface EditorChatOwnCapture {
  capture: EditorChatCapture;
  html: string;
  checkCurrent(this: void): void;
}
export interface EditorChatPreparedText {
  before: string;
  after: string;
  checkCurrent(this: void): void;
  commit(this: void): void;
}
export interface EditorChatEditorBridge {
  preview(
    this: void,
    source: EditorChatCaptureSource,
  ): {
    source: EditorChatCapture['source'];
    text: string;
    truncated: boolean;
  };
  capture(this: void, source: EditorChatCaptureSource): Promise<EditorChatOwnCapture>;
  prepare(
    this: void,
    target: EditorChatEditorTarget,
    text: string,
    replace: boolean,
  ): Promise<EditorChatPreparedText>;
  setBusy(this: void, busy: boolean): void;
  focus(this: void): void;
}
