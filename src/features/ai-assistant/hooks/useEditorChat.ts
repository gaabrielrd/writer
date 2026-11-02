import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/shared/lib';
import {
  canonicalEditorChatJSON,
  type EditorChatScope,
  type EditorChatOperationRow,
  type EditorChatReceipt,
  type EditorChatAction,
} from '../model/editorChat';
import type {
  EditorChatController,
  EditorChatByokControl,
  EditorChatControllerState,
  EditorChatControllerError,
  UseEditorChatOptions,
} from '../model/editorChatController';
import { callEditorChat, EditorChatTransportError } from '../services/editorChatService';
import { captureEditorChatHost } from '../services/editorChatHostService';
import {
  createEditorChatOperationSession,
  type EditorChatOperationControls,
} from '../services/editorChatOperationSession';
import {
  readEditorChatOperation,
  assertEditorChatOperation,
  subscribeEditorChatOperation,
  EditorChatStorageError,
} from '../services/editorChatOperationStorage';

function initial(scopeKey: string): EditorChatControllerState {
  return {
    scopeKey,
    catalogStatus: 'idle',
    messagesStatus: 'idle',
    conversations: [],
    catalog: null,
    conversation: null,
    conversationRef: null,
    messagePage: null,
    turns: [],
    questions: {},
    turnReads: {},
    context: null,
    contextRef: null,
    inspection: null,
    needsInspection: false,
    cleanup: null,
    cleanupRef: null,
    draft: '',
    stream: null,
    byokInput: null,
    pending: null,
    lastReceipt: null,
    busyAction: null,
    error: null,
  };
}
function withoutDerived(state: EditorChatControllerState): EditorChatControllerState {
  return {
    ...state,
    turnReads: {},
    inspection: null,
    needsInspection: Boolean(state.contextRef),
    stream: null,
    byokInput: null,
  };
}
function publicError(cause: unknown): EditorChatControllerError {
  if (cause instanceof EditorChatTransportError)
    return { code: cause.code, reason: cause.reason, uncertain: cause.uncertain };
  if (cause instanceof EditorChatStorageError)
    return { code: 'editor-chat/storage-' + cause.reason, reason: null, uncertain: false };
  return { code: 'editor-chat/unavailable', reason: null, uncertain: false };
}
function controllerRuntime(config: {
  uid: string;
  scope: EditorChatScope;
  key: string;
  enabled: boolean;
  options: () => UseEditorChatOptions;
  state: () => EditorChatControllerState;
  update: (change: (before: EditorChatControllerState) => EditorChatControllerState) => void;
}) {
  const { uid, scope, key, enabled, options, state, update } = config;
  let live = false;
  let actor = auth.currentUser;
  let epoch = 0;
  let lostActor = false;
  const owners = new Map<string, number>();
  let streamAbort: AbortController | null = null;
  let bindingProof: { row: string; projectToken: string; resourceToken: string } | null = null;
  const bindingOnly = (
    value: EditorChatOperationRow | null,
  ): value is EditorChatOperationRow & {
    action: 'setAdventurePersonaBinding';
    state: 'settled';
    resource: { kind: 'scene'; id: string };
    projectToken: string;
    resourceToken: null;
  } =>
    Boolean(
      value?.action === 'setAdventurePersonaBinding' &&
      value.state === 'settled' &&
      value.target.kind === 'adventure' &&
      value.resource?.kind === 'scene' &&
      value.projectToken &&
      value.resourceToken === null,
    );
  const bindingProven = (value: EditorChatOperationRow | null) =>
    Boolean(
      value &&
      bindingProof &&
      bindingProof.row === canonicalEditorChatJSON(value) &&
      state().catalog?.projectToken === bindingProof.projectToken &&
      state().catalog?.resourceToken === bindingProof.resourceToken,
    );
  const changed = () => {
    throw new EditorChatTransportError('editor-chat/identity-changed', false);
  };
  const checkActor = () => {
    const current = options();
    if (
      !live ||
      !enabled ||
      current.enabled === false ||
      lostActor ||
      !actor ||
      actor.uid !== uid ||
      auth.currentUser !== actor ||
      current.uid !== uid ||
      canonicalEditorChatJSON({ target: current.host.target, resource: current.host.resource }) !==
        canonicalEditorChatJSON(scope)
    )
      changed();
  };
  const checkHost = () => {
    checkActor();
    try {
      options().host.checkCurrent();
    } catch (cause) {
      invalidateDerived();
      throw cause;
    }
  };
  const guard = (host = true) => {
    const generation = epoch;
    return () => {
      checkActor();
      if (epoch !== generation) changed();
      if (host) checkHost();
    };
  };
  const ticket = (name: string, host = true) => {
    const check = guard(host);
    const version = (owners.get(name) ?? 0) + 1;
    owners.set(name, version);
    return () => {
      check();
      if (owners.get(name) !== version) changed();
    };
  };
  const report = (cause: unknown) => {
    try {
      checkActor();
    } catch {
      return;
    }
    const error = publicError(cause);
    update((s) => ({
      ...(error.code === 'editor-chat/identity-changed' ||
      ['provenance-revoked', 'identity-changed'].includes(error.reason ?? '')
        ? withoutDerived(s)
        : s),
      error,
    }));
  };
  const row = () => readEditorChatOperation(uid, scope);
  const refreshPending = () => {
    checkActor();
    const pending = row();
    update((s) => ({ ...s, pending }));
  };
  const invalidateDerived = (keepBindingProof = false) => {
    if (!live) return;
    epoch++;
    if (!keepBindingProof) bindingProof = null;
    streamAbort?.abort();
    streamAbort = null;
    update((s) => ({
      ...withoutDerived(s),
      busyAction: null,
      catalogStatus: s.catalogStatus === 'loading' ? 'idle' : s.catalogStatus,
      messagesStatus: s.messagesStatus === 'loading' ? 'idle' : s.messagesStatus,
    }));
  };
  const controls = (metadataOnly = false): Partial<EditorChatOperationControls> => {
    const s = state();
    const pending = row();
    if (bindingOnly(pending)) {
      const proven = bindingProven(pending);
      if (!metadataOnly && !proven) changed();
      return {
        projectToken: proven ? bindingProof!.projectToken : null,
        resourceToken: proven ? bindingProof!.resourceToken : null,
        contextId: pending.contextId,
        contextToken: pending.contextToken,
        conversationId: pending.conversationId,
        conversationToken: pending.conversationToken,
        turnId: pending.turnId,
        attemptToken: pending.attemptToken,
        cleanupId: pending.cleanupId,
        cleanupToken: pending.cleanupToken,
      };
    }
    const useOld = Boolean(metadataOnly && pending && pending.projectToken !== null);
    return {
      projectToken: useOld
        ? (pending?.projectToken ?? null)
        : (s.catalog?.projectToken ?? s.context?.projectToken ?? pending?.projectToken ?? null),
      resourceToken: useOld
        ? (pending?.resourceToken ?? null)
        : (s.catalog?.resourceToken ?? s.context?.resourceToken ?? pending?.resourceToken ?? null),
      contextId: s.contextRef?.id ?? null,
      contextToken: s.contextRef?.token ?? null,
      conversationId: s.conversationRef?.id ?? null,
      conversationToken: s.conversationRef?.token ?? null,
      turnId: s.conversation?.activeTurnId ?? s.stream?.turn.turnId ?? null,
      attemptToken: s.stream?.turn.attemptToken ?? null,
      cleanupId: s.cleanup?.state === 'deleted' ? null : (s.cleanupRef?.id ?? null),
      cleanupToken: s.cleanup?.state === 'deleted' ? null : (s.cleanupRef?.token ?? null),
    };
  };
  const ensureIncarnation = () => {
    const pending = row();
    const catalog = state().catalog;
    if (bindingOnly(pending)) {
      if (!bindingProven(pending)) changed();
      return;
    }
    if (
      pending?.projectToken &&
      catalog &&
      (pending.projectToken !== catalog.projectToken ||
        pending.resourceToken !== catalog.resourceToken) &&
      (state().contextRef ||
        state().conversationRef ||
        pending.state !== 'settled' ||
        (state().cleanup?.state !== 'deleted' && state().lastReceipt?.outcome !== 'canceled'))
    )
      throw new EditorChatTransportError('editor-chat/identity-changed', false);
  };
  const operation = (check: () => void, metadataOnly = false) => {
    const expected = row();
    const binding = bindingOnly(expected);
    const known = controls(metadataOnly);
    return createEditorChatOperationSession({
      uid,
      scope,
      check,
      controls: () => {
        if (binding) {
          assertEditorChatOperation(expected, check);
          if (known.resourceToken !== null && !bindingProven(expected)) changed();
        }
        return known;
      },
    });
  };
  const adoptReferences = (pending: EditorChatOperationRow | null) => {
    if (!pending) return;
    update((s) => ({
      ...s,
      contextRef:
        pending.contextId && pending.contextToken
          ? { id: pending.contextId, token: pending.contextToken }
          : s.contextRef,
      conversationRef:
        pending.conversationId && pending.conversationToken
          ? { id: pending.conversationId, token: pending.conversationToken }
          : s.conversationRef,
      cleanupRef:
        pending.cleanupId && pending.cleanupToken
          ? { id: pending.cleanupId, token: pending.cleanupToken }
          : s.cleanupRef,
    }));
  };
  const invalidateConversationReads = () => {
    for (const name of owners.keys())
      if (name === 'byok' || name.startsWith('turn:'))
        owners.set(name, (owners.get(name) ?? 0) + 1);
  };
  const confirmed = (receipt: EditorChatReceipt) => {
    invalidateConversationReads();
    // A receipt invalidates in-flight lists; it never supplies a current control revision.
    for (const name of ['catalog', 'messages', 'context', 'cleanup'])
      owners.set(name, (owners.get(name) ?? 0) + 1);
    update((s) => ({
      ...s,
      lastReceipt: receipt,
      catalogStatus: 'idle',
      messagesStatus: 'idle',
      catalog: s.catalog ? { ...s.catalog, nextCursor: null } : null,
      messagePage: null,
      inspection: null,
      needsInspection: Boolean(s.contextRef),
    }));
    if (receipt.outcome === 'confirmed') adoptReferences(row());
  };
  const write = async (
    action: EditorChatAction | 'capture',
    work: (check: () => void) => Promise<void>,
    metadataOnly = false,
  ) => {
    const generation = epoch;
    try {
      (metadataOnly ? checkActor : checkHost)();
      if (state().busyAction) throw new EditorChatStorageError('conflict');
      if (!metadataOnly) ensureIncarnation();
      const check = guard(!metadataOnly);
      update((s) => ({ ...s, busyAction: action, error: null }));
      try {
        await work(check);
        check();
      } finally {
        try {
          check();
          refreshPending();
          update((s) => ({ ...s, busyAction: null }));
        } catch {
          /* The new lifecycle owns its own state. */
        }
      }
    } catch (cause) {
      if (epoch === generation) report(cause);
    }
  };
  const read = async (name: string, work: (check: () => void) => Promise<void>, host = true) => {
    const check = ticket(name, host);
    try {
      check();
      await work(check);
      check();
    } catch (cause) {
      try {
        check();
        report(cause);
      } catch {
        /* Superseded read has no authority to publish. */
      }
    }
  };
  const catalogPage = async (more: boolean) =>
    read('catalog', async (check) => {
      const previous = state().catalog;
      const before = row();
      if (more && !previous?.nextCursor) return;
      if (bindingOnly(before)) bindingProof = null;
      update((s) => ({ ...s, catalogStatus: 'loading', error: null }));
      try {
        const page = await callEditorChat(
          uid,
          {
            action: 'listConversations',
            ...scope,
            ...(more && previous
              ? {
                  cursor: previous.nextCursor!,
                  projectToken: previous.projectToken,
                  resourceToken: previous.resourceToken,
                }
              : {}),
          },
          { check },
        );
        check();
        if (
          more &&
          previous &&
          (page.collectionRevision !== previous.collectionRevision ||
            page.projectToken !== previous.projectToken ||
            page.resourceToken !== previous.resourceToken)
        )
          throw new EditorChatTransportError(
            'functions/failed-precondition',
            false,
            'cursor-stale',
          );
        let proof: typeof bindingProof = null;
        if (bindingOnly(before)) {
          assertEditorChatOperation(before, check);
          if (before.projectToken !== page.projectToken) changed();
          if (before.conversationId && before.conversationToken) {
            await callEditorChat(
              uid,
              {
                action: 'listMessages',
                ...scope,
                conversationId: before.conversationId,
                conversationToken: before.conversationToken,
              },
              { check },
            );
            assertEditorChatOperation(before, check);
          }
          if (before.contextId && before.contextToken) {
            const context = await callEditorChat(
              uid,
              {
                action: 'getContext',
                ...scope,
                contextId: before.contextId,
                contextToken: before.contextToken,
              },
              { check },
            );
            assertEditorChatOperation(before, check);
            if (
              !['consumed', 'deleted'].includes(context.phase) ||
              context.projectToken !== page.projectToken ||
              context.resourceToken !== page.resourceToken
            )
              changed();
          }
          if (before.cleanupId && before.cleanupToken) {
            const cleanup = await callEditorChat(
              uid,
              {
                action: 'getCleanup',
                cleanupId: before.cleanupId,
                cleanupToken: before.cleanupToken,
              },
              { check },
            );
            assertEditorChatOperation(before, check);
            if (cleanup.state !== 'deleted') changed();
          }
          proof = {
            row: canonicalEditorChatJSON(before),
            projectToken: page.projectToken,
            resourceToken: page.resourceToken,
          };
        }
        const old = row();
        const identityChanged =
          (previous &&
            (previous.projectToken !== page.projectToken ||
              previous.resourceToken !== page.resourceToken)) ||
          (old?.projectToken &&
            (old.projectToken !== page.projectToken ||
              (old.resourceToken !== page.resourceToken && !proof)));
        if (identityChanged) invalidateDerived();
        else bindingProof = proof;
        update((s) => ({
          ...s,
          catalog: page,
          conversations: more ? [...s.conversations, ...page.items] : page.items,
          catalogStatus: 'ready',
          error: identityChanged
            ? { code: 'editor-chat/identity-changed', reason: 'identity-changed', uncertain: false }
            : null,
        }));
      } catch (cause) {
        check();
        update((s) => ({
          ...s,
          catalogStatus: 'error',
          catalog: s.catalog ? { ...s.catalog, nextCursor: null } : null,
        }));
        throw cause;
      }
    });
  const messagesPage = async (more: boolean) =>
    read('messages', async (check) => {
      const selected = state().conversationRef;
      const previous = state().messagePage;
      if (!selected || (more && !previous?.nextCursor)) return;
      update((s) => ({ ...s, messagesStatus: 'loading', error: null }));
      try {
        const page = await callEditorChat(
          uid,
          {
            action: 'listMessages',
            ...scope,
            conversationId: selected.id,
            conversationToken: selected.token,
            ...(more && previous ? { cursor: previous.nextCursor! } : {}),
          },
          { check },
        );
        check();
        if (more && previous && page.conversationRevision !== previous.conversationRevision)
          throw new EditorChatTransportError(
            'functions/failed-precondition',
            false,
            'cursor-stale',
          );
        update((s) => ({
          ...s,
          messagePage: page,
          turns: more ? [...s.turns, ...page.items] : page.items,
          messagesStatus: 'ready',
        }));
      } catch (cause) {
        check();
        if (bindingOnly(row())) bindingProof = null;
        update((s) => ({
          ...s,
          messagesStatus: 'error',
          messagePage: s.messagePage ? { ...s.messagePage, nextCursor: null } : null,
        }));
        throw cause;
      }
    });
  const refreshControls = async () => {
    checkActor();
    adoptReferences(row());
    const s = state();
    if (s.cleanupRef)
      await read(
        'cleanup',
        async (check) => {
          const current = await callEditorChat(
            uid,
            {
              action: 'getCleanup',
              cleanupId: s.cleanupRef!.id,
              cleanupToken: s.cleanupRef!.token,
            },
            { check },
          );
          check();
          adoptCleanup(current);
        },
        false,
      );
    if (state().contextRef)
      await read(
        'context',
        async (check) => {
          const ref = state().contextRef!;
          const current = await callEditorChat(
            uid,
            { action: 'getContext', ...scope, contextId: ref.id, contextToken: ref.token },
            { check },
          );
          check();
          update((v) => ({
            ...v,
            context: current,
            inspection: null,
            needsInspection: current.phase === 'ready',
          }));
        },
        false,
      );
    if (state().conversationRef) await messagesPage(false);
  };
  const adoptCleanup = (current: EditorChatControllerState['cleanup']) => {
    if (!current) return;
    if (current.subject.kind === 'conversation') invalidateConversationReads();
    update((s) => {
      let next = {
        ...s,
        cleanup: current,
        cleanupRef: { id: current.cleanupId, token: current.cleanupToken },
      };
      if (
        current.state === 'deleted' &&
        current.subject.kind === 'context' &&
        current.subject.id === s.contextRef?.id &&
        current.subject.token === s.contextRef.token
      )
        next = {
          ...next,
          context: null,
          contextRef: null,
          inspection: null,
          needsInspection: false,
        };
      if (
        current.state === 'deleted' &&
        current.subject.kind === 'conversation' &&
        current.subject.id === s.conversationRef?.id &&
        current.subject.token === s.conversationRef.token
      )
        next = {
          ...next,
          conversation: null,
          conversationRef: null,
          messagePage: null,
          turns: [],
          questions: {},
          turnReads: {},
          stream: null,
          byokInput: null,
        };
      return next;
    });
  };
  const byokAttempt = (control: EditorChatByokControl) => {
    const s = state();
    const input = s.byokInput;
    const turn = s.turns.find((t) => t.turnId === control.turnId);
    if (
      !s.conversationRef ||
      s.conversationRef.id !== control.conversationId ||
      s.conversationRef.token !== control.conversationToken ||
      !input ||
      input.turnId !== control.turnId ||
      input.attemptToken !== control.attemptToken ||
      !turn ||
      turn.conversationId !== control.conversationId ||
      turn.attemptToken !== control.attemptToken ||
      turn.state !== 'awaiting-byok' ||
      canonicalEditorChatJSON(turn.generation) !== canonicalEditorChatJSON(input.generation)
    )
      throw new EditorChatTransportError('editor-chat/identity-changed', false);
    return input.generation;
  };
  const methods: Omit<EditorChatController, 'state' | 'hasUnsentDraft'> = {
    setDraft(text) {
      try {
        checkActor();
        update((s) => ({ ...s, draft: text }));
      } catch (cause) {
        report(cause);
      }
    },
    refreshConversations: () => catalogPage(false),
    loadMoreConversations: () => catalogPage(true),
    async createConversation() {
      await write('createConversation', async (check) => {
        const catalog = state().catalog;
        if (!catalog) throw new Error('Load the catalog first.');
        const id = crypto.randomUUID();
        const result = await operation(check).execute('createConversation', {
          ...scope,
          operationId: id,
          conversationId: id,
          projectToken: catalog.projectToken,
          resourceToken: catalog.resourceToken,
        });
        check();
        confirmed(result.receipt);
        if (result.current)
          update((s) => ({
            ...s,
            conversation: result.current,
            conversationRef: {
              id: result.current!.conversationId,
              token: result.current!.conversationToken,
            },
            messagePage: null,
            turns: [],
            questions: {},
            turnReads: {},
          }));
      });
    },
    async selectConversation(id) {
      try {
        checkHost();
        if (state().busyAction) throw new EditorChatStorageError('conflict');
        const conversation = state().conversations.find((item) => item.conversationId === id);
        if (!conversation) throw new Error('Unknown conversation.');
        // Selecting a conversation in this scope is not a source invalidation.
        // Its metadata read below still rejects and clears a failed native proof.
        invalidateDerived(true);
        update((s) => ({
          ...s,
          conversation,
          conversationRef: {
            id: conversation.conversationId,
            token: conversation.conversationToken,
          },
          turns: [],
          questions: {},
          turnReads: {},
          messagePage: null,
          messagesStatus: 'idle',
        }));
        await messagesPage(false);
      } catch (cause) {
        report(cause);
      }
    },
    async renameConversation(title) {
      await write('renameConversation', async (check) => {
        const conversation = state().conversation;
        if (!conversation) throw new Error('Select a conversation first.');
        const result = await operation(check).execute('renameConversation', {
          ...scope,
          operationId: crypto.randomUUID(),
          conversationId: conversation.conversationId,
          conversationToken: conversation.conversationToken,
          expectedRevision: conversation.revision,
          title,
        });
        check();
        confirmed(result.receipt);
        if (result.current) update((s) => ({ ...s, conversation: result.current }));
      });
    },
    loadMoreMessages: () => messagesPage(Boolean(state().messagePage)),
    async readTurn(id) {
      await read('turn:' + id, async (check) => {
        const selected = state().conversationRef;
        if (!selected) throw new Error('Select a conversation first.');
        const current = await callEditorChat(
          uid,
          {
            action: 'getTurn',
            ...scope,
            conversationId: selected.id,
            conversationToken: selected.token,
            turnId: id,
          },
          { check },
        );
        check();
        update((s) => ({
          ...s,
          questions: { ...s.questions, [id]: current.question },
          turnReads: { ...s.turnReads, [id]: current },
          turns: s.turns.some((t) => t.turnId === id)
            ? s.turns.map((t) => (t.turnId === id ? current.turn : t))
            : [...s.turns, current.turn],
          ...(current.presentation === 'blocked' ? { stream: null, byokInput: null } : {}),
        }));
      });
    },
    async prepareContext(source) {
      await write('capture', async (check) => {
        const previous = state().context;
        if (
          state().cleanup?.state === 'deleting' ||
          (state().contextRef && (!previous || !['consumed', 'deleted'].includes(previous.phase)))
        )
          throw new EditorChatStorageError('conflict');
        const id = crypto.randomUUID();
        await captureEditorChatHost(uid, options().host, source, {
          check,
          withCapture: async (own, checkCurrent) => {
            const scopedCheck = () => {
              check();
              checkCurrent();
            };
            scopedCheck();
            const result = await operation(scopedCheck).execute('prepareContext', {
              ...scope,
              operationId: id,
              contextId: id,
              ...own,
            });
            scopedCheck();
            confirmed(result.receipt);
            update((s) => ({
              ...s,
              context: result.current,
              inspection: null,
              needsInspection: result.current?.phase === 'ready',
            }));
          },
        });
        check();
      });
    },
    async advanceContext() {
      await write('advanceContext', async (check) => {
        const context = state().context;
        if (!context || !['local', 'global'].includes(context.phase))
          throw new Error('Context cannot advance.');
        const result = await operation(check).execute('advanceContext', {
          ...scope,
          operationId: crypto.randomUUID(),
          contextId: context.contextId,
          contextToken: context.contextToken,
          expectedRevision: context.revision,
        });
        check();
        confirmed(result.receipt);
        update((s) => ({
          ...s,
          context: result.current,
          inspection: null,
          needsInspection: result.current?.phase === 'ready',
        }));
      });
    },
    async inspectContext() {
      await read('context', async (check) => {
        const context = state().context;
        if (!context) throw new Error('Prepare a context first.');
        const inspection = await callEditorChat(
          uid,
          {
            action: 'inspectContext',
            ...scope,
            contextId: context.contextId,
            contextToken: context.contextToken,
            expectedRevision: context.revision,
          },
          { check },
        );
        check();
        update((s) => ({ ...s, context: inspection.context, inspection, needsInspection: false }));
      });
    },
    async send(generation) {
      await write('send', async (check) => {
        const s = state();
        const conversation = s.conversationRef;
        const context = s.context;
        const revision = s.messagePage?.conversationRevision ?? s.conversation?.revision;
        if (
          !conversation ||
          !context ||
          context.phase !== 'ready' ||
          !s.inspection?.frozen ||
          s.inspection.freshness !== 'current' ||
          s.needsInspection ||
          revision === undefined
        )
          throw new Error('Inspect a ready context and conversation first.');
        const prompt = s.draft;
        const id = crypto.randomUUID();
        streamAbort = new AbortController();
        const result = await operation(check).execute(
          'send',
          {
            ...scope,
            operationId: id,
            conversationId: conversation.id,
            conversationToken: conversation.token,
            contextId: context.contextId,
            contextToken: context.contextToken,
            expectedConversationRevision: revision,
            expectedContextRevision: context.revision,
            prompt,
            generation,
          },
          {
            signal: streamAbort.signal,
            onEvent: (event) => {
              check();
              if (event.type === 'started')
                update((v) => ({ ...v, stream: { turn: event.turn, text: '' } }));
              if (event.type === 'delta')
                update((v) => ({
                  ...v,
                  stream: v.stream ? { ...v.stream, text: v.stream.text + event.text } : null,
                }));
              if (event.type === 'settled')
                update((v) => ({
                  ...v,
                  stream: v.stream ? { ...v.stream, turn: event.turn } : null,
                }));
            },
          },
        );
        check();
        streamAbort = null;
        confirmed(result.receipt);
        update((v) => ({
          ...v,
          stream: null,
          byokInput: result.byokInput,
          context: null,
          inspection: null,
          needsInspection: false,
          draft: result.receipt.outcome === 'confirmed' && v.draft === prompt ? '' : v.draft,
          questions:
            result.receipt.outcome === 'confirmed' ? { ...v.questions, [id]: prompt } : v.questions,
          turns: result.turn ? [...v.turns.filter((t) => t.turnId !== id), result.turn] : v.turns,
        }));
      });
    },
    async recoverPending(intent) {
      await write(
        'resolveOperation',
        async (check) => {
          update((s) => withoutDerived(s));
          const result = await operation(check, true).recover(intent);
          check();
          if (result.state === 'settled') {
            confirmed(result.receipt);
            await refreshControls();
            check();
          }
        },
        true,
      );
    },
    async stopTurn() {
      if (state().busyAction === 'send') {
        invalidateDerived();
        await methods.recoverPending('observe');
        const pending = state().pending;
        if (!pending || pending.state !== 'settled') return;
        if (pending.turnId) await methods.readTurn(pending.turnId);
      }
      await write('stopTurn', async (check) => {
        const s = state();
        const turn =
          s.turns.find((item) => item.turnId === s.conversation?.activeTurnId) ??
          [...s.turns].reverse().find((item) => ['running', 'awaiting-byok'].includes(item.state));
        const conversation = s.conversationRef;
        if (!turn || !conversation) throw new Error('Resolve the send claim before stopping.');
        const result = await operation(check).execute('stopTurn', {
          ...scope,
          operationId: crypto.randomUUID(),
          conversationId: conversation.id,
          conversationToken: conversation.token,
          turnId: turn.turnId,
          attemptToken: turn.attemptToken,
        });
        check();
        confirmed(result.receipt);
        if (result.current)
          update((v) => ({
            ...v,
            turns: v.turns.map((t) => (t.turnId === turn.turnId ? result.current! : t)),
            stream: null,
            byokInput: null,
          }));
      });
    },
    async getByokInput() {
      const checkReturn = guard();
      const authorized: {
        value: {
          control: EditorChatByokControl;
          input: NonNullable<EditorChatControllerState['byokInput']>;
        } | null;
      } = { value: null };
      await read('byok', async (check) => {
        const s = state();
        const selected = s.conversationRef;
        const turn = [...s.turns]
          .reverse()
          .find((t) => t.provider === 'byok' && t.state === 'awaiting-byok');
        if (!selected || !turn) throw new Error('No BYOK attempt available.');
        const control = Object.freeze({
          conversationId: selected.id,
          conversationToken: selected.token,
          turnId: turn.turnId,
          attemptToken: turn.attemptToken,
        });
        const current = await callEditorChat(
          uid,
          { action: 'getByokInput', ...scope, ...control },
          { check },
        );
        check();
        if (
          canonicalEditorChatJSON(current.turn.generation) !==
          canonicalEditorChatJSON(turn.generation)
        )
          throw new EditorChatTransportError('editor-chat/invalid-response', false);
        update((v) => ({
          ...v,
          byokInput: current.input,
          turns: v.turns.map((t) => (t.turnId === turn.turnId ? current.turn : t)),
        }));
        if (current.input) authorized.value = { control, input: current.input };
      });
      try {
        checkReturn();
        if (authorized.value) byokAttempt(authorized.value.control);
        return authorized.value;
      } catch {
        return null;
      }
    },
    async completeBYOK(rawAnswer, control) {
      await write('completeBYOK', async (outerCheck) => {
        const generation = canonicalEditorChatJSON(byokAttempt(control));
        const check = () => {
          outerCheck();
          if (canonicalEditorChatJSON(byokAttempt(control)) !== generation) changed();
        };
        const result = await operation(check).execute(
          'completeBYOK',
          { ...scope, ...control, operationId: crypto.randomUUID(), rawAnswer },
          { frozenGeneration: byokAttempt(control).requested },
        );
        check();
        confirmed(result.receipt);
        update((v) => ({
          ...v,
          byokInput: null,
          stream: null,
          turns: result.current
            ? v.turns.map((t) => (t.turnId === control.turnId ? result.current! : t))
            : v.turns,
        }));
        await methods.readTurn(control.turnId);
      });
    },
    async failBYOK(reason, control) {
      await write('failBYOK', async (outerCheck) => {
        const generation = canonicalEditorChatJSON(byokAttempt(control));
        const check = () => {
          outerCheck();
          if (canonicalEditorChatJSON(byokAttempt(control)) !== generation) changed();
        };
        const result = await operation(check).execute(
          'failBYOK',
          { ...scope, ...control, operationId: crypto.randomUUID(), reason },
          { frozenGeneration: byokAttempt(control).requested },
        );
        check();
        confirmed(result.receipt);
        update((v) => ({
          ...v,
          byokInput: null,
          stream: null,
          turns: result.current
            ? v.turns.map((t) => (t.turnId === control.turnId ? result.current! : t))
            : v.turns,
        }));
        await methods.readTurn(control.turnId);
      });
    },
    async deleteContext() {
      await write(
        'deleteContext',
        async (check) => {
          const ref = state().contextRef;
          if (!ref) throw new Error('No context to delete.');
          const result = await operation(check, true).execute('deleteContext', {
            ...scope,
            operationId: crypto.randomUUID(),
            contextId: ref.id,
            contextToken: ref.token,
          });
          check();
          confirmed(result.receipt);
          adoptCleanup(result.current);
        },
        true,
      );
    },
    async deleteConversation() {
      await write(
        'deleteConversation',
        async (check) => {
          const ref = state().conversationRef;
          if (!ref) throw new Error('No conversation to delete.');
          const result = await operation(check, true).execute('deleteConversation', {
            ...scope,
            operationId: crypto.randomUUID(),
            conversationId: ref.id,
            conversationToken: ref.token,
          });
          check();
          confirmed(result.receipt);
          adoptCleanup(result.current);
        },
        true,
      );
    },
    async advanceCleanup() {
      await write(
        'advanceCleanup',
        async (check) => {
          const cleanup = state().cleanup;
          if (!cleanup || cleanup.state !== 'deleting') throw new Error('Refresh cleanup first.');
          const result = await operation(check, true).execute('advanceCleanup', {
            operationId: crypto.randomUUID(),
            cleanupId: cleanup.cleanupId,
            cleanupToken: cleanup.cleanupToken,
            expectedRevision: cleanup.revision,
          });
          check();
          confirmed(result.receipt);
          adoptCleanup(result.current);
        },
        true,
      );
    },
    async refreshKnownControl() {
      try {
        checkActor();
        await refreshControls();
      } catch (cause) {
        report(cause);
      }
    },
    invalidateDerived,
  };
  return {
    methods,
    start() {
      live = true;
      actor = auth.currentUser;
      lostActor = false;
      const previous = state();
      update(() => ({ ...initial(key), draft: previous.scopeKey === key ? previous.draft : '' }));
      try {
        refreshPending();
        adoptReferences(row());
      } catch (cause) {
        report(cause);
      }
      const unsubscribe = onAuthStateChanged(
        auth,
        (current) => {
          if (current !== actor) {
            lostActor = true;
            epoch++;
            streamAbort?.abort();
            update(() => initial(key));
          }
        },
        () => {
          lostActor = true;
          epoch++;
          streamAbort?.abort();
          update(() => initial(key));
        },
      );
      const storage = subscribeEditorChatOperation(uid, scope, () => {
        try {
          refreshPending();
        } catch (cause) {
          report(cause);
        }
      });
      const focus = () => invalidateDerived();
      window.addEventListener('focus', focus);
      return () => {
        live = false;
        epoch++;
        streamAbort?.abort();
        unsubscribe();
        storage();
        window.removeEventListener('focus', focus);
      };
    },
  };
}

