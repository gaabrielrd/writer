import type { PageAction } from '../../../../functions/src/pageAssistantCapabilities.mjs';
export type {
  PageCapability,
  PageAction,
} from '../../../../functions/src/pageAssistantCapabilities.mjs';
export interface PageAssistantReply {
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
