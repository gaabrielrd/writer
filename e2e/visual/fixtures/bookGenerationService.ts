import { author, books } from './data';
type BookAssetKind = 'synopsis' | 'cover';
interface BookAssetSuggestion {
  id: string;
  kind: BookAssetKind;
  cost: number;
  text?: string;
  previewUrl?: string;
}
const suggestions = new Map<string, BookAssetSuggestion>();
const accepted = new Map<string, number>();
let credits = author.credits;
export const quoteBookGeneration = () => Promise.resolve({ synopsis: 1, cover: 5 });
export function generateBookAsset(
  context: { title: string; genre: string; synopsis: string },
  kind: BookAssetKind,
  id: string,
) {
  // Small fixture preview is a PNG, matching the production response contract.
  const suggestion: BookAssetSuggestion = {
    id,
    kind,
    cost: kind === 'synopsis' ? 1 : 5,
    ...(kind === 'synopsis'
      ? {
          text: `Em ${context.title}, uma viajante encontra um mapa que transforma seu destino. Uma aventura de ${context.genre} entre memórias e descobertas.`,
        }
      : {
          previewUrl:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAYCAIAAAB8wupbAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAIElEQVQ4jWNQsbAjCTGMarAYDSWV0aRhN5ofVGhXagAAkKbnAQcwgcsAAAAASUVORK5CYII=',
        }),
  };
  suggestions.set(id, suggestion);
  return Promise.resolve(suggestion);
}
export function acceptBookAsset(id: string) {
  const suggestion = suggestions.get(id);
  if (!suggestion) throw new Error('Sugestão indisponível.');
  if (!accepted.has(id)) {
    credits -= suggestion.cost;
    accepted.set(id, credits);
  }
  return Promise.resolve({
    id,
    kind: suggestion.kind,
    credits,
    text: suggestion.text,
    coverUrl: books[0].coverUrl ?? undefined,
  });
}
export function discardBookAsset(id: string) {
  if (!accepted.has(id)) suggestions.delete(id);
  return Promise.resolve({ discarded: true });
}
