import type {
  PageCapability,
  PageAction,
} from '../../../../functions/src/pageAssistantCapabilities.mjs';
import type { ChatGenerationRequest } from './chatGeneration';
import type { EditorialContract } from '@/features/literary-production';
import type { LoreCategory, LoreDetails, LoreRelation } from '@/features/lore';

export interface AssistedEntity {
  id: string;
  name: string;
  aliases: string[];
  category: LoreCategory;
  summary: string;
  details: string;
  structuredDetails: LoreDetails;
  relations: LoreRelation[];
}
export interface AssistedProposal {
  title: string;
  genre: string;
  synopsis: string;
  coverDirection: string;
  entities: AssistedEntity[];
  editorialContract?: EditorialContract;
}
export interface AssistedCosts {
  text: number;
  cover: number;
}
export type CreationKind = 'book' | 'adventure' | 'campaign';
export interface AssistedSession {
  suggestedAction?: PageAction | null;
  suggestedActionRequestId?: string | null;
  flowVersion?: 2;
  kind?: CreationKind;
  method?: 'manual' | 'assisted';
  universeId?: string | null;
  personaId?: string | null;
  contextUnavailable?: boolean;
  id: string;
  idea: string;
  messages: { role: 'user' | 'assistant'; text: string }[];
  brief: string;
  ready: boolean;
  revision: number;
  proposal: AssistedProposal | null;
  proposalExpiresAt: number | null;
  cover: {
    id: string;
    previewUrl: string;
    expiresAt: number;
    contextHash: string;
    context: { title: string; genre: string; synopsis: string; direction: string };
  } | null;
  expiresAt: number;
  costs: AssistedCosts;
}
export type AssistedAction =
  'start' | 'interview' | 'brief' | 'generate' | 'entity' | 'cover' | 'save';
export interface AssistedRequest {
  capabilities?: PageCapability[];
  flowVersion?: 2;
  kind?: CreationKind;
  method?: 'manual' | 'assisted';
  universeId?: string | null;
  personaId?: string | null;
  action: AssistedAction;
  sessionId: string;
  requestId: string;
  revision: number;
  idea?: string;
  message?: string;
  brief?: string;
  proposal?: AssistedProposal;
  entityId?: string;
  generation?: ChatGenerationRequest;
}
