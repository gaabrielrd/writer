export type AdventureStatus = 'draft' | 'ready' | 'archived';

export interface Adventure {
  id: string;
  ownerId: string;
  schemaVersion: 1;
  revision: number;
  title: string;
  synopsis: string;
  language: 'pt-BR';
  origin:
    | { kind: 'authored' }
    | {
        kind: 'imported';
        importId: string;
        sourceMediaType: string;
        sourceHash: string;
        reviewHash: string;
      };
  status: AdventureStatus;
  editorialState?: 'draft' | 'review' | 'ready';
  hasProgressResources?: boolean;
  universeId: string | null;
  createdAt: number;
  updatedAt: number;
}

export type AdventureSummary = Pick<
  Adventure,
  | 'id'
  | 'title'
  | 'status'
  | 'editorialState'
  | 'revision'
  | 'universeId'
  | 'createdAt'
  | 'updatedAt'
> & { kind: 'adventure' };
export interface AdventureListInput {
  status?: 'all' | AdventureStatus;
  editorialState?: 'all' | NonNullable<Adventure['editorialState']>;
  cursor?: string | null;
  limit?: number;
}
export interface AdventurePageResult {
  items: AdventureSummary[];
  nextCursor: string | null;
}
export interface CreateAdventureInput {
  operationId: string;
  title: string;
  synopsis?: string;
  universeId?: string | null;
}
