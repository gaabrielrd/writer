import { useCallback, useEffect, useRef, useState } from 'react';
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
function loadPage(kind: StudioProjectKind, status: 'all' | StudioStatus, cursor: string | null) {
  const input = { status, cursor, limit: 25 };
  if (kind === 'book') return listStudioBooks({ ...input, status: status as 'all' | BookStatus });
  if (kind === 'adventure')
    return listAdventures({ ...input, status: status as 'all' | AdventureStatus });
  return listCampaigns({ ...input, status: status as 'all' | CampaignStatus });
}

export function useStudioProjects(kind: StudioProjectKind, status: 'all' | StudioStatus) {
  const [attempt, setAttempt] = useState(0);
  const key = kind + ':' + status + ':' + attempt;
  const [result, setResult] = useState<PageState>();
  const controlRef = useRef<{ active: boolean; key: string; busy: boolean } | null>(null);
  useEffect(() => {
    const control = { active: true, key, busy: false };
    controlRef.current = control;
    async function load() {
      try {
        if (kind === 'book') {
          let complete = false;
          while (!complete && control.active) {
            const progress = await prepareStudioBooks({ limit: 25 });
            if (!control.active) return;
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
        if (!control.active) return;
        const page = await loadPage(kind, status, null);
        if (control.active) setResult({ key, ...page, loadingMore: false });
      } catch (cause) {
        if (control.active)
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
  }, [key, kind, status]);
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
    control.busy = true;
    const cursor = result.nextCursor;
    setResult((previous) =>
      previous?.key === key ? { ...previous, loadingMore: true, moreError: undefined } : previous,
    );
    try {
      const page = await loadPage(kind, status, cursor);
      if (control.active)
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
      if (control.active)
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
