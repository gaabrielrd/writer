import { useLayoutEffect, useRef, useState } from 'react';
import type { EditorChatController } from '../model/editorChatController';
import {
  applyEditorChatSuggestion,
  type EditorChatApplyHost,
  type EditorChatApplyInput,
} from '../services/editorChatApplyService';
import { EditorChatByokError, runEditorChatByok } from '../services/editorChatByokService';

export function useEditorChatActions(options: {
  uid: string;
  host: EditorChatApplyHost;
  controller: EditorChatController;
  enabled: boolean;
  invalidationKey?: string | number;
  onApplied?: (check: () => void) => void;
}) {
  const key = JSON.stringify([
    options.uid,
    options.host.target,
    options.host.resource,
    options.controller.state.conversationRef,
    options.enabled,
    options.invalidationKey,
  ]);
  const [activity, setActivity] = useState<{ key: string; kind: 'byok' | 'apply' | null }>({
    key,
    kind: null,
  });
  if (activity.key !== key) setActivity({ key, kind: null });
  const live = useRef(options);
  const runtime = useRef({
    epoch: 0,
    busy: false,
    provider: null as AbortController | null,
    providerTurnId: null as string | null,
  });
  useLayoutEffect(() => {
    live.current = options;
  });
  useLayoutEffect(() => {
    const current = runtime.current;
    current.epoch++;
    current.busy = false;
    return () => {
      current.epoch++;
      current.provider?.abort();
      current.provider = null;
      current.providerTurnId = null;
      current.busy = false;
    };
  }, [key]);
  useLayoutEffect(() => {
    const current = runtime.current;
    const turn = options.controller.state.turns.find(
      (item) => item.turnId === current.providerTurnId,
    );
    if (turn && turn.state !== 'awaiting-byok') current.provider?.abort();
  }, [options.controller.state.turns]);
  const reserve = () => {
    const original = live.current,
      epoch = runtime.current.epoch;
    if (!original.enabled || runtime.current.busy)
      throw new Error('Aguarde a operação em andamento.');
    original.host.checkCurrent();
    const identity = JSON.stringify([
      original.uid,
      original.host.target,
      original.host.resource,
      original.controller.state.conversationRef,
    ]);
    const check = () => {
      const current = live.current;
      if (
        epoch !== runtime.current.epoch ||
        !current.enabled ||
        JSON.stringify([
          current.uid,
          current.host.target,
          current.host.resource,
          current.controller.state.conversationRef,
        ]) !== identity
      )
        throw new Error('A conversa ou o editor mudou. Confira a tentativa antes de continuar.');
      current.host.checkCurrent();
    };
    runtime.current.busy = true;
    return { original, check, epoch };
  };
  return {
    byokRunning: activity.key === key && activity.kind === 'byok',
    applying: activity.key === key && activity.kind === 'apply',
    async onApply(this: void, input: EditorChatApplyInput) {
      const { original, check, epoch } = reserve();
      setActivity({ key, kind: 'apply' });
      const host: EditorChatApplyHost = {
        target: original.host.target,
        resource: original.host.resource,
        checkCurrent: check,
        getBridge: () => original.host.getBridge(),
        getConfirmedSnapshot: () => original.host.getConfirmedSnapshot(),
        runExclusive: (work) => original.host.runExclusive(work),
        acceptConfirmed: (source) => original.host.acceptConfirmed(source),
        prepareAdoption: original.host.prepareAdoption
          ? (source) => original.host.prepareAdoption!(source)
          : undefined,
      };
      try {
        await applyEditorChatSuggestion(original.uid, host, input);
        check();
        live.current.onApplied?.(check);
        live.current.controller.invalidateDerived();
        await live.current.controller.refreshKnownControl();
      } finally {
        if (epoch === runtime.current.epoch) {
          runtime.current.busy = false;
          setActivity({ key, kind: null });
        }
      }
    },
    async onRunByok(this: void) {
      const { original, check, epoch } = reserve();
      const abort = new AbortController();
      runtime.current.provider = abort;
      setActivity({ key, kind: 'byok' });
      try {
        const prepared = await original.controller.getByokInput();
        check();
        if (!prepared) return;
        runtime.current.providerTurnId = prepared.control.turnId;
        try {
          const raw = await runEditorChatByok(prepared.input, { signal: abort.signal, check });
          check();
          abort.signal.throwIfAborted();
          await live.current.controller.completeBYOK(raw, prepared.control);
        } catch (cause) {
          if (abort.signal.aborted) return;
          check();
          if (cause instanceof EditorChatByokError)
            await live.current.controller.failBYOK(cause.reason, prepared.control);
          throw cause;
        }
      } finally {
        if (runtime.current.provider === abort) {
          runtime.current.provider = null;
          runtime.current.providerTurnId = null;
        }
        if (epoch === runtime.current.epoch) {
          runtime.current.busy = false;
          setActivity({ key, kind: null });
        }
      }
    },
  };
}
