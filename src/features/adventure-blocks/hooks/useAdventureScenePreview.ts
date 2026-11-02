import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { blockErrorMessage, type AdventureBlockAudience } from '../model/adventureBlock';
import type { AdventureScenePreviewPage } from '../model/adventurePreview';
import {
  readAdventureScenePreview,
  readAdventurePreviewImage,
  validateAdventureScenePreview,
  validateAdventurePreviewImage,
} from '../services/adventurePreviewService';

export function useAdventureScenePreview(
  adventureId: string,
  sceneId: string,
  audience: AdventureBlockAudience,
) {
  const { user } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([user?.uid, adventureId, sceneId, audience, attempt]);
  const identity = useRef(''),
    busy = useRef(false);
  const [state, setState] = useState<{
    key: string;
    page: AdventureScenePreviewPage | null;
    images: Record<string, string>;
    error: string;
    loadingMore: boolean;
  }>();
  useLayoutEffect(() => {
    identity.current = key;
    busy.current = false;
    return () => {
      identity.current = '';
    };
  }, [key]);
  const current = state?.key === key ? state : undefined;
  const isCurrent = () => identity.current === key;
  const fail = (cause: unknown) => {
    if (isCurrent()) {
      identity.current = '';
      setState({
        key,
        page: null,
        images: {},
        error: blockErrorMessage(cause),
        loadingMore: false,
      });
    }
  };
  async function fetchPage(
    cursor: string | null,
    token?: string,
  ): Promise<AdventureScenePreviewPage | null> {
    const seen = new Set<string>();
    let next = cursor;
    do {
      if (!isCurrent()) return null;
      const value = await readAdventureScenePreview({
        adventureId,
        sceneId,
        audience,
        cursor: next,
        limit: 25,
      });
      if (!isCurrent()) return null;
      const page = validateAdventureScenePreview(value);
      if (token && token !== page.projectionToken)
        throw new Error('A composição mudou. Atualize a prévia para conferir a versão atual.');
      token = page.projectionToken;
      if (page.items.length || !page.nextCursor) return page;
      if (seen.has(page.nextCursor))
        throw new Error('Não foi possível continuar a prévia. Atualize a composição.');
      seen.add(page.nextCursor);
      next = page.nextCursor;
    } while (next !== null);
    return null;
  }
  async function media(page: AdventureScenePreviewPage) {
    await Promise.all(
      page.items
        .filter((item) => item.image)
        .map(async (item) => {
          if (!isCurrent() || !item.image) return;
          const value = await readAdventurePreviewImage({
            adventureId,
            sceneId,
            audience,
            projectionToken: page.projectionToken,
            imageKey: item.image.imageKey,
          });
          if (!isCurrent()) return;
          const dataUrl = validateAdventurePreviewImage(value);
          setState((old) =>
            old?.key === key && old.page?.projectionToken === page.projectionToken
              ? { ...old, images: { ...old.images, [item.key]: dataUrl } }
              : old,
          );
        }),
    );
  }
  useEffect(() => {
    if (!user?.uid) return;
    let active = true;
    void (async () => {
      try {
        const page = await fetchPage(null);
        if (!active || !isCurrent() || !page) return;
        setState({ key, page, images: {}, error: '', loadingMore: false });
        await media(page);
      } catch (cause) {
        if (active) fail(cause);
      }
    })();
    return () => {
      active = false;
    };
    // The key is the complete account, target, mode and retry identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  async function loadMore() {
    if (busy.current || !current?.page?.nextCursor || !isCurrent()) return;
    busy.current = true;
    setState((old) => (old?.key === key ? { ...old, loadingMore: true } : old));
    try {
      const page = await fetchPage(current.page.nextCursor, current.page.projectionToken);
      if (!isCurrent() || !page) return;
      const seen = new Set(current.page.items.map((item) => item.key));
      setState((old) =>
        old?.key === key && old.page
          ? {
              ...old,
              page: {
                ...page,
                items: [...old.page.items, ...page.items.filter((item) => !seen.has(item.key))],
              },
              loadingMore: false,
            }
          : old,
      );
      await media(page);
    } catch (cause) {
      fail(cause);
    } finally {
      if (isCurrent()) busy.current = false;
    }
  }
  return {
    page: current?.page ?? null,
    images: current?.images ?? {},
    error: current?.error ?? '',
    loading: !current,
    loadingMore: current?.loadingMore ?? false,
    loadMore,
    refresh: () => setAttempt((value) => value + 1),
  };
}
