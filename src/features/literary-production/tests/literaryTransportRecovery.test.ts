import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as review from '../services/literaryReviewService';
import * as milestone from '../services/literaryMilestoneService';
import * as recheck from '../services/literaryIntegrationRecheckService';
import * as inspection from '../services/literaryPassageInspectionService';
import * as draft from '../services/literaryDraftService';
import * as prose from '../services/literaryProseService';
import * as finding from '../services/literaryFindingService';
import * as integration from '../services/literaryIntegrationService';
import * as publication from '../services/literaryPublicationService';
import * as progress from '../services/literaryProgressService';
import { listLiteraryPendingOperations } from '../services/literaryRecoveryStorage';

const transport = vi.hoisted(() => ({
  invoke: vi.fn<(input: unknown) => Promise<{ data: unknown }>>(),
  callable:
    vi.fn<
      (
        service: unknown,
        name: string,
        options?: unknown,
      ) => (input: unknown) => Promise<{ data: unknown }>
    >(),
  functions: {},
}));
vi.mock('@/shared/api/domainCallable', () => ({
  getFunctions: () => transport.functions,
  httpsCallable: transport.callable,
}));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: () => ({}) }));
const target = { kind: 'book' as const, id: 'book' };
const jobId = 'job-operation-000001';
const operationId = 'request-operation-001';
const token = 'a'.repeat(64);
const request = {
  target,
  jobId,
  chapterId: 'chapter',
  instruction: 'Preservar voz',
  planIds: ['plan'],
};
const proseRequest: prose.StartLiteraryProse = {
  target,
  requestId: operationId,
  chapterId: 'chapter',
  sceneId: 'scene',
  mode: 'draftScene',
  segment: 0,
  instruction: 'Preservar voz',
  expectedSourceToken: token,
};
const checkRequest = { target, operationId, jobId, expectedSourceToken: token };
const inspectRequest = {
  target,
  inspectionId: operationId,
  chapterId: 'chapter',
  expectedScopeToken: token,
};
const command = {
  target,
  inspectionId: operationId,
  expectedRevision: 4,
  expectedOriginToken: token,
};
const response = { state: 'canceled', sentinel: 'resposta servidor' };
type ContractCase = { name: string; invoke: () => Promise<unknown>; wire: object };
const cases: ContractCase[] = [
  ...[
    ['getLiteraryReview', review.getLiteraryReview],
    ['advanceLiteraryReview', review.advanceLiteraryReview],
    ['cancelLiteraryReview', review.cancelLiteraryReview],
    ['cancelPendingLiteraryReviewAnalysis', review.cancelPendingLiteraryReviewAnalysis],
    ['retryLiteraryReviewAnalysis', review.retryLiteraryReviewAnalysis],
    ['getLiteraryMilestone', milestone.getLiteraryMilestone],
    ['advanceLiteraryMilestone', milestone.advanceLiteraryMilestone],
    ['cancelLiteraryMilestone', milestone.cancelLiteraryMilestone],
    ['getLiteraryDraft', draft.getLiteraryDraft],
    ['cancelLiteraryDraft', draft.cancelLiteraryDraft],
    ['regenerateLiteraryDraftScene', draft.regenerateLiteraryDraftScene],
    ['restartLiteraryDraftPreservation', draft.restartLiteraryDraftPreservation],
    ['getLiteraryIntegrationSetup', integration.getLiteraryIntegrationSetup],
    ['getLiteraryIntegration', integration.getLiteraryIntegration],
    ['cancelLiteraryIntegration', integration.cancelLiteraryIntegration],
    [
      'cancelPendingLiteraryIntegrationAnalysis',
      integration.cancelPendingLiteraryIntegrationAnalysis,
    ],
    ['retryLiteraryIntegrationAnalysis', integration.retryLiteraryIntegrationAnalysis],
    ['cancelLiteraryPublication', publication.cancelLiteraryPublication],
    ['reopenLiteraryPublicationGuide', publication.reopenLiteraryPublicationGuide],
  ].map(([name, invoke]) => ({
    name: name as string,
    invoke: () => (invoke as (book: string, id: string) => Promise<unknown>)('book', jobId),
    wire: { target, jobId },
  })),
  ...[
    ['getLiteraryIntegrationRecheck', recheck.getLiteraryIntegrationRecheck],
    ['advanceLiteraryIntegrationRecheck', recheck.advanceLiteraryIntegrationRecheck],
    ['cancelLiteraryIntegrationRecheck', recheck.cancelLiteraryIntegrationRecheck],
  ].map(([name, invoke]) => ({
    name: name as string,
    invoke: () => (invoke as (book: string, id: string) => Promise<unknown>)('book', operationId),
    wire: { target, operationId },
  })),
  {
    name: 'startLiteraryReview',
    invoke: () => review.startLiteraryReview(request, 'author'),
    wire: request,
  },
  {
    name: 'cancelLiteraryReview',
    invoke: () => review.cancelPendingLiteraryReview(request, 'author'),
    wire: { target, jobId },
  },
  {
    name: 'acceptLiteraryReview',
    invoke: () => review.acceptLiteraryReview('book', jobId, token),
    wire: { target, jobId, expectedSourceToken: token },
  },
  {
    name: 'advanceLiteraryReviewedVersion',
    invoke: () => review.advanceLiteraryReviewedVersion('book', jobId, token, true),
    wire: { target, jobId, expectedSourceToken: token, restart: true },
  },
  {
    name: 'listLiteraryReviews',
    invoke: () => review.listLiteraryReviews('book', 'chapter', 'cursor'),
    wire: { target, chapterId: 'chapter', afterId: 'cursor' },
  },
  {
    name: 'listLiteraryReviewAnalyses',
    invoke: () => review.listLiteraryReviewAnalyses('book', jobId, 'cursor'),
    wire: { target, jobId, afterId: 'cursor' },
  },
  {
    name: 'startLiteraryMilestone',
    invoke: () =>
      milestone.startLiteraryMilestone(
        { target, jobId, chapterId: 'chapter', kind: 'firstDraft' },
        'author',
      ),
    wire: { target, jobId, chapterId: 'chapter', kind: 'firstDraft' },
  },
  {
    name: 'listLiteraryMilestones',
    invoke: () => milestone.listLiteraryMilestones('book', 'chapter', 'cursor'),
    wire: { target, chapterId: 'chapter', afterId: 'cursor' },
  },
  {
    name: 'listLiteraryMilestoneVersions',
    invoke: () => milestone.listLiteraryMilestoneVersions('book', jobId, 25),
    wire: { target, jobId, afterIndex: 25 },
  },
  {
    name: 'startLiteraryIntegrationRecheck',
    invoke: () => recheck.startLiteraryIntegrationRecheck(checkRequest, 'author'),
    wire: checkRequest,
  },
  {
    name: 'cancelLiteraryIntegrationRecheck',
    invoke: () => recheck.cancelPendingLiteraryIntegrationRecheck(checkRequest, 'author'),
    wire: { target, operationId },
  },
  {
    name: 'getLiteraryPassageInspectionScope',
    invoke: () => inspection.getLiteraryPassageInspectionScope('book', 'chapter'),
    wire: { target, chapterId: 'chapter' },
  },
  {
    name: 'startLiteraryPassageInspection',
    invoke: () => inspection.startLiteraryPassageInspection(inspectRequest),
    wire: inspectRequest,
  },
  {
    name: 'cancelLiteraryPassageInspection',
    invoke: () => inspection.cancelLiteraryPassageInspectionStart(inspectRequest),
    wire: inspectRequest,
  },
  {
    name: 'getLiteraryPassageInspection',
    invoke: () => inspection.getLiteraryPassageInspection('book', operationId),
    wire: { target, inspectionId: operationId },
  },
  {
    name: 'advanceLiteraryPassageInspection',
    invoke: () => inspection.advanceLiteraryPassageInspection(command),
    wire: command,
  },
  {
    name: 'cancelLiteraryPassageInspection',
    invoke: () => inspection.cancelLiteraryPassageInspection(command),
    wire: command,
  },
  {
    name: 'cancelLiteraryDraft',
    invoke: () => draft.cancelPendingLiteraryDraft(request, 'author'),
    wire: { target, jobId },
  },
  {
    name: 'adoptLiteraryDraftScene',
    invoke: () =>
      draft.adoptLiteraryDraftScene({ target, jobId, unitIndex: 2, expectedSourceToken: token }),
    wire: { target, jobId, unitIndex: 2, expectedSourceToken: token },
  },
  {
    name: 'listLiteraryDrafts',
    invoke: () => draft.listLiteraryDrafts('book', 'chapter', 'cursor'),
    wire: { target, chapterId: 'chapter', afterId: 'cursor' },
  },
  {
    name: 'getLiteraryProse',
    invoke: () => prose.getLiteraryProse('book', operationId),
    wire: { target, requestId: operationId },
  },
  {
    name: 'cancelLiteraryProse',
    invoke: () => prose.cancelLiteraryProse('book', operationId),
    wire: { target, requestId: operationId },
  },
  {
    name: 'getLiteraryProse',
    invoke: () => prose.recoverLiteraryProse(proseRequest, 'author'),
    wire: { target, requestId: operationId },
  },
  {
    name: 'cancelLiteraryProse',
    invoke: () => prose.cancelPendingLiteraryProse(proseRequest, 'author'),
    wire: { target, requestId: operationId },
  },
  {
    name: 'listLiteraryProse',
    invoke: () => prose.listLiteraryProse('book', 'chapter', 'cursor'),
    wire: { target, chapterId: 'chapter', afterId: 'cursor' },
  },
  {
    name: 'getLiteraryProseApplication',
    invoke: () => prose.getLiteraryProseApplication('book', operationId),
    wire: { target, operationId },
  },
  {
    name: 'listLiteraryFindingDecisions',
    invoke: () => finding.listLiteraryFindingDecisions('book', jobId, 'cursor'),
    wire: { target, jobId, afterId: 'cursor' },
  },
  {
    name: 'listLiteraryFindingDecisionVersions',
    invoke: () => finding.listLiteraryFindingDecisionVersions('book', 'decision', 7),
    wire: { target, id: 'decision', beforeRevision: 7 },
  },
  {
    name: 'getLiteraryFindingDecisionVersion',
    invoke: () => finding.getLiteraryFindingDecisionVersion('book', 'decision', 7),
    wire: { target, id: 'decision', revision: 7 },
  },
  {
    name: 'cancelLiteraryIntegration',
    invoke: () =>
      integration.cancelPendingLiteraryIntegration(
        { ...request, level: 'book', actId: null },
        'author',
      ),
    wire: { target, jobId },
  },
  {
    name: 'listLiteraryIntegrationResults',
    invoke: () => integration.listLiteraryIntegrationResults('book', jobId, 25),
    wire: { target, jobId, afterIndex: 25 },
  },
  {
    name: 'getLiteraryIntegrationResult',
    invoke: () => integration.getLiteraryIntegrationResult('book', jobId, operationId),
    wire: { target, jobId, requestId: operationId },
  },
  {
    name: 'listLiteraryPublicationGuide',
    invoke: () => publication.listLiteraryPublicationGuide('book', jobId, 'cursor'),
    wire: { target, jobId, afterId: 'cursor' },
  },
  {
    name: 'getLiteraryPublicationGuideEntry',
    invoke: () => publication.getLiteraryPublicationGuideEntry('book', jobId, 'entry'),
    wire: { target, jobId, id: 'entry' },
  },
  {
    name: 'getLiteraryPublicationGuideVersion',
    invoke: () => publication.getLiteraryPublicationGuideVersion('book', jobId, 'entry', 7),
    wire: { target, jobId, id: 'entry', revision: 7 },
  },
  {
    name: 'listLiteraryProgressArtifacts',
    invoke: () => progress.listLiteraryProgressArtifacts('book', 'review', 'cursor'),
    wire: { target, stage: 'review', afterId: 'cursor' },
  },
  {
    name: 'getLiteraryProgressArtifact',
    invoke: () => progress.getLiteraryProgressArtifact('book', 'review', 'entry'),
    wire: { target, stage: 'review', id: 'entry' },
  },
  {
    name: 'saveLiteraryProgressNote',
    invoke: () =>
      progress.saveLiteraryProgressNote(
        {
          target,
          stage: 'review',
          id: 'entry',
          sourceToken: token,
          expectedRevision: 3,
          operationId,
          notes: { blockers: ['Conferir voz'], nextStep: 'Comparar' },
        },
        'author',
        'entry',
      ),
    wire: {
      target,
      stage: 'review',
      id: 'entry',
      sourceToken: token,
      expectedRevision: 3,
      operationId,
      notes: { blockers: ['Conferir voz'], nextStep: 'Comparar' },
    },
  },
];
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal('crypto', webcrypto);
  transport.callable.mockReturnValue(transport.invoke);
  transport.invoke.mockResolvedValue({ data: response });
});
afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});
describe('sector transport, frozen identities and explicit author actions', () => {
  it.each(cases)('$name preserves the original wire and server response', async (item) => {
    expect(await item.invoke()).toBe(response);
    expect(transport.invoke).toHaveBeenCalledExactlyOnceWith(item.wire);
    expect(transport.callable.mock.calls[0]?.[1]).toBe(item.name);
    expect(listLiteraryPendingOperations('author', 'book')).toEqual([]);
  });
  it.each(cases)(
    '$name propagates an uncertain result without retrying or changing its wire',
    async (item) => {
      const error = new Error('Resposta perdida');
      transport.invoke.mockRejectedValueOnce(error);
      await expect(item.invoke()).rejects.toBe(error);
      expect(transport.invoke).toHaveBeenCalledExactlyOnceWith(item.wire);
      expect(transport.callable).toHaveBeenCalledOnce();
      expect(listLiteraryPendingOperations('other', 'book')).toEqual([]);
    },
  );
  it('keeps an unconfirmed prose request discoverable without generating it again', async () => {
    transport.invoke.mockResolvedValue({ data: { state: 'unconfirmed' } });
    await expect(prose.recoverLiteraryProse(proseRequest, 'author')).rejects.toThrow(
      'sem reenviar',
    );
    expect(transport.callable.mock.calls.map((call) => call[1])).toEqual(['getLiteraryProse']);
    expect(listLiteraryPendingOperations('author', 'book')).toMatchObject([
      { kind: 'prose', id: operationId, operationId },
    ]);
  });
  it.each([
    'invalid-argument',
    'failed-precondition',
    'not-found',
    'permission-denied',
    'unauthenticated',
    'resource-exhausted',
  ])('distinguishes definitive %s from uncertain transport failures', (code) => {
    expect(finding.findingRequestRejected({ code: `functions/${code}` })).toBe(true);
    expect(finding.findingRequestRejected(new Error('Rede indisponível'))).toBe(false);
    expect(finding.findingRequestRejected(null)).toBe(false);
    expect(finding.findingRequestRejected({ code: 'functions/unavailable' })).toBe(false);
  });
});
