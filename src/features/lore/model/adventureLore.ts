import type { LoreCategory, LoreDetails, LoreEntity, LoreMentionEntity } from './loreEntity';
export interface AdventureLoreIdentity {
  schemaVersion: 1;
  ownerId: string;
  adventureId: string;
  adventureToken: string;
}
export interface AdventureLoreReference {
  kind: 'adventure' | 'universe';
  scopeId: string;
  entityId: string;
}
interface Summary extends LoreMentionEntity {
  reference: AdventureLoreReference;
  entityToken: string;
  isPublic: boolean;
  createdAt: number;
  updatedAt: number;
  relationCount?: number;
}
export type AdventureLoreSummary = Summary &
  (
    | {
        reference: AdventureLoreReference & { kind: 'adventure' };
        revision: number;
        relationCount: number;
      }
    | { reference: AdventureLoreReference & { kind: 'universe' }; revision?: never }
  );
export interface AdventureLoreRelation {
  targetEntityId: string;
  relationType: string;
  description: string;
  available: boolean;
}
export type AdventureLoreDetail = AdventureLoreSummary & {
  details: string;
  structuredDetails: LoreDetails;
  relations: AdventureLoreRelation[];
};
export interface AdventureLoreScope {
  adventureId: string;
  adventureToken: string;
}
export interface AdventureLoreListInput {
  adventureId: string;
  adventureToken?: string;
  scope: 'adventure' | 'universe';
  category?: LoreCategory;
  cursor?: string | null;
  limit?: number;
}
export type AdventureLoreList = AdventureLoreIdentity & {
  scope: 'adventure' | 'universe';
  collectionRevision: number;
  contextToken: string;
  items: AdventureLoreSummary[];
  nextCursor: string | null;
};
export interface AdventureLoreGetInput extends AdventureLoreScope {
  reference: AdventureLoreReference;
  expectedContextToken: string;
  expectedEntityToken: string;
}
export type AdventureLoreGet = AdventureLoreIdentity & {
  collectionRevision: number;
  contextToken: string;
  item: AdventureLoreDetail;
};
export interface AdventureLoreEntityInput {
  name: string;
  aliases: string[];
  category: LoreCategory;
  summary: string;
  details: string;
  structuredDetails: LoreDetails;
  relations: { targetEntityId: string; relationType: string; description: string }[];
  isPublic: false;
}
export interface AdventureLoreWrite extends AdventureLoreScope {
  entityId: string;
  operationId: string;
  expectedRevision: number;
  expectedCollectionRevision: number;
}
export interface AdventureLoreSave extends AdventureLoreWrite {
  entity: AdventureLoreEntityInput;
}
export type AdventureLoreAction = 'save' | 'delete';
export interface AdventureLoreReceipt {
  operationId: string;
  action: AdventureLoreAction;
  entityId: string;
  expectedRevision: number;
  revision: number;
  collectionRevision: number;
}
export type AdventureLoreOutcome = AdventureLoreIdentity &
  (
    | { kind: 'confirmed'; receipt: AdventureLoreReceipt }
    | { kind: 'canceled'; action: AdventureLoreAction; operationId: string }
  );
export interface AdventureLoreResolve extends AdventureLoreWrite {
  action: AdventureLoreAction;
  requestHash: string;
  intent: 'cancel';
}
export interface AdventureLorePending {
  action: AdventureLoreAction;
  request: AdventureLoreSave | AdventureLoreWrite;
  requestHash: string;
}
/** Only a successful full get may cross into the existing full-fiche presentation. */
export function adventureLoreEntity(item: AdventureLoreDetail): LoreEntity {
  const { reference } = item;
  return {
    ...item,
    ...(reference.kind === 'adventure'
      ? { adventureId: reference.scopeId }
      : { universeId: reference.scopeId }),
  } as LoreEntity;
}
