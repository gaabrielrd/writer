import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { blockErrorMessage, type AdventureBlockPage } from '../model/adventureBlock';
import { listAdventureBlocks } from '../services/adventureBlockService';
export function useAdventureBlocks(
  adventureId: string,
  sceneId: string,
  archived: boolean,
  sceneRevision?: number,
) {
  const { user } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([user?.uid, adventureId, sceneId, archived, sceneRevision, attempt]);
  const identity = useRef(key);
  useLayoutEffect(() => {
    identity.current = key;
    return () => {
      identity.current = '';
    };
  }, [key]);
  const [state, setState] = useState<{
    key: string;
    page: AdventureBlockPage | null;
    error: string;
    moreError: string;
    loadingMore: boolean;
  }>();
  const busy = useRef(false);
  useEffect(() => {
    if (!user?.uid) return;
    let active = true;
    busy.current = false;
    void listAdventureBlocks({ adventureId, sceneId, archived, cursor: null, limit: 25 })
      .then((page) => {
        if (active && identity.current === key)
          setState({ key, page, error: '', moreError: '', loadingMore: false });
      })
      .catch((cause: unknown) => {
        if (active && identity.current === key)
          setState({
            key,
            page: null,
            error: blockErrorMessage(cause),
            moreError: '',
            loadingMore: false,
          });
      });
    return () => {
      active = false;
    };
  }, [key, user?.uid, adventureId, sceneId, archived]);
  const current = state?.key === key ? state : undefined;
  const loadMore = async () => {
    if (!current?.page?.nextCursor || busy.current || identity.current !== key) return;
    busy.current = true;
    setState({ ...current, loadingMore: true, moreError: '' });
    try {
      const page = await listAdventureBlocks({
        adventureId,
        sceneId,
        archived,
        cursor: current.page.nextCursor,
        limit: 25,
      });
      if (identity.current !== key) return;
      if (page.structureRevision !== current.page.structureRevision)
        throw new Error('A ordem dos blocos mudou. Atualize a lista antes de continuar.');
      const seen = new Set(current.page.items.map((item) => JSON.stringify(item.resource)));
      setState({
        ...current,
        page: {
          ...page,
          items: [
            ...current.page.items,
            ...page.items.filter((item) => !seen.has(JSON.stringify(item.resource))),
          ],
        },
        loadingMore: false,
        moreError: '',
      });
    } catch (cause) {
      if (identity.current === key)
        setState({ ...current, loadingMore: false, moreError: blockErrorMessage(cause) });
    } finally {
      if (identity.current === key) busy.current = false;
    }
  };
  return {
    ...current,
    loading: !current,
    refresh: () => setAttempt((value) => value + 1),
    loadMore,
  };
}
