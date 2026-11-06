import type {
  ImpactFrame,
  ImpactIntent,
  ImpactScope,
  ImpactStart,
  ImpactAdvance,
  ImpactResolve,
  ImpactCancel,
  ImpactPage,
  ImpactPageKind,
  ImpactRowMap,
  ImpactMethod,
  ImpactOperation,
} from '../../../src/features/literary-production/model/impact';
const origin = 'f'.repeat(64),
  bookToken = 'b'.repeat(64);
const frames = new Map<string, ImpactFrame>();
const decisions = new Map<
  string,
  {
    revision: number;
    status: ImpactResolve['status'];
    rationale: string;
    evidence: Array<{ note: string }>;
    updatedAt: number;
  }
>();
function record(action: string) {
  const key = 'fixture:impact-calls';
  const values = JSON.parse(localStorage.getItem(key) ?? '[]') as string[];
  localStorage.setItem(key, JSON.stringify([...values, action]));
}
function initial(bookId: string, jobId: string): ImpactFrame {
  return {
    jobId,
    phase: 'partial',
    revision: 10,
    bookToken,
    originToken: origin,
    bookIds: [bookId],
    sources: [{ kind: 'book', id: bookId, scopeKind: 'book', scopeId: bookId }],
    prepareIndices: false,
    current: true,
    steps: 67,
    inventoryIndex: 30,
    inventoryCount: 30,
    records: 12,
    unavailable: 1,
    unsupported: 1,
    identityUnknown: 2,
    graph: { state: 'done' },
    coverage: { complete: false },
    pendingIndex: null,
    reason: null,
    createdAt: 1780000000000,
    semanticCompleteness: false,
    publicationReady: false,
    authorAccepted: false,
  };
}
const frame = (bookId: string, jobId: string) => frames.get(jobId) ?? initial(bookId, jobId);
export function getLiteraryImpactScope(
  _bookId: string,
  intent: ImpactIntent,
): Promise<ImpactScope> {
  record('scope');
  return Promise.resolve({
    bookToken,
    scopeToken: 'd'.repeat(64),
    bookIds: intent.bookIds,
    inventoryCount: 30,
    registryToken: 'e'.repeat(64),
    maximumBooksPerRun: 10,
    scope: 'registered-dependencies',
    historicalOriginCoverage: false,
    publicationReady: false,
  });
}
export function startLiteraryImpact(input: ImpactStart) {
  record('start');
  const value = {
    ...initial(input.target.id, input.jobId),
    ...input,
    phase: 'freezing' as const,
    revision: 1,
    steps: 0,
    inventoryIndex: 0,
  };
  frames.set(input.jobId, value);
  return Promise.resolve(structuredClone(value));
}
export function getLiteraryImpact(bookId: string, jobId: string) {
  record('get');
  return Promise.resolve(structuredClone(frame(bookId, jobId)));
}
export function listLiteraryImpacts(bookId: string) {
  record('list');
  return Promise.resolve({ items: [frame(bookId, 'impact-visual-map')], nextAfterId: null });
}
export function advanceLiteraryImpact(input: ImpactAdvance) {
  record('advance');
  const value = {
    ...frame(input.target.id, input.jobId),
    phase: 'partial' as const,
    revision: input.expectedRevision + 1,
  };
  frames.set(input.jobId, value);
  return Promise.resolve(structuredClone(value));
}
export function resolveLiteraryImpact(input: ImpactResolve) {
  record('resolve');
  const revision = input.expectedDecisionRevision + 1;
  decisions.set(input.checkId, {
    revision,
    status: input.status,
    rationale: input.rationale,
    evidence: input.evidence,
    updatedAt: 1780000000010,
  });
  const value = frame(input.target.id, input.jobId);
  frames.set(input.jobId, { ...value, revision: input.expectedRevision + 1 });
  return Promise.resolve({
    jobId: input.jobId,
    decisionId: 'visual-decision',
    decisionRevision: revision,
    revision: input.expectedRevision + 1,
    status: input.status,
    publicationReady: false as const,
  });
}
export function cancelLiteraryImpact(input: ImpactCancel) {
  record('cancel');
  return Promise.resolve({
    jobId: input.jobId,
    phase: 'canceled' as const,
    revision: 11,
    originToken: origin,
    publicationReady: false as const,
  });
}
export function getLiteraryImpactOperation(): Promise<ImpactOperation> {
  record('outcome');
  return Promise.resolve({ status: 'unknown' });
}
export function cancelLiteraryImpactOperation(
  _bookId: string,
  jobId: string,
  operationId: string,
  method: ImpactMethod,
): Promise<ImpactOperation> {
  record('close-operation');
  return Promise.resolve({
    status: 'canceled',
    method,
    originToken: origin,
    result: { jobId, operationId, operationCanceled: true },
  });
}
export function readLiteraryImpactPage<K extends ImpactPageKind>(
  bookId: string,
  jobId: string,
  _origin: string,
  kind: K,
): Promise<ImpactPage<K>> {
  record('page:' + kind);
  const source = initial(bookId, jobId).sources[0];
  const check = {
    id: 'visual-check',
    jobId,
    from: source,
    to: {
      kind: 'chapter' as const,
      id: 'chapter-visual',
      scopeKind: 'book' as const,
      scopeId: bookId,
    },
    relation: 'source',
    sourceLabel: 'O livro e suas decisões editoriais',
    targetLabel: 'A travessia ao amanhecer e a informação revelada na chegada à cidade',
    observationToken: 'd'.repeat(64),
    facts: { status: 'unverified', sourceIdentityVerified: false, versionMatches: null },
    decision: decisions.get('visual-check'),
  };
  const items =
    kind === 'checks'
      ? [check]
      : kind === 'visits'
        ? [
            {
              id: 'visit',
              visit: { node: check.to, source, effect: 'dependency-check', depth: 1 },
              label: check.targetLabel,
              observationToken: 'd'.repeat(64),
            },
          ]
        : kind === 'nodes'
          ? [
              {
                id: 'node',
                node: source,
                label: check.sourceLabel,
                observationToken: 'd'.repeat(64),
              },
            ]
          : kind === 'decisions' && decisions.has('visual-check')
            ? [
                {
                  ...decisions.get('visual-check')!,
                  id: 'decision',
                  jobId,
                  checkId: 'visual-check',
                  observationToken: 'e'.repeat(64),
                },
              ]
            : [];
  return Promise.resolve({
    items: items as ImpactRowMap[K][],
    nextAfterId: null,
    labelsAreCurrent: true,
    semanticCompleteness: false,
    publicationReady: false,
  });
}
export async function impactRequestHash(input: object) {
  const value = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify(input)),
  );
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