/** Private chat state for one actor/target/resource, independent of any presentation. */
export function useEditorChat(options: UseEditorChatOptions): EditorChatController {
  const { uid, enabled = true } = options;
  const targetKind = options.host.target.kind;
  const targetId = options.host.target.id;
  const resourceKind = options.host.resource.kind;
  const resourceId = options.host.resource.id;
  const scope = useMemo(
    () => ({
      target: { kind: targetKind, id: targetId },
      resource: { kind: resourceKind, id: resourceId },
    }),
    [targetKind, targetId, resourceKind, resourceId],
  );
  const key = canonicalEditorChatJSON({ uid, ...scope });
  const current = useRef(options);
  const [state, setState] = useState(() => initial(key));
  const stateRef = useRef(state);
  const update = useCallback(
    (change: (before: EditorChatControllerState) => EditorChatControllerState) => {
      const next = change(stateRef.current);
      stateRef.current = next;
      setState(next);
    },
    [],
  );
  useLayoutEffect(() => {
    current.current = options;
  });
  const runtimeRef = useRef<ReturnType<typeof controllerRuntime> | null>(null);
  useLayoutEffect(() => {
    const runtime = controllerRuntime({
      uid,
      scope,
      key,
      enabled,
      options: () => current.current,
      state: () => stateRef.current,
      update,
    });
    runtimeRef.current = runtime;
    const stop = runtime.start();
    return () => {
      if (runtimeRef.current === runtime) runtimeRef.current = null;
      stop();
    };
  }, [uid, key, scope, enabled, update]);
  const priorHint = useRef(options.invalidationKey);
  useLayoutEffect(() => {
    if (priorHint.current !== options.invalidationKey) {
      priorHint.current = options.invalidationKey;
      runtimeRef.current?.methods.invalidateDerived();
    }
  }, [options.invalidationKey]);
  const methods = useMemo<Omit<EditorChatController, 'state' | 'hasUnsentDraft'>>(
    () => ({
      setDraft(text) {
        runtimeRef.current?.methods.setDraft(text);
      },
      invalidateDerived() {
        runtimeRef.current?.methods.invalidateDerived();
      },
      async refreshConversations() {
        await runtimeRef.current?.methods.refreshConversations();
      },
      async loadMoreConversations() {
        await runtimeRef.current?.methods.loadMoreConversations();
      },
      async createConversation() {
        await runtimeRef.current?.methods.createConversation();
      },
      async selectConversation(id) {
        await runtimeRef.current?.methods.selectConversation(id);
      },
      async renameConversation(title) {
        await runtimeRef.current?.methods.renameConversation(title);
      },
      async loadMoreMessages() {
        await runtimeRef.current?.methods.loadMoreMessages();
      },
      async readTurn(id) {
        await runtimeRef.current?.methods.readTurn(id);
      },
      async prepareContext(source) {
        await runtimeRef.current?.methods.prepareContext(source);
      },
      async advanceContext() {
        await runtimeRef.current?.methods.advanceContext();
      },
      async inspectContext() {
        await runtimeRef.current?.methods.inspectContext();
      },
      async send(generation) {
        await runtimeRef.current?.methods.send(generation);
      },
      async recoverPending(intent) {
        await runtimeRef.current?.methods.recoverPending(intent);
      },
      async stopTurn() {
        await runtimeRef.current?.methods.stopTurn();
      },
      async getByokInput() {
        return (await runtimeRef.current?.methods.getByokInput()) ?? null;
      },
      async completeBYOK(rawAnswer, control) {
        await runtimeRef.current?.methods.completeBYOK(rawAnswer, control);
      },
      async failBYOK(reason, control) {
        await runtimeRef.current?.methods.failBYOK(reason, control);
      },
      async deleteContext() {
        await runtimeRef.current?.methods.deleteContext();
      },
      async deleteConversation() {
        await runtimeRef.current?.methods.deleteConversation();
      },
      async advanceCleanup() {
        await runtimeRef.current?.methods.advanceCleanup();
      },
      async refreshKnownControl() {
        await runtimeRef.current?.methods.refreshKnownControl();
      },
    }),
    [],
  );
  const visible =
    state.scopeKey !== key
      ? initial(key)
      : enabled
        ? state
        : { ...initial(key), draft: state.draft };
  return { ...methods, state: visible, hasUnsentDraft: visible.draft.length > 0 };
}
