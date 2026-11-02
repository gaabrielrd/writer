import { Button, ErrorState, LoadingState } from '@/shared/ui';
import type { LoreMentionEntity } from '../model/loreEntity';
import { useBookLoreActor } from '../hooks/useBookLoreActor';
import { useBookLorePresentation } from '../hooks/useBookLorePresentation';
import { LoreRecord } from './LoreDrawer';
export interface BookLoreInlineDetailsProps {
  bookId: string;
  loreId: string;
  entities: readonly LoreMentionEntity[];
}
export function BookLoreInlineDetails(props: BookLoreInlineDetailsProps) {
  const actor = useBookLoreActor();
  return actor !== null ? (
    <Details key={JSON.stringify([actor, props.bookId, props.loreId])} {...props} />
  ) : null;
}
function Details({ bookId, loreId, entities }: BookLoreInlineDetailsProps) {
  const { value, error, retry } = useBookLorePresentation(bookId, loreId);
  return error ? (
    <ErrorState
      title="Ficha indisponível"
      description={error}
      action={<Button onClick={retry}>Tentar novamente</Button>}
    />
  ) : value ? (
    <section aria-label={'Ficha completa de ' + value.name}>
      <LoreRecord entity={value} allEntities={entities} showOverview={false} />
    </section>
  ) : (
    <LoadingState label="Conferindo a ficha completa..." />
  );
}
