import { Button, EmptyState, ErrorState, LoadingState } from '@/shared/ui';
export function NarrativePageFeedback({
  page,
  emptyLabel,
  moreLabel,
}: {
  page: {
    items: unknown[];
    loading: boolean;
    error: string;
    cursor: string | null;
    retry: () => void;
    more: () => Promise<void>;
  };
  emptyLabel: string;
  moreLabel: string;
}) {
  return (
    <>
      {page.loading && <LoadingState label="Carregando itens…" />}
      {page.error && <ErrorState error={page.error} onRetry={page.retry} />}
      {!page.loading && !page.error && !page.items.length && <EmptyState title={emptyLabel} />}
      {page.cursor && (
        <Button variant="outline" disabled={page.loading} onClick={() => void page.more()}>
          {moreLabel}
        </Button>
      )}
    </>
  );
}
