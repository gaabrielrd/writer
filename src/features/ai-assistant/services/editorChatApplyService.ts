import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/shared/lib';
import { getWorkVersionSource, type VersionSource } from '@/features/manuscript-history';
import type { EditorChatHost } from '../model/editorChatHost';
import type {
  EditorChatCaptureSource,
  EditorChatPreparedText,
} from '../model/editorChatEditorBridge';
import {
  canonicalEditorChatJSON,
  editorChatTextHash,
  normalizeEditorChatDTO,
  type EditorChatScope,
  type EditorChatApplyResult,
} from '../model/editorChat';
import { normalizeEditorChatBase } from '../../../../functions/src/editorChatContracts.mjs';
import { callEditorChat } from './editorChatService';
import { createEditorChatOperationSession } from './editorChatOperationSession';
import { assertEditorChatOperation } from './editorChatOperationStorage';

export interface EditorChatApplyHost extends EditorChatHost {
  /** Called inside the host reservation, after the editor commits its undoable transaction. */
  acceptConfirmed(this: void, source: VersionSource): void;
  /** Some hosts must refresh aggregate metadata before synchronously adopting the text. */
  prepareAdoption?(this: void, source: VersionSource): Promise<() => void>;
}
export interface EditorChatApplyInput {
  conversationId: string;
  conversationToken: string;
  turnId: string;
  placement: 'original' | 'retargeted';
  replace: boolean;
  source?: EditorChatCaptureSource;
}
function changed(): never {
  throw new Error(
    'A confirmação mudou. Preserve o rascunho e confira o estado antes de continuar.',
  );
}
/** A fresh explicit operation, never an automatic retry of an uncertain acceptance. */
export async function applyEditorChatSuggestion(
  uid: string,
  host: EditorChatApplyHost,
  input: EditorChatApplyInput,
): Promise<EditorChatApplyResult> {
  const intent = { ...input };
  const user = auth.currentUser;
  let actorChanged = false;
  const actor = () => {
    if (!user || user.uid !== uid || auth.currentUser !== user || actorChanged) changed();
    host.checkCurrent();
  };
  actor();
  const unsubscribe = onAuthStateChanged(
    auth,
    (next) => {
      if (next !== user) actorChanged = true;
    },
    () => {
      actorChanged = true;
    },
  );
  const scope: EditorChatScope = { target: { ...host.target }, resource: { ...host.resource } };
  const controls = {
    ...scope,
    conversationId: intent.conversationId,
    conversationToken: intent.conversationToken,
    turnId: intent.turnId,
  };
  const bridge = host.getBridge();
  if (!bridge) {
    unsubscribe();
    changed();
  }
  try {
    return await host.runExclusive(async () => {
      actor();
      const snapshot = host.getConfirmedSnapshot();
      if (!snapshot) changed();
      const savedSnapshot = { ...snapshot };
      const own = await bridge.capture(
        intent.placement === 'retargeted' ? (intent.source ?? 'auto') : 'auto',
      );
      let prepared: EditorChatPreparedText | null = null;
      const check = () => {
        actor();
        own.checkCurrent();
        prepared?.checkCurrent();
        if (
          host.getBridge() !== bridge ||
          canonicalEditorChatJSON(scope) !==
            canonicalEditorChatJSON({ target: host.target, resource: host.resource }) ||
          canonicalEditorChatJSON(host.getConfirmedSnapshot()) !==
            canonicalEditorChatJSON(savedSnapshot)
        )
          changed();
      };
      check();
      bridge.setBusy(true);
      try {
        const read = await callEditorChat(uid, { action: 'getTurn', ...controls }, { check });
        check();
        const answer = read.answer;
        if (
          read.presentation !== 'available' ||
          read.turn.state !== 'done' ||
          !answer ||
          answer.suggestion === null
        )
          changed();
        if (
          canonicalEditorChatJSON({
            target: answer.context.source.target,
            resource: answer.context.source.resource,
          }) !== canonicalEditorChatJSON(scope)
        )
          changed();
        const saved = await getWorkVersionSource(scope);
        check();
        if (
          !saved ||
          canonicalEditorChatJSON({ target: saved.target, resource: saved.resource }) !==
            canonicalEditorChatJSON(scope) ||
          saved.content !== savedSnapshot.content ||
          saved.revision !== savedSnapshot.revision ||
          saved.contentHash !== savedSnapshot.bodyHash
        )
          changed();
        const base = normalizeEditorChatBase({
          sourceToken: saved.sourceToken,
          revision: saved.revision,
          bodyHash: saved.contentHash,
        });
        if (
          intent.placement === 'original' &&
          canonicalEditorChatJSON(base) !==
            canonicalEditorChatJSON({
              sourceToken: answer.context.source.sourceToken,
              revision: answer.context.source.revision,
              bodyHash: answer.context.source.bodyHash,
            })
        )
          changed();
        prepared = await bridge.prepare(
          intent.placement === 'original' ? answer.context.capture : own.capture,
          answer.suggestion,
          intent.replace,
        );
        check();
        if (prepared.before !== own.html) changed();
        const suggestionHash = await editorChatTextHash(answer.suggestion);
        check();
        const session = createEditorChatOperationSession({
          uid,
          scope,
          check,
          controls: () => ({
            projectToken: answer.context.source.projectToken,
            resourceToken: answer.context.source.resourceToken,
            conversationId: intent.conversationId,
            conversationToken: intent.conversationToken,
            turnId: intent.turnId,
            attemptToken: read.turn.attemptToken,
          }),
        });
        const result = await session.execute(
          'applySuggestion',
          {
            ...controls,
            operationId: crypto.randomUUID(),
            suggestionHash,
            base,
            after: prepared.after,
            placement: intent.placement,
          },
          { frozenGeneration: read.turn.generation.requested },
        );
        check();
        if (result.receipt.outcome !== 'confirmed' || !result.current) changed();
        const applied = normalizeEditorChatDTO('apply', result.current);
        const row = session.read();
        if (!row || row.state !== 'settled') changed();
        const confirm = () => {
          check();
          assertEditorChatOperation(row, check);
        };
        confirm();
        const source = await getWorkVersionSource(scope);
        confirm();
        if (
          !source ||
          canonicalEditorChatJSON({ target: source.target, resource: source.resource }) !==
            canonicalEditorChatJSON(scope) ||
          source.revision !== applied.revision ||
          source.contentHash !== applied.contentHash ||
          source.content !== prepared.after ||
          new TextEncoder().encode(source.content).byteLength !== applied.bodyBytes
        )
          changed();
        const hash = await editorChatTextHash(source.content);
        confirm();
        if (hash !== applied.contentHash) changed();
        const adopt = host.prepareAdoption
          ? await host.prepareAdoption(source)
          : () => host.acceptConfirmed(source);
        confirm();
        // Reauthorize the original native origins after reading the public saved source.
        const authorized = await callEditorChat(
          uid,
          { action: 'getTurn', ...controls },
          { check: confirm },
        );
        confirm();
        if (
          authorized.presentation !== 'available' ||
          !authorized.answer ||
          authorized.answer.context.source.projectToken !== applied.projectToken ||
          authorized.answer.context.source.resourceToken !== applied.resourceToken
        )
          changed();
        prepared.commit();
        adopt();
        return applied;
      } finally {
        bridge.setBusy(false);
      }
    });
  } finally {
    unsubscribe();
  }
}
