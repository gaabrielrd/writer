import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/shared/lib';
import {
  normalizeEditorChatDTO,
  canonicalEditorChatJSON,
  type EditorChatOperationRow,
  type EditorChatJournalScope,
  type EditorChatPersonaBinding,
  type EditorChatPersonaBindingValue,
} from '../model/editorChat';
import {
  callEditorChat,
  resolveEditorChatOperation,
  EditorChatTransportError,
} from './editorChatService';
import { createEditorChatOperationSession } from './editorChatOperationSession';
import { subscribeEditorChatOperation, EditorChatStorageError } from './editorChatOperationStorage';

export interface AdventurePersonaRead {
  base: EditorChatPersonaBinding;
  binding: EditorChatPersonaBinding;
}

/** A mounted actor's explicit binding editor; only operation headers survive reload. */
export function createAdventurePersonaService(options: {
  uid: string;
  adventureId: string;
  sceneId: string | null;
  check?: () => void;
  onInvalidated?: () => void;
}) {
  const { uid, adventureId, sceneId } = options;
  const user = auth.currentUser;
  let active = true,
    changed = false,
    busy = false;
  let confirmed: AdventurePersonaRead | null = null;
  let verifiedHandoff: EditorChatOperationRow | null | undefined;
  let deletedConversationProof: { id: string; token: string } | null = null;
  let retainedConversation: Pick<
    EditorChatOperationRow,
    'conversationId' | 'conversationToken' | 'turnId' | 'attemptToken'
  > | null = null;
  const controller = new AbortController();
  const scope: EditorChatJournalScope = {
    target: { kind: 'adventure', id: adventureId },
    resource: sceneId === null ? null : { kind: 'scene', id: sceneId },
  };
  const check = () => {
    options.check?.();
    if (!active || changed || !user || user.uid !== uid || auth.currentUser !== user)
      throw new EditorChatTransportError('editor-chat/identity-changed', false);
  };
  check();
  const invalidate = () => {
    if (!active || changed) return;
    changed = true;
    controller.abort();
    options.onInvalidated?.();
  };
  const unsubscribe = onAuthStateChanged(
    auth,
    (next) => {
      if (next !== user) invalidate();
    },
    invalidate,
  );
  const session = createEditorChatOperationSession({
    uid,
    scope,
    check,
    validateDeletedConversationForPersona: (original) =>
      deletedConversationProof !== null &&
      original.conversationId === deletedConversationProof.id &&
      original.conversationToken === deletedConversationProof.token &&
      canonicalEditorChatJSON(original) === canonicalEditorChatJSON(verifiedHandoff),
    controls: () => {
      // This executes after hashing and before the journal CAS: proof belongs to this exact row.
      if (
        verifiedHandoff === undefined ||
        canonicalEditorChatJSON(session.read()) !== canonicalEditorChatJSON(verifiedHandoff)
      )
        throw new EditorChatStorageError('conflict');
      return {
        projectToken: confirmed?.binding.adventureToken ?? null,
        resourceToken: null,
        contextId: null,
        contextToken: null,
        conversationId: retainedConversation?.conversationId ?? null,
        conversationToken: retainedConversation?.conversationToken ?? null,
        turnId: retainedConversation?.turnId ?? null,
        attemptToken: retainedConversation?.attemptToken ?? null,
        cleanupId: null,
        cleanupToken: null,
      };
    },
  });
  const pending = () => {
    const row = session.read();
    return row && row.state !== 'settled' ? row : null;
  };
  const read = async (id: string | null, token?: string) => {
    const value = await callEditorChat(
      uid,
      {
        action: 'getAdventurePersonaBinding',
        adventureId,
        sceneId: id,
        ...(token ? { adventureToken: token } : {}),
      },
      { check, signal: controller.signal },
    );
    check();
    const result = normalizeEditorChatDTO('personaBinding', value);
    if (
      result.ownerId !== uid ||
      result.adventureId !== adventureId ||
      result.sceneId !== id ||
      (token !== undefined && result.adventureToken !== token)
    )
      throw new EditorChatTransportError('editor-chat/invalid-response', false);
    return result;
  };
  const run = async <T>(work: () => Promise<T>): Promise<T> => {
    check();
    if (busy) throw new Error('Aguarde o pedido atual antes de continuar.');
    busy = true;
    try {
      const result = await work();
      check();
      return result;
    } finally {
      busy = false;
    }
  };
  const verifyControls = async (row: EditorChatOperationRow | null, adventureToken: string) => {
    retainedConversation = null;
    deletedConversationProof = null;
    if (!row) return;
    if (row.projectToken !== null && row.projectToken !== adventureToken)
      throw new EditorChatTransportError('editor-chat/identity-changed', false);
    let canceled: boolean | undefined;
    const canceledPlaceholder = async () => {
      if (canceled !== undefined) return canceled;
      const result = await resolveEditorChatOperation(uid, row, { check });
      check();
      canceled = result.state === 'settled' && result.receipt.outcome === 'canceled';
      return canceled;
    };
    let contextDeleted = false,
      conversationDeleted = false;
    if (row.cleanupId) {
      if (!row.cleanupToken) {
        if (
          row.cleanupId !== row.operationId ||
          !['deleteContext', 'deleteConversation'].includes(row.action) ||
          !(await canceledPlaceholder())
        )
          throw new Error('Conclua a limpeza do chat antes de alterar a persona.');
      } else {
        const cleanup = await callEditorChat(
          uid,
          { action: 'getCleanup', cleanupId: row.cleanupId, cleanupToken: row.cleanupToken },
          { check },
        );
        check();
        if (cleanup.state !== 'deleted')
          throw new Error('Conclua a limpeza do chat antes de alterar a persona.');
        contextDeleted =
          cleanup.subject.kind === 'context' &&
          cleanup.subject.id === row.contextId &&
          cleanup.subject.token === row.contextToken;
        conversationDeleted =
          cleanup.subject.kind === 'conversation' &&
          cleanup.subject.id === row.conversationId &&
          cleanup.subject.token === row.conversationToken;
        if (conversationDeleted)
          deletedConversationProof = { id: cleanup.subject.id, token: cleanup.subject.token };
      }
    }
    if (row.contextId && !contextDeleted) {
      if (!row.contextToken) {
        if (
          row.action !== 'prepareContext' ||
          row.contextId !== row.operationId ||
          !(await canceledPlaceholder())
        )
          throw new Error('Confira o contexto do chat antes de alterar a persona.');
      } else {
        if (scope.resource === null) throw new EditorChatStorageError('conflict');
        const context = await callEditorChat(
          uid,
          {
            action: 'getContext',
            target: scope.target,
            resource: scope.resource,
            contextId: row.contextId,
            contextToken: row.contextToken,
          },
          { check },
        );
        check();
        if (!['consumed', 'deleted'].includes(context.phase))
          throw new Error('Consuma ou exclua o contexto do chat antes de alterar a persona.');
      }
    }
    if (row.conversationId && !conversationDeleted) {
      if (!row.conversationToken || scope.resource === null)
        throw new EditorChatStorageError('conflict');
      // listMessages reauthorizes native project/resource identity and returns metadata only.
      await callEditorChat(
        uid,
        {
          action: 'listMessages',
          target: scope.target,
          resource: scope.resource,
          conversationId: row.conversationId,
          conversationToken: row.conversationToken,
          limit: 1,
        },
        { check },
      );
      check();
      retainedConversation = {
        conversationId: row.conversationId,
        conversationToken: row.conversationToken,
        turnId: row.turnId,
        attemptToken: row.attemptToken,
      };
    } else if (row.turnId && !conversationDeleted) throw new EditorChatStorageError('conflict');
  };
  return {
    pending,
    subscribe(listener: () => void) {
      check();
      return subscribeEditorChatOperation(uid, scope, () => {
        if (active && !changed && auth.currentUser === user) listener();
      });
    },
    load() {
      return run(async () => {
        const base = await read(null);
        const binding = sceneId === null ? base : await read(sceneId, base.adventureToken);
        if (sceneId !== null) {
          const finalBase = await read(null, base.adventureToken);
          if (finalBase.bindingToken !== base.bindingToken)
            throw new Error('A persona base mudou durante a consulta. Confira novamente.');
        }
        confirmed = { base, binding };
        return structuredClone(confirmed);
      });
    },
    save(value: EditorChatPersonaBindingValue) {
      return run(async () => {
        if (!confirmed) throw new Error('Confira o vínculo antes de salvar.');
        if (pending())
          throw new Error('Confira ou cancele a pendência antes de salvar outro vínculo.');
        const before = structuredClone(confirmed.binding);
        const original = session.read();
        await verifyControls(original, before.adventureToken);
        check();
        verifiedHandoff = original;
        let result;
        try {
          result = await session.execute(
            'setAdventurePersonaBinding',
            {
              operationId: crypto.randomUUID(),
              adventureId,
              adventureToken: before.adventureToken,
              sceneId,
              expectedBindingToken: before.bindingToken,
              value,
            },
            { signal: controller.signal },
          );
        } finally {
          verifiedHandoff = undefined;
          retainedConversation = null;
          deletedConversationProof = null;
        }
        check();
        if (
          result.current &&
          (result.current.ownerId !== uid ||
            result.current.adventureId !== adventureId ||
            result.current.adventureToken !== before.adventureToken ||
            result.current.sceneId !== sceneId ||
            result.current.sceneToken !== before.sceneToken)
        )
          throw new EditorChatTransportError('editor-chat/invalid-response', false);
        if (result.current)
          confirmed = {
            base: sceneId === null ? result.current : confirmed.base,
            binding: result.current,
          };
        return result;
      });
    },
    recover(intent: 'observe' | 'cancel') {
      return run(async () => {
        const row = pending();
        if (!row || row.action !== 'setAdventurePersonaBinding')
          throw new Error('Esta pendência deve ser conferida no chat que iniciou o pedido.');
        // Resolver uses the durable original fingerprint, never a reconstructed setter.
        return session.recover(intent);
      });
    },
    dispose() {
      active = false;
      controller.abort();
      unsubscribe();
      // Aborting a local projection is not cancellation or rollback on the server.
    },
  };
}
