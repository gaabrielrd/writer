import type { FindingAction } from '../services/literaryFindingService';

export const findingActionLabels: Record<FindingAction, string> = {
  investigate: 'Investigar',
  correct: 'Planejar correção',
  retain: 'Manter por decisão autoral',
  defer: 'Adiar decisão',
};
