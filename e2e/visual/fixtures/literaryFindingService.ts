import type {
  FindingDecision,
  FindingSource,
  FindingTarget,
  SaveFindingDecision,
} from '../../../src/features/literary-production/services/literaryFindingService';
let current: FindingDecision | null = null;
const milestone = (bookId: string, arc: string): FindingTarget => ({
  kind: 'architecture',
  id: JSON.stringify(['arcMilestone', arc, 'virada']),
  scopeId: bookId,
});
export const getLiteraryFindingContext = (
  bookId: string,
  source: FindingSource,
  afterArchitectureIndex?: number,
) =>
  Promise.resolve({
    id: 'fixture-structural-decision',
    source,
    architectureAudit: true,
    options:
      afterArchitectureIndex === 9
        ? [
            {
              target: milestone(bookId, 'arco-ana'),
              label: 'Marco de arco · Virada · arco arco-ana',
            },
            {
              target: milestone(bookId, 'arco-irma'),
              label: 'Marco de arco · Virada · arco arco-irma',
            },
          ]
        : [],
    nextAfterArchitectureIndex:
      afterArchitectureIndex === 9 ? 19 : afterArchitectureIndex === 19 ? null : 9,
  });
export const getLiteraryFindingDecision = (_bookId: string, id: string) =>
  Promise.resolve(current ? structuredClone(current) : { id, state: 'unrecorded' as const });
export const saveLiteraryFindingDecision = (input: SaveFindingDecision) => {
  const baseline = input.targetResource
    ? {
        target: input.targetResource,
        label: 'Marco de arco · Virada · arco arco-irma',
        identityToken: 'a'.repeat(64),
        versionToken: 'b'.repeat(64),
        contentHash: 'c'.repeat(64),
        revision: 0,
        proofKind: 'architecture' as const,
      }
    : null;
  current = {
    id: 'fixture-structural-decision',
    revision: 1,
    source: {
      jobId: input.jobId,
      requestId: input.requestId,
      index: input.findingIndex,
      severity: 'warning',
    },
    action: input.action,
    rationale: input.rationale,
    target: input.targetResource,
    baseline,
    state: 'planned',
    createdAt: 1,
    updatedAt: 2,
    effectiveRetention: false,
    confirmationCurrent: false,
    originalSourceCurrent: true,
    currentTarget: baseline,
    sourceScope: { level: 'book', actId: null, audit: 'architecture' },
    correction: null,
  };
  return Promise.resolve({
    id: current.id,
    revision: current.revision,
    updatedAt: current.updatedAt,
  });
};
export const confirmLiteraryFindingCorrection = () =>
  Promise.reject(new Error('A fixture não oferece uma alteração salva nem integração sucessora.'));
export const listLiteraryFindingDecisions = () =>
  Promise.resolve({ items: current ? [structuredClone(current)] : [], nextAfterId: null });
export const listLiteraryFindingDecisionVersions = () =>
  Promise.resolve({ items: current ? [structuredClone(current)] : [], nextBeforeRevision: null });
export const getLiteraryFindingDecisionVersion = getLiteraryFindingDecision;
export const findingRequestRejected = () => false;
