import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import type { EditorialState } from '@/features/work-progress';
import { listStudioBooks, prepareStudioBooks, type BookStatus } from '@/features/books';
import { listAdventures, type AdventureStatus } from '@/features/adventures';
import { listCampaigns, type CampaignStatus } from '@/features/campaigns';
import type { StudioProjectKind, StudioProjectSummary, StudioStatus } from '../model/project';

type PageState = {
  key: string;
  items: StudioProjectSummary[];
  nextCursor: string | null;
  error?: string;
  moreError?: string;
  loadingMore: boolean;
  processed?: number;
  preparing?: boolean;
};
const errorMessage = (cause: unknown) =>
  cause instanceof Error ? cause.message : 'Tente novamente.';
function loadPage(
  kind: StudioProjectKind,
  status: 'all' | StudioStatus,
  editorialState: 'all' | EditorialState,
  cursor: string | null,
) {
  const input = { status, cursor, limit: 25 };
  const editorialFilter = editorialState === 'all' ? {} : { editorialState };
  if (kind === 'book')
    return listStudioBooks({ ...input, ...editorialFilter, status: status as 'all' | BookStatus });
  if (kind === 'adventure')
    return listAdventures({
      ...input,
      ...editorialFilter,
      status: status as 'all' | AdventureStatus,
    });
  return listCampaigns({ ...input, status: status as 'all' | CampaignStatus });
}

async function loadNonEmptyPage(
  kind: StudioProjectKind,
  status: 'all' | StudioStatus,
  editorialState: 'all' | EditorialState,
  cursor: string | null,
  isCurrent: () => boolean,
) {
  while (isCurrent()) {
    const page = await loadPage(kind, status, editorialState, cursor);
    if (!isCurrent()) return;
    if (page.items.length || !page.nextCursor) return page;
    if (page.nextCursor === cursor)
      throw new Error('Não foi possível avançar nesta lista. Tente novamente.');
    cursor = page.nextCursor;
  }
}

export function useStudioProjects(
  kind: StudioProjectKind,
  status: 'all' | StudioStatus,
  editorialState: 'all' | EditorialState = 'all',
) {
  const { user } = useAuth();
  const uid = user?.uid;
  const [attempt, setAttempt] = useState(0);
  const key = [uid, kind, status, editorialState, attempt].join(':');
  const currentKey = useRef(key);
  currentKey.current = key;
  const [result, setResult] = useState<PageState>();
  const controlRef = useRef<{ active: boolean; key: string; busy: boolean } | null>(null);
  useEffect(() => {
    if (!uid) return;
    const control = { active: true, key, busy: false };
    controlRef.current = control;
    const isCurrent = () =>
      control.active && controlRef.current === control && currentKey.current === control.key;
    async function load() {
      try {
        if (kind === 'book') {
          let complete = false;
          while (!complete && isCurrent()) {
            const progress = await prepareStudioBooks({ limit: 25 });
            if (!isCurrent()) return;
            complete = progress.complete;
            setResult({
              key,
              items: [],
              nextCursor: null,
              loadingMore: false,
              processed: progress.processed,
              preparing: !complete,
            });
          }
        }
        const page = await loadNonEmptyPage(kind, status, editorialState, null, isCurrent);
        if (page && isCurrent()) setResult({ key, ...page, loadingMore: false });
      } catch (cause) {
        if (isCurrent())
          setResult((previous) => ({
            key,
            items: [],
            nextCursor: null,
            loadingMore: false,
            processed: previous?.key === key ? previous.processed : undefined,
            error: errorMessage(cause),
          }));
      }
    }
    void load();
    return () => {
      control.active = false;
    };
  }, [key, uid, kind, status, editorialState]);
  const refresh = useCallback(() => setAttempt((value) => value + 1), []);
  const loadMore = async () => {
    const control = controlRef.current;
    if (
      !control?.active ||
      control.key !== key ||
      control.busy ||
      result?.key !== key ||
      !result.nextCursor
    )
      return;
    const isCurrent = () =>
      control.active && controlRef.current === control && currentKey.current === control.key;
    control.busy = true;
    const cursor = result.nextCursor;
    setResult((previous) =>
      previous?.key === key ? { ...previous, loadingMore: true, moreError: undefined } : previous,
    );
    try {
      const page = await loadNonEmptyPage(kind, status, editorialState, cursor, isCurrent);
      if (page && isCurrent())
        setResult((previous) => {
          if (previous?.key !== key) return previous;
          const seen = new Set(previous.items.map((item) => item.id));
          return {
            ...previous,
            items: [...previous.items, ...page.items.filter((item) => !seen.has(item.id))],
            nextCursor: page.nextCursor,
            loadingMore: false,
          };
        });
    } catch (cause) {
      if (isCurrent())
        setResult((previous) =>
          previous?.key === key
            ? { ...previous, loadingMore: false, moreError: errorMessage(cause) }
            : previous,
        );
    } finally {
      control.busy = false;
    }
  };
  const current = result?.key === key ? result : undefined;
  return {
    result: current,
    loading:
      !current ||
      Boolean(current.preparing) ||
      (kind === 'book' && current.processed !== undefined && !current.error),
    refresh,
    loadMore,
  };
}
