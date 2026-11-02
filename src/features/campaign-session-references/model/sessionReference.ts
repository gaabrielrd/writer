import type { CampaignLoreCategory, CampaignLoreEntityView } from '@/features/campaign-lore';
export interface SessionReferenceScope {
  campaignId: string;
  campaignToken: string;
  sessionId: string;
  expectedSessionRevision: number;
}
export interface SessionReferenceSourceContext {
  baseId: string;
  projectionToken: string;
}
export interface SessionReferenceEnvelope {
  schemaVersion: 1;
  ownerId: string;
  campaignId: string;
  campaignToken: string;
  sessionId: string;
  sessionRevision: number;
  referenceCollectionRevision: number;
}
export interface SessionLoreCandidate {
  sourceKey: string;
  name: string;
  category: CampaignLoreCategory;
  revision: number;
  mode: 'base' | 'override';
  legacy: boolean;
}
export type SessionReferenceKind = 'lore' | 'scene';
export type SessionReferenceRow = {
  id: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
} & ({ available: false } | { available: true; target: SessionLoreCandidate & { kind: 'lore' } });
export type ListSessionReferencesInput = SessionReferenceScope & {
  cursor?: string;
  limit?: number;
} & (
    | { view: 'references'; kind?: SessionReferenceKind }
    | { view: 'candidates'; kind?: 'lore'; sourceContext: SessionReferenceSourceContext }
    | {
        view: 'candidates';
        kind: 'scene';
        sourceContext: SessionReferenceSourceContext;
        archive?: 'active' | 'archived' | 'all';
      }
  );
export type SessionReferencePage = SessionReferenceEnvelope & {
  sourceContext: SessionReferenceSourceContext | null;
  nextCursor: string | null;
} & (
    | { view: 'references'; items: SessionReferenceRow[] }
    | { view: 'candidates'; items: SessionLoreCandidate[] }
  );
export interface AddSessionReferenceInput extends SessionReferenceScope {
  referenceId: string;
  operationId: string;
  expectedReferenceCollectionRevision: number;
  sourceContext: SessionReferenceSourceContext;
  target: { kind: SessionReferenceKind; sourceKey: string };
}
export interface RemoveSessionReferenceInput extends SessionReferenceScope {
  referenceId: string;
  operationId: string;
  expectedRevision: number;
  expectedReferenceCollectionRevision: number;
}
export interface ReadSessionLoreReferenceInput extends SessionReferenceScope {
  referenceId: string;
  expectedRevision: number;
  expectedReferenceCollectionRevision: number;
  sourceContext: SessionReferenceSourceContext;
}
export interface SessionLoreMaterial {
  kind: 'lore';
  sourceKey: string;
  revision: number;
  mode: 'base' | 'override';
  legacy: boolean;
  entity: CampaignLoreEntityView;
}
export interface SessionLoreReferenceResult extends SessionReferenceEnvelope {
  referenceId: string;
  referenceRevision: number;
  sourceContext: SessionReferenceSourceContext | null;
  material: SessionLoreMaterial | null;
}
export interface SessionReferenceReceipt {
  operationId: string;
  action: 'add' | 'remove';
  referenceId: string;
  sessionId: string;
  expectedSessionRevision: number;
  expectedReferenceCollectionRevision: number;
  revision: number;
  referenceCollectionRevision: number;
}
export type SessionReferenceOutcome = {
  schemaVersion: 1;
  ownerId: string;
  campaignId: string;
  campaignToken: string;
  sessionId: string;
} & (
  | { kind: 'confirmed'; receipt: SessionReferenceReceipt }
  | { kind: 'canceled'; action: 'add'; request: AddSessionReferenceInput }
  | { kind: 'canceled'; action: 'remove'; request: RemoveSessionReferenceInput }
);
export type ResolveSessionReferenceInput = { intent: 'cancel' } & (
  | { action: 'add'; request: AddSessionReferenceInput }
  | { action: 'remove'; request: RemoveSessionReferenceInput }
);
export type PendingSessionReference = {
  schemaVersion: 1;
  ownerId: string;
  intent: 'apply' | 'cancel';
} & (
  | { action: 'add'; request: AddSessionReferenceInput }
  | { action: 'remove'; request: RemoveSessionReferenceInput }
);
