import type {
  LiteraryIntegration,
  StartLiteraryIntegration,
  ArchitectureSourcePreview,
  IntegrationResult,
} from '../../../src/features/literary-production/services/literaryIntegrationService';
import { DEFAULT_PLATFORM_MODEL } from '../../../functions/src/chatGeneration.mjs';
let current: {
  bookId: string;
  input: StartLiteraryIntegration;
  job: LiteraryIntegration;
  advances: number;
} | null = null;
function access(bookId: string, jobId: string) {
  if (!current || current.bookId !== bookId || current.job.jobId !== jobId)
    throw new Error('Registro visual indisponível.');
  return current;
}
export const startLiteraryIntegration = (input: StartLiteraryIntegration) => {
  const job: LiteraryIntegration = {
    jobId: input.jobId,
    level: input.level,
    actId: input.actId,
    audit: input.audit,
    state: 'planning',
    chapters: 2,
    contextChapters: 0,
    units: 2,
    readUnits: 0,
    segments: 0,
    boundaries: 0,
    expectedBoundaries: 1,
    analyses: 0,
    blocking: 0,
    warnings: 0,
    suggestions: 0,
    sourceToken: 'a'.repeat(64),
    pendingRequestId: null,
    finalRequestId: null,
    authorAccepted: false,
    createdAt: 1,
    completedAt: null,
    message: null,
    coverage: {
      scope: 'book',
      wholeAct: false,
      wholeBook: false,
      verifiedUnits: 0,
      verifiedAnalyses: 0,
    },
    architecture: {
      families: ['plan', 'chapter', 'act', 'event'],
      sources: 0,
      readSources: 0,
      segments: 0,
      verifiedSources: 0,
      inventoryComplete: false,
      complete: false,
      referenceBodiesRead: false,
    },
  };
  current = { bookId: input.target.id, input: structuredClone(input), job, advances: 0 };
  return Promise.resolve(structuredClone(job));
};
export const getLiteraryIntegration = (bookId: string, jobId: string) =>
  Promise.resolve(structuredClone(access(bookId, jobId).job));
export const getLiteraryIntegrationSetup = (bookId: string, jobId: string) => {
  const record = access(bookId, jobId);
  return Promise.resolve({
    level: record.job.level,
    actId: record.job.actId,
    audit: record.job.audit,
    instruction: record.input.instruction,
    generation: { version: 1, provider: 'platform', model: DEFAULT_PLATFORM_MODEL },
  });
};
export const advanceLiteraryIntegration = (bookId: string, jobId: string) => {
  const record = access(bookId, jobId);
  record.advances++;
  if (!record.job.architecture!.inventoryComplete)
    record.job = {
      ...record.job,
      architecture: {
        ...record.job.architecture!,
        sources: 13,
        inventoryComplete: record.advances >= 2,
      },
    };
  else
    record.job = {
      ...record.job,
      state: 'done',
      readUnits: 2,
      segments: 2,
      boundaries: 1,
      analyses: 18,
      finalRequestId: 'fixture-architecture-final',
      completedAt: 2,
      coverage: {
        scope: 'book',
        wholeAct: false,
        wholeBook: true,
        verifiedUnits: 2,
        verifiedAnalyses: 18,
      },
      architecture: {
        ...record.job.architecture!,
        readSources: 13,
        segments: 14,
        verifiedSources: 13,
        complete: true,
      },
    };
  return Promise.resolve(structuredClone(record.job));
};
export const cancelLiteraryIntegration = (bookId: string, jobId: string) => {
  const record = access(bookId, jobId);
  record.job = { ...record.job, state: 'canceled', authorAccepted: false };
  return Promise.resolve(structuredClone(record.job));
};
export const cancelPendingLiteraryIntegration = (input: StartLiteraryIntegration) =>
  cancelLiteraryIntegration(input.target.id, input.jobId);
