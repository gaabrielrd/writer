/** Fictional unconfigured-book response only; never creates a context grant or calls Firebase. */
import type { getLiteraryWritingContext as productionContext } from '../../../src/features/literary-production/services/literaryWritingService';
import { getBook, getChapter } from './bookService';
import { auth } from './firebase';
import { getLiteraryContract } from './literaryProductionService';
import { listLiteraryPlans } from './literaryPlanningService';

export async function getLiteraryWritingContext(
  input: Parameters<typeof productionContext>[0],
): Promise<null> {
  if (input.target.kind !== 'book' || input.resource.kind !== 'chapter')
    throw new Error('Esta fixture representa somente contexto de capítulo sem configuração.');
  const book = await getBook(input.target.id);
  const chapter = await getChapter(input.target.id, input.resource.id);
  if (!book || book.deleting || book.authorId !== auth.currentUser?.uid || !chapter)
    throw new Error('A origem fictícia do contexto está indisponível.');
  const state = await getLiteraryContract();
  const plans = await listLiteraryPlans();
  if (state.revision !== 0 || plans.items.length || input.planIds?.length)
    throw new Error('Esta fixture não representa contratos ou planejamentos configurados.');
  sessionStorage.setItem(
    'writer.visual.literary-writing-context',
    JSON.stringify({
      target: input.target,
      resource: input.resource,
      mode: input.mode ?? 'chat',
      result: 'unconfigured',
    }),
  );
  return null;
}
