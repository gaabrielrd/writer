import type { PageAction } from '../../../../functions/src/pageAssistantCapabilities.mjs';
export type {
  PageCapability,
  PageAction,
} from '../../../../functions/src/pageAssistantCapabilities.mjs';
export interface PageEditorialContext {
  bookId: string;
  revision: number;
  scope: 'editorial-contract-only';
  instruction: string;
  wholeBook: false;
}
export interface PageAssistantReply {
  editorialContext?: PageEditorialContext;
  reply: string;
  action: PageAction | null;
  contextProof: string | null;
}
export type PageAssistantTarget = {
  kind: 'book' | 'adventure' | 'campaign' | 'universe';
  id: string;
};
export function pageAssistantTarget(path: string): PageAssistantTarget | null {
  const match = /^\/(books|adventures|campaigns|universes)\/([^/]+)(?:\/|$)/.exec(path);
  if (!match || !match[2] || match[2] === 'new') return null;
  let id: string;
  try {
    id = decodeURIComponent(match[2]);
  } catch {
    return null;
  }
  return {
    kind: (
      {
        books: 'book',
        adventures: 'adventure',
        campaigns: 'campaign',
        universes: 'universe',
      } as const
    )[match[1] as 'books' | 'adventures' | 'campaigns' | 'universes'],
    id,
  };
}

export function pageContextLabel(path: string): string {
  const target = pageAssistantTarget(path);
  if (target) {
    const label = {
      book: 'Livro',
      adventure: 'Aventura',
      campaign: 'Campanha',
      universe: 'Universo',
    }[target.kind];
    return `${label}${path.includes('/editor/') ? ' · Escrita' : path.includes('/sessions/') ? ' · Sessão' : path.includes('/scenes/') ? ' · Cena' : ''}`;
  }
  if (path.startsWith('/studio/new') || path.startsWith('/books/new')) return 'Criação de projeto';
  if (path.startsWith('/studio/import')) return 'Importação e restauração';
  if (path.startsWith('/studio/operations')) return 'Operações em andamento';
  if (path.startsWith('/studio/projects')) return 'Meus projetos';
  if (path.startsWith('/settings/preferences')) return 'Preferências';
  if (path.startsWith('/settings/ai')) return 'Configurações de IA';
  if (path.startsWith('/read/')) return 'Leitura · Ajuda geral';
  if (path.startsWith('/library')) return 'Biblioteca de imagens';
  if (path.startsWith('/universes')) return 'Universos';
  return 'Estúdio · Ajuda da tela';
}
