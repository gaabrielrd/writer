import { useAuth } from '@/features/auth';
import type { AIActionType } from '../model/aiPrompt';
import { getUserCredits } from '../services/creditsService';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useEditorChat } from '../hooks/useEditorChat';
import { useEditorChatActions } from '../hooks/useEditorChatActions';
import { captureChatGeneration } from '../services/chapterChatService';
import { getBYOKRevision, subscribeBYOKConfig } from '../services/byokStorage';
import type { EditorChatApplyHost } from '../services/editorChatApplyService';
import type { ChatGenerationRequest } from '../model/chatGeneration';
import { EditorChatPanel } from './EditorChatPanel';

export interface EditorChatWorkspaceProps {
  uid: string;
  host: EditorChatApplyHost;
  open: boolean;
  onClose: () => void;
  disabledReason?: string | null;
  invalidationKey?: string | number;
  requestAction?: { id: number; action: AIActionType };
  onPendingChange?: (pending: boolean) => void;
  onDraftChange?: (dirty: boolean) => void;
}
/** Keeps own RAM draft and durable operation controls while the panel is collapsed. */
export function EditorChatWorkspace({
  uid,
  host,
  open,
  onClose,
  disabledReason,
  invalidationKey,
  requestAction,
  onPendingChange,
  onDraftChange,
}: EditorChatWorkspaceProps) {
  const { updateUserCreditsState } = useAuth();
  const seenAction = useRef<number | null>(null);
  const controller = useEditorChat({ uid, host, invalidationKey });
  const actions = useEditorChatActions({
    uid,
    host,
    controller,
    enabled: true,
    invalidationKey,
    onApplied: (check) => {
      void getUserCredits(uid)
        .then((credits) => {
          check();
          updateUserCreditsState(credits);
        })
        .catch(() => undefined);
    },
  });
  useEffect(() => {
    if (!requestAction || requestAction.id === seenAction.current) return;
    seenAction.current = requestAction.id;
    const command: Record<AIActionType, string> = {
      continue: '/continuar ',
      improve_style: '/estilo ',
      check_consistency: '/coerencia ',
      custom: '',
    };
    const text = command[requestAction.action];
    if (text)
      controller.setDraft(controller.state.draft ? `${controller.state.draft}\n\n${text}` : text);
  }, [requestAction, controller]);
  const revision = useSyncExternalStore(subscribeBYOKConfig, getBYOKRevision, getBYOKRevision);
  const [choice, setChoice] = useState<{ revision: number; value: ChatGenerationRequest }>(() => ({
    revision,
    value: captureChatGeneration(),
  }));
  if (choice.revision !== revision)
    setChoice({ revision, value: captureChatGeneration(choice.value.reasoning) });
  const pending = Boolean(
    (controller.state.pending && controller.state.pending.state !== 'settled') ||
    controller.state.cleanup?.state === 'deleting' ||
    controller.state.busyAction ||
    actions.applying ||
    actions.byokRunning,
  );
  useEffect(() => {
    onPendingChange?.(pending);
    return () => onPendingChange?.(false);
  }, [onPendingChange, pending]);
  useEffect(() => {
    onDraftChange?.(controller.hasUnsentDraft);
    return () => onDraftChange?.(false);
  }, [onDraftChange, controller.hasUnsentDraft]);
  return (
    <EditorChatPanel
      open={open}
      onClose={onClose}
      controller={controller}
      generation={choice.value}
      onGenerationChange={(value) => setChoice({ revision, value })}
      disabledReason={disabledReason}
      onApply={actions.onApply}
      onRunByok={actions.onRunByok}
      byokRunning={actions.byokRunning}
    />
  );
}
