export type PreparationKind = 'clue' | 'quest';
export type ClueStatus = 'pending' | 'handled';
export type QuestStatus = 'available' | 'active' | 'completed' | 'failed' | 'abandoned';
export type PreparationView = 'all' | 'pending';
export interface PreparationScope {
  campaignId: string;
  campaignToken: string;
}
export interface PreparationIdentity extends PreparationScope {
  schemaVersion: 1;
  ownerId: string;
}
export interface PreparationItemSummary {
  id: string;
  kind: PreparationKind;
  revision: number;
  order: number;
  title: string;
  status: ClueStatus | QuestStatus;
  createdAt: number;
  updatedAt: number;
}
export type ClueBody = { text: string; condition: string; recipient: string };
export type QuestBody = { description: string; consequences: string };
export type PreparationItem = PreparationItemSummary &
  (
    | { kind: 'clue'; status: ClueStatus; body: ClueBody }
    | { kind: 'quest'; status: QuestStatus; body: QuestBody }
  );
export interface PreparationItemPage extends PreparationIdentity {
  itemCollectionRevision: number;
  items: PreparationItemSummary[];
  nextCursor: string | null;
}
export interface PreparationItemResult extends PreparationIdentity {
  itemCollectionRevision: number;
  item: PreparationItem;
}
export type PreparationLinkSummary = {
  id: string;
  revision: number;
  order: number;
  createdAt: number;
  updatedAt: number;
} & ({ available: false } | { available: true; target: PreparationItemSummary });
export interface PreparationSessionScope extends PreparationScope {
  sessionId: string;
  expectedSessionRevision: number;
}
export interface PreparationLinkPage extends PreparationIdentity {
  sessionId: string;
  sessionRevision: number;
  itemCollectionRevision: number;
  linkCollectionRevision: number;
  items: PreparationLinkSummary[];
  nextCursor: string | null;
}
export interface ListPreparationItemsInput {
  campaignId: string;
  campaignToken?: string;
  kind: PreparationKind;
  view: PreparationView;
  cursor?: string;
  limit?: number;
}
export interface GetPreparationItemInput extends PreparationScope {
  itemId: string;
  expectedRevision: number;
}
export interface ItemWriteInput extends GetPreparationItemInput {
  operationId: string;
  expectedItemCollectionRevision: number;
}
export type SavePreparationItemInput = ItemWriteInput & { title: string } & (
    | { kind: 'clue'; status: ClueStatus; body: ClueBody }
    | { kind: 'quest'; status: QuestStatus; body: QuestBody }
  );
export type MovePreparationItemInput = ItemWriteInput & { direction: 'up' | 'down' };
export interface LinkWriteInput extends PreparationSessionScope {
  operationId: string;
  linkId: string;
  expectedRevision: number;
  expectedLinkCollectionRevision: number;
}
export interface AddPreparationLinkInput extends LinkWriteInput {
  itemId: string;
  expectedItemRevision: number;
}
export type MovePreparationLinkInput = LinkWriteInput & { direction: 'up' | 'down' };
export type PreparationRequest =
  | { action: 'save-item'; request: SavePreparationItemInput }
  | { action: 'delete-item'; request: ItemWriteInput }
  | { action: 'move-item'; request: MovePreparationItemInput }
  | { action: 'add-link'; request: AddPreparationLinkInput }
  | { action: 'remove-link'; request: LinkWriteInput }
  | { action: 'move-link'; request: MovePreparationLinkInput };
export type PreparationAction = PreparationRequest['action'];
export type PendingCampaignPreparation = PreparationRequest & {
  schemaVersion: 1;
  ownerId: string;
  intent: 'apply' | 'cancel';
};
export type ResolvePreparationInput = PreparationRequest & { intent: 'cancel' };
export interface PreparationItemReceipt {
  operationId: string;
  action: 'save-item' | 'delete-item' | 'move-item';
  itemId: string;
  expectedRevision: number;
  revision: number;
  itemCollectionRevision: number;
}
export interface PreparationLinkReceipt {
  operationId: string;
  action: 'add-link' | 'remove-link' | 'move-link';
  linkId: string;
  sessionId: string;
  expectedSessionRevision: number;
  expectedRevision: number;
  revision: number;
  linkCollectionRevision: number;
}
export type PreparationOutcome = PreparationIdentity &
  (
    | { kind: 'confirmed'; receipt: PreparationItemReceipt | PreparationLinkReceipt }
    | { kind: 'canceled'; action: PreparationAction; operationId: string }
  );
export interface CampaignPreparationSessionContext extends PreparationSessionScope {
  isActive: () => boolean;
  readOnly: boolean;
}
export interface CampaignPreparationOpenRequest {
  requestId: number;
  session: CampaignPreparationSessionContext;
  view: PreparationView;
}
export interface CampaignPreparationPanelProps {
  campaignId: string;
  openRequest?: CampaignPreparationOpenRequest | null;
  onPendingChange?: (pending: boolean) => void;
}
export const clueStatusLabels: Record<ClueStatus, string> = {
  pending: 'Pendente',
  handled: 'Tratada',
};
export const questStatusLabels: Record<QuestStatus, string> = {
  available: 'Disponível',
  active: 'Em andamento',
  completed: 'Concluída',
  failed: 'Falhou',
  abandoned: 'Abandonada',
};
export const isPreparationPending = (item: PreparationItemSummary) =>
  item.kind === 'clue'
    ? item.status === 'pending'
    : item.status === 'available' || item.status === 'active';

export function emptyItem(kind: PreparationKind, id: string): PreparationItem {
  return kind === 'clue'
    ? {
        id,
        kind,
        revision: 0,
        order: 0,
        title: '',
        status: 'pending',
        body: { text: '', condition: '', recipient: '' },
        createdAt: 0,
        updatedAt: 0,
      }
    : {
        id,
        kind,
        revision: 0,
        order: 0,
        title: '',
        status: 'available',
        body: { description: '', consequences: '' },
        createdAt: 0,
        updatedAt: 0,
      };
}
