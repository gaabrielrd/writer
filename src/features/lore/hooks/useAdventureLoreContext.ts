import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { getInvalidationGeneration, subscribeInvalidation } from '@/shared/services';
import type { AdventureLoreList, AdventureLoreSummary } from '../model/adventureLore';
import * as api from '../services/adventureLoreService';
import {
  subscribeAdventureLoreHints,
  type AdventureLoreHint,
} from '../services/adventureLoreContext';
export interface AdventureLoreContextValue {
  identity: AdventureLoreList;
  items: AdventureLoreSummary[];
  generation: number;
}
/** A complete metadata context. A visible catalog page is never a mention context. */
export function useAdventureLoreContext(adventureId: string | null) {
  const { user } = useAuth(),
    uid = user?.uid ?? '';
  const key = JSON.stringify([uid, adventureId]);
  const actor = useRef(key),
    generation = useRef(0),
    alive = useRef(false),
    token = useRef<string | undefined>(undefined);
  // Fence a prior actor before effects or any queued continuation may run.
  // eslint-disable-next-line react-hooks/refs
  actor.current = key;
  const [result, setResult] = useState<{
    key: string;
    context: AdventureLoreContextValue | null;
    error: string;
    loading: boolean;
  }>({ key, context: null, error: '', loading: Boolean(adventureId && uid) });
  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => {
    generation.current++;
    setResult((previous) => ({ ...previous, key, context: null, loading: true, error: '' }));
    setAttempt((n) => n + 1);
  }, [key]);
  useEffect(() => {
    alive.current = true;
    token.current = undefined;
    return () => {
      alive.current = false;
    };
  }, [key]);
  useEffect(() => {
    if (!uid || !adventureId) return;
    const scope = { actorId: uid, scope: 'lore-context' },
      ownKey = key;
    const invalidate = (_kind: AdventureLoreHint) => {
      void _kind;
      if (actor.current === ownKey) refresh();
    };
    const stop = subscribeAdventureLoreHints({ ownerId: uid, adventureId }, invalidate);
    const off = subscribeInvalidation(scope, () => invalidate('root'));
    const focus = () => invalidate('root');
    window.addEventListener('focus', focus);
    const visible = () => {
      if (document.visibilityState === 'visible') focus();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      stop();
      off();
      window.removeEventListener('focus', focus);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [uid, adventureId, key, refresh]);
  useEffect(() => {
    if (!uid || !adventureId) return;
    let current = true;
    const own = ++generation.current,
      pulseScope = { actorId: uid, scope: 'lore-context' },
      stamp = getInvalidationGeneration(pulseScope);
    const active = () =>
      current &&
      alive.current &&
      actor.current === key &&
      generation.current === own &&
      getInvalidationGeneration(pulseScope) === stamp;
    void (async () => {
      await Promise.resolve();
      if (!active()) return;
      setResult({ key, context: null, error: '', loading: true });
      const input = {
        adventureId,
        ...(token.current ? { adventureToken: token.current } : {}),
        scope: 'adventure' as const,
        limit: 1,
      };
      const probe = api.validateAdventureLoreList(await api.listAdventureLore(input), uid, input);
      if (!active()) return;
      token.current = probe.adventureToken;
      const items: AdventureLoreSummary[] = [],
        ids = new Set<string>();
      for (const scope of ['adventure', 'universe'] as const) {
        let cursor: string | null = null;
        const seen = new Set<string>();
        do {
          const request = {
            adventureId,
            adventureToken: probe.adventureToken,
            scope,
            cursor,
            limit: 50,
          };
          const page = api.validateAdventureLoreList(
            await api.listAdventureLore(request),
            uid,
            request,
          );
          if (!active()) return;
          if (
            page.contextToken !== probe.contextToken ||
            page.collectionRevision !== probe.collectionRevision
          )
            api.invalidLore('O contexto mudou durante a consulta. Atualize o lore.');
          for (const item of page.items) {
            if (ids.has(item.id)) api.invalidLore();
            ids.add(item.id);
            items.push(item);
          }
          cursor = page.nextCursor;
          if (cursor) {
            if (seen.has(cursor)) api.invalidLore();
            seen.add(cursor);
          }
        } while (cursor !== null);
      }
      if (active())
        setResult({
          key,
          context: { identity: probe, items, generation: own },
          error: '',
          loading: false,
        });
    })().catch((cause) => {
      if (active())
        setResult({ key, context: null, error: api.loreMessage(cause), loading: false });
    });
    return () => {
      current = false;
    };
  }, [uid, adventureId, key, attempt]);
  const context = result.key === key ? result.context : null;
  const isCurrent = (value: AdventureLoreContextValue) =>
    alive.current && actor.current === key && generation.current === value.generation;
  const get = async (item: AdventureLoreSummary) => {
    if (!context || !isCurrent(context)) return null;
    const request = {
      adventureId: context.identity.adventureId,
      adventureToken: context.identity.adventureToken,
      reference: item.reference,
      expectedContextToken: context.identity.contextToken,
      expectedEntityToken: item.entityToken,
    };
    const value = api.validateAdventureLoreGet(await api.getAdventureLore(request), uid, request);
    return isCurrent(context) ? value : null;
  };
  return {
    uid,
    context,
    items: context?.items ?? [],
    loading: result.key !== key || result.loading,
    error: result.key === key ? result.error : '',
    refresh,
    isCurrent,
    get,
  };
}