export const cancelPendingLiteraryIntegrationAnalysis = cancelLiteraryIntegration;
export const retryLiteraryIntegrationAnalysis = getLiteraryIntegration;
export const acceptLiteraryIntegration = (
  bookId: string,
  jobId: string,
  expectedSourceToken: string,
) => {
  const record = access(bookId, jobId);
  if (record.job.state !== 'done' || record.job.sourceToken !== expectedSourceToken)
    return Promise.reject(new Error('Conferência pendente.'));
  record.job = { ...record.job, authorAccepted: true };
  return Promise.resolve(structuredClone(record.job));
};
export const listLiteraryIntegrations = (bookId: string, afterId: string | null = null) => {
  if (new URLSearchParams(window.location.search).has('literaryPassage')) {
    const accepted: LiteraryIntegration = {
      jobId: 'fixture-previous-act-integration',
      level: 'act',
      actId: 'fixture-prior-act',
      state: 'done',
      chapters: 3,
      contextChapters: 0,
      units: 6,
      readUnits: 6,
      segments: 6,
      boundaries: 2,
      expectedBoundaries: 2,
      analyses: 9,
      blocking: 0,
      warnings: 0,
      suggestions: 0,
      sourceToken: 'a'.repeat(64),
      pendingRequestId: null,
      finalRequestId: 'fixture-final-result',
      authorAccepted: true,
      createdAt: 1730000000000,
      completedAt: 1730000000001,
      message: null,
      coverage: {
        scope: 'act',
        wholeAct: true,
        wholeBook: false,
        verifiedUnits: 6,
        verifiedAnalyses: 9,
      },
    };
    return Promise.resolve({
      items: afterId ? [accepted] : [],
      nextAfterId: afterId ? null : 'fixture-integration-page-two',
    });
  }
  return Promise.resolve({
    items: current?.bookId === bookId && afterId === null ? [structuredClone(current.job)] : [],
    nextAfterId: null,
  });
};
export const listLiteraryIntegrationResults = (
  bookId: string,
  jobId: string,
  afterIndex: number | null = null,
) => {
  access(bookId, jobId);
  return Promise.resolve({
    items:
      afterIndex === null
        ? [
            { index: 0, requestId: 'fixture-architecture-reading', kind: 'architecture' as const },
            { index: 1, requestId: 'fixture-architecture-final', kind: 'synthesis' as const },
          ]
        : [],
    nextAfterIndex: null,
  });
};
export const getLiteraryIntegrationResult = (
  bookId: string,
  jobId: string,
  requestId: string,
): Promise<IntegrationResult> => {
  const record = access(bookId, jobId);
  if (record.job.state !== 'done') return Promise.resolve({ requestId, state: 'running' });
  const common = { requestId, jobId, state: 'done' as const, reusedFrom: null };
  if (requestId === 'fixture-architecture-final')
    return Promise.resolve({
      ...common,
      kind: 'synthesis',
      evidenceIds: ['fixture-architecture-reading'],
      sources: [],
      result: {
        complete: true,
        report:
          'A promessa e os plantios foram confrontados com as versões lidas. A reserva sobre a irmã continua aberta.',
        findings: [
          {
            severity: 'warning',
            problem: 'A virada precisa ser conciliada com a ordem da carta.',
            action: 'Escolher a estrutura de destino e registrar a intenção.',
            evidenceIds: ['fixture-architecture-reading'],
            status: 'open',
          },
        ],
        conclusions: [
          {
            axis: 'planting',
            observation:
              'A carta prepara a escolha; a intenção da ficha permanece distinta da evidência do manuscrito.',
            evidenceIds: ['fixture-architecture-reading'],
            status: 'proposal',
          },
        ],
        coverage: {
          scope: 'evidence-synthesis',
          wholeChapter: false,
          wholeAct: false,
          wholeBook: false,
        },
      },
    });
  return Promise.resolve({
    ...common,
    kind: 'architecture',
    evidenceIds: [],
    sources: [{ id: 'architecture:plan:promise', label: 'Promessa da carta', offsetBase: 0 }],
    result: {
      complete: true,
      report: 'A intenção da ficha é uma proposta, não um acontecimento comprovado no manuscrito.',
      findings: [],
      matrix: [
        {
          axis: 'promise',
          subject: 'Ana',
          observation: 'A confiança tem um custo a desenvolver.',
          certainty: 'interpretation',
          evidence: [
            {
              sourceId: 'architecture:plan:promise',
              quote: 'Uma carta muda o custo de confiar.',
              offset: 0,
            },
          ],
          status: 'proposal',
        },
      ],
      coverage: {
        scope: 'architecture-segment',
        wholeChapter: false,
        wholeAct: false,
        wholeBook: false,
      },
    },
  });
};
export const listLiteraryArchitectureInventory = (
  bookId: string,
  jobId: string,
  afterIndex: number | null = null,
) => {
  const record = access(bookId, jobId);
  return Promise.resolve({
    state: record.job.state,
    inventoryComplete: record.job.architecture!.inventoryComplete,
    items:
      afterIndex === null
        ? [
            {
              index: 0,
              source: { kind: 'plan', id: 'promise', arcId: null },
              label: 'Promessa da carta',
              available: true,
              read: false,
            },
          ]
        : [],
    nextAfterIndex: null,
  });
};
export const previewLiteraryArchitectureSource = (
  bookId: string,
  jobId: string,
  index: number,
  segment = 0,
): Promise<ArchitectureSourcePreview> => {
  access(bookId, jobId);
  if (index !== 0 || segment < 0 || segment > 1)
    return Promise.reject(new Error('Prévia visual indisponível.'));
  return Promise.resolve({
    state: 'ready',
    index,
    segment,
    segmentCount: 2,
    source: {
      id: 'architecture:plan:promise',
      label: 'Promessa da carta',
      locator: { kind: 'plan', id: 'promise', arcId: null },
      format: 'canonical-json',
      text:
        segment === 0
          ? 'Uma carta muda o custo de confiar. Esta é uma intenção editorial.'
          : 'A reserva sobre a irmã não deve ser revelada antes de sua preparação.',
      offsetBase: segment * 100,
    },
    editorial: {
      instruction:
        'Diferencie intenção da ficha, fato do manuscrito e conhecimento do personagem. Preserve reservas futuras.',
      documents: [
        {
          id: 'contract',
          label: 'Contrato editorial vigente',
          text: 'Promessa: a confiança tem consequências.',
        },
      ],
    },
    scope: { manuscriptRead: false, wholeArchitecture: false },
  });
};
