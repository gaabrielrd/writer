import { useEffect, useRef, useState } from 'react';
import { publishInvalidation } from '@/shared/services';
import type {
  AdventureLorePending,
  AdventureLoreSummary,
  AdventureLoreSave,
  AdventureLoreWrite,
} from '../model/adventureLore';
import { useAdventureLoreContext } from './useAdventureLoreContext';
import * as api from '../services/adventureLoreService';
export function useAdventureLoreCollection(adventureId: string) {
  const context = useAdventureLoreContext(adventureId),
    { uid } = context;
  const identity = JSON.stringify([uid, adventureId]),
    actor = useRef(identity),
    alive = useRef(false),
    listOwner = useRef(0),
    operationOwner = useRef(0);
  // eslint-disable-next-line react-hooks/refs
  actor.current = identity;
  const [items, setItems] = useState<AdventureLoreSummary[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [pending, setPending] = useState<AdventureLorePending | null>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const reserved = useRef(false),
    pendingRef = useRef(pending);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, [identity]);
  const active = () => alive.current && actor.current === identity;
  async function load(more = false) {
    const snapshot = context.context;
    if (!snapshot || !context.isCurrent(snapshot)) return;
    const own = ++listOwner.current;
    setLoading(true);
    setError('');
    try {
      const input = {
        adventureId,
        adventureToken: snapshot.identity.adventureToken,
        scope: 'adventure' as const,
        limit: 25,
        cursor: more ? cursor : null,
      };
      const value = api.validateAdventureLoreList(await api.listAdventureLore(input), uid, input);
      if (!active() || listOwner.current !== own || !context.isCurrent(snapshot)) return;
      if (
        value.contextToken !== snapshot.identity.contextToken ||
        value.collectionRevision !== snapshot.identity.collectionRevision
      )
        api.invalidLore('O contexto mudou. Atualize o lore antes de continuar.');
      setItems((previous) => (more ? [...previous, ...value.items] : value.items));
      setCursor(value.nextCursor);
    } catch (cause) {
      if (active() && listOwner.current === own) {
        setError(api.loreMessage(cause));
        setCursor(null);
      }
    } finally {
      if (active() && listOwner.current === own) setLoading(false);
    }
  }
  useEffect(() => {
    listOwner.current++;
    let current = true;
    queueMicrotask(() => {
      if (!current) return;
      setCursor(null);
      if (context.context) void load();
    });
    return () => {
      current = false;
    };
  }, [context.context]); // eslint-disable-line react-hooks/exhaustive-deps
  async function run(p: AdventureLorePending, cancel = false) {
    if (reserved.current || !active()) throw new Error('Há um pedido em andamento.');
    reserved.current = true;
    setBusy(true);
    setError('');
    const own = ++operationOwner.current;
    try {
      const result = api.validateAdventureLoreOutcome(
        await (cancel ? api.cancelAdventureLoreOperation(p) : api.sendAdventureLoreOperation(p)),
        uid,
        p,
      );
      if (!active() || operationOwner.current !== own) return false;
      pendingRef.current = null;
      setPending(null);
      listOwner.current++;
      setCursor(null);
      setNotice(
        result.kind === 'confirmed'
          ? 'Pedido confirmado. Atualize ou abra a ficha atual; o recibo não substitui seu rascunho.'
          : 'Pedido encerrado. Seu rascunho foi preservado.',
      );
      publishInvalidation({ actorId: uid, scope: 'lore-context' });
      context.refresh();
      return result.kind === 'confirmed';
    } catch (cause) {
      if (active() && operationOwner.current === own) {
        setError(api.loreMessage(cause));
        pendingRef.current = p;
        setPending(p);
      }
      throw cause;
    } finally {
      if (active() && operationOwner.current === own) {
        reserved.current = false;
        setBusy(false);
      }
    }
  }
  async function submit(
    action: 'save' | 'delete',
    request: AdventureLoreSave | AdventureLoreWrite,
  ) {
    if (pendingRef.current || reserved.current)
      throw new Error('Confirme ou encerre o pedido preservado antes de outro envio.');
    const captured = context.context;
    if (!captured || !context.isCurrent(captured))
      throw new Error('Atualize o contexto antes de salvar.');
    const p = await api.prepareAdventureLoreOperation(action, request);
    if (!active() || !context.isCurrent(captured))
      throw new Error('O contexto mudou; o rascunho foi preservado.');
    pendingRef.current = p;
    setPending(p);
    return run(p);
  }
  return {
    ...context,
    items: context.context ? items : [],
    cursor,
    loading: context.loading || loading,
    error: context.error || error,
    notice,
    pending,
    busy,
    load,
    submit,
    retry: () => (pendingRef.current ? run(pendingRef.current) : Promise.resolve(false)),
    cancel: () => (pendingRef.current ? run(pendingRef.current, true) : Promise.resolve(false)),
  };
}
