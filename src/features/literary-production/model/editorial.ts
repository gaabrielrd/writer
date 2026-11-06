export { composeEditorialContract } from '../../../../functions/src/literaryEditorialComposition.mjs';

export const editorialFields = {
  premise: 'Premissa',
  genre: 'Gênero',
  audience: 'Público',
  language: 'Idioma',
  promise: 'Promessa de leitura',
  centralQuestion: 'Pergunta central',
  transformation: 'Transformação pretendida',
  ending: 'Horizonte de conclusão',
  narrator: 'Narrador e POV',
  tense: 'Tempo verbal',
  distance: 'Distância narrativa',
  cadence: 'Cadência',
  dialogue: 'Diálogo',
  exposition: 'Exposição e mistério',
  examples: 'Exemplos de voz',
  limits: 'Limites de conteúdo',
  invariants: 'Fatos e escolhas invariantes',
  reservations: 'Revelações reservadas',
  collaboration: 'Observações sobre colaboração',
} as const;
export type EditorialField = keyof typeof editorialFields;
export type EditorialStatus = 'proposal' | 'working' | 'approved' | 'gap';
export type EditorialCategory = 'requirement' | 'preference' | 'hypothesis';
export const statusLabels: Record<EditorialStatus, string> = {
  proposal: 'Proposta',
  working: 'Desenvolvimento de trabalho',
  approved: 'Aprovado pelo autor',
  gap: 'Lacuna',
};
export const categoryLabels: Record<EditorialCategory, string> = {
  requirement: 'Requisito',
  preference: 'Preferência',
  hypothesis: 'Hipótese',
};
export interface EditorialDecision {
  id: string;
  text: string;
  category: EditorialCategory;
  status: EditorialStatus;
  source: string;
  supersedes: string | null;
}
export type {
  LiteraryCollaborationMode,
  LiteraryCollaborationPolicy,
} from '../../../../functions/src/literaryCollaborationProtocol.mjs';
import type { LiteraryCollaborationPolicy } from '../../../../functions/src/literaryCollaborationProtocol.mjs';
export const collaborationLabels = {
  guidance: 'Orientação',
  supervised: 'Execução supervisionada',
  continuous: 'Execução contínua com escopo e limites',
} as const;
export type {
  LiteraryPublicationUnit,
  LiteraryPublicationUnitPolicy,
} from '../../../../functions/src/literaryPublicationPolicyProtocol.mjs';
import type { LiteraryPublicationUnitPolicy } from '../../../../functions/src/literaryPublicationPolicyProtocol.mjs';
export const publicationUnitLabels = {
  chapter: 'Capítulo',
  act: 'Ato',
  book: 'Livro inteiro',
} as const;
export interface EditorialContract {
  collaborationPolicy?: LiteraryCollaborationPolicy;
  publicationPolicy?: LiteraryPublicationUnitPolicy;
  schemaVersion: 1;
  fields: Record<EditorialField, string>;
  decisions: EditorialDecision[];
}
export interface EditorialState {
  revision: number;
  updatedAt: number | null;
  contract: EditorialContract;
}
export interface SaveEditorialContract {
  target: { kind: 'book'; id: string };
  operationId: string;
  expectedRevision: number;
  contract: EditorialContract;
}
export interface EditorialVersionPage {
  items: Array<Pick<EditorialState, 'revision' | 'updatedAt'>>;
  nextBeforeRevision: number | null;
}
