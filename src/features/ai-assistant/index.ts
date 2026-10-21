export * from './model';
export * from './model/persona';
export { PersonaBindingDialog } from './components/PersonaBindingDialog';
export { ChapterPersonaDialog } from './components/ChapterPersonaDialog';
export { usePersonaLibrary } from './hooks/usePersonaLibrary';
export { listPersonas, savePersona } from './services/personaService';
export { AISettingsProvider } from './components/AISettingsProvider';
export { AISettingsPage } from './components/AISettingsPage';
export { useAISettings } from './hooks/useAISettings';
export { useAIConfig } from './hooks/useAIConfig';
export * from './services';
export * as aiClientService from './services';
export * from './hooks/useAIAutocomplete';
export * from './hooks/useBookGeneration';
export * from './services/bookGenerationService';
export { GhostSuggestion } from './components/GhostSuggestion';
export type { GhostSuggestionProps } from './components/GhostSuggestion';
export { AIActionMenu } from './components/AIActionMenu';
export type { AIActionMenuProps } from './components/AIActionMenu';
export { OutOfCreditsDialog } from './components/OutOfCreditsDialog';
export type { OutOfCreditsDialogProps } from './components/OutOfCreditsDialog';
export { BYOKSettingsDialog } from './components/BYOKSettingsDialog';
export type { BYOKSettingsDialogProps } from './components/BYOKSettingsDialog';
export { analyzeLoreWithBYOK } from './services/loreAnalysisClient';
export * from './model/assistedBook';
export * from './model/chapterChat';
export * from './services/chapterChatService';
export * from './services/chatApplyStorage';
export { AIChatLauncher } from './components/AIChatLauncher';
export { ChapterChatPanel } from './components/ChapterChatPanel';
export type { ChatApplyInput } from './components/ChapterChatPanel';
export * from './services/assistedBookService';
export * from './model/editorChat';
export * from './services/editorChatService';
export * from './services/editorChatOperationStorage';
export type {
  EditorChatCaptureSource,
  EditorChatEditorTarget,
  EditorChatOwnCapture,
  EditorChatPreparedText,
  EditorChatEditorBridge,
} from './model/editorChatEditorBridge';
export {
  editorChatMatcherId,
  preferredEditorChatTerms,
  findEditorChatLoreMatches,
} from '../../../functions/src/editorChatMatcher.mjs';
export type { EditorChatMatcherEntity } from '../../../functions/src/editorChatMatcher.mjs';
export type { EditorChatHost, EditorChatConfirmedSnapshot } from './model/editorChatHost';
export { captureEditorChatHost } from './services/editorChatHostService';
export { useEditorChat } from './hooks/useEditorChat';
export type {
  EditorChatController,
  EditorChatControllerState,
  EditorChatByokControl,
  EditorChatControllerError,
  UseEditorChatOptions,
} from './model/editorChatController';

export {
  EditorChatWorkspace,
  type EditorChatWorkspaceProps,
} from './components/EditorChatWorkspace';
export type { EditorChatApplyHost, EditorChatApplyInput } from './services/editorChatApplyService';

export { AdventurePersonaDialog } from './components/AdventurePersonaDialog';
export type { AdventurePersonaDialogProps } from './components/AdventurePersonaDialog';
