export const BOOK_EDITORIAL_CAPTURE_DEFINITIONS = Object.freeze({
  'impact-control': {
    collection: 'literaryImpactControls',
    kind: 'impact-map',
    impactFamily: 'control',
    role: 'current',
  },
  'impact-graph': {
    collection: 'literaryImpactJobs',
    kind: 'impact-map',
    impactFamily: 'graph',
    role: 'current',
  },
  'impact-node': {
    collection: 'literaryImpactNodes',
    kind: 'impact-map',
    impactFamily: 'node',
    role: 'current',
  },
  'impact-link': {
    collection: 'literaryImpactLinks',
    kind: 'impact-map',
    impactFamily: 'link',
    role: 'current',
  },
  'impact-visit': {
    collection: 'literaryImpactVisits',
    kind: 'impact-map',
    impactFamily: 'visit',
    role: 'current',
  },
  'impact-witness': {
    collection: 'literaryImpactWitnesses',
    kind: 'impact-map',
    impactFamily: 'witness',
    role: 'current',
  },
  'impact-check': {
    collection: 'literaryImpactChecks',
    kind: 'impact-map',
    impactFamily: 'check',
    role: 'current',
  },

  'workflow-job': {
    collection: 'literaryWorkflowJobs',
    kind: 'orchestration',
    orchestrationFamily: 'workflow-job',
    role: 'current',
  },
  'sequence-job': {
    collection: 'literarySequenceJobs',
    kind: 'orchestration',
    orchestrationFamily: 'sequence-job',
    role: 'current',
  },
  'draft-job': {
    collection: 'literaryDraftJobs',
    kind: 'checkpoint',
    checkpointFamily: 'draft-job',
    role: 'current',
  },
  'draft-unit': {
    collection: 'literaryDraftUnits',
    kind: 'checkpoint',
    checkpointFamily: 'draft-unit',
    role: 'current',
  },
  'milestone-job': {
    collection: 'literaryMilestones',
    kind: 'checkpoint',
    checkpointFamily: 'milestone-job',
    role: 'current',
  },
  'milestone-unit': {
    collection: 'literaryMilestoneUnits',
    kind: 'checkpoint',
    checkpointFamily: 'milestone-unit',
    role: 'current',
  },
  'publication-job': {
    collection: 'literaryPublications',
    kind: 'publication',
    publicationFamily: 'job',
    role: 'current',
  },
  'publication-chapter': {
    collection: 'literaryPublicationChapters',
    kind: 'publication',
    publicationFamily: 'chapter',
    role: 'current',
  },
  'publication-removal': {
    collection: 'literaryPublicationRemovals',
    kind: 'publication',
    publicationFamily: 'removal',
    role: 'current',
  },
  'reader-guide-current': {
    collection: 'literaryPublicationGuide',
    kind: 'publication',
    publicationFamily: 'guide',
    role: 'current',
  },
  'reader-guide-version': {
    collection: 'literaryPublicationGuideVersions',
    kind: 'publication',
    publicationFamily: 'guide-version',
    role: 'version',
  },
  'integration-job': {
    collection: 'literaryIntegrationJobs',
    kind: 'integration',
    integrationFamily: 'job',
    role: 'current',
  },
  'integration-request': {
    collection: 'literaryIntegrationRequests',
    kind: 'integration',
    integrationFamily: 'request',
    role: 'current',
  },
  'review-job': {
    collection: 'literaryReviewJobs',
    kind: 'review',
    reviewFamily: 'job',
    role: 'current',
  },
  'review-unit': {
    collection: 'literaryReviewUnits',
    kind: 'review',
    reviewFamily: 'unit',
    role: 'current',
  },
  'review-analysis': {
    collection: 'literaryReviewAnalyses',
    kind: 'review',
    reviewFamily: 'analysis',
    role: 'current',
  },
  generation: { collection: 'literaryGenerations', kind: 'generation', role: 'current' },
  prose: { collection: 'literaryProseRequests', kind: 'prose', role: 'current' },
  'contract-current': {
    collection: 'literaryProduction',
    singleton: 'current',
    kind: 'contract',
    role: 'current',
  },
  'contract-version': { collection: 'literaryContractVersions', kind: 'contract', role: 'version' },
  'plan-current': { collection: 'literaryPlans', kind: 'plan', role: 'current' },
  'plan-version': { collection: 'literaryPlanVersions', kind: 'plan', role: 'version' },
  'progress-current': { collection: 'literaryProgressNotes', kind: 'progress', role: 'current' },
  'progress-version': {
    collection: 'literaryProgressNoteVersions',
    kind: 'progress',
    role: 'version',
  },
  'preparation-current': {
    collection: 'literaryPreparationGates',
    kind: 'preparation',
    role: 'current',
  },
  'preparation-version': {
    collection: 'literaryPreparationGateVersions',
    kind: 'preparation',
    role: 'version',
  },
  'finding-current': {
    collection: 'literaryFindingDecisions',
    kind: 'decision',
    decisionFamily: 'finding',
    role: 'current',
  },
  'finding-version': {
    collection: 'literaryFindingDecisionVersions',
    kind: 'decision',
    decisionFamily: 'finding',
    role: 'version',
  },
  'impact-current': {
    collection: 'literaryImpactDecisions',
    kind: 'decision',
    decisionFamily: 'impact',
    role: 'current',
    listFields: ['uid'],
  },
  'impact-version': {
    collection: 'literaryImpactDecisionVersions',
    kind: 'decision',
    decisionFamily: 'impact',
    role: 'version',
    listFields: ['uid'],
  },
});
export const BOOK_EDITORIAL_CAPTURE_CATALOG_VERSION = 1;
export const BOOK_EDITORIAL_CAPTURE_FAMILIES = Object.freeze(
  Object.keys(BOOK_EDITORIAL_CAPTURE_DEFINITIONS),
);
export const BOOK_EDITORIAL_CAPTURE_LIMITS = Object.freeze({
  pageItems: 50,
  partBytes: 65536,
  itemBytes: 8 * 1024 * 1024,
});
export const BOOK_EDITORIAL_CAPTURE_FENCE_COVERAGE = 'editorial-saved-records-v1';
