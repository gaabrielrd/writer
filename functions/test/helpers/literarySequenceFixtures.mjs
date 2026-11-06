import { fixture, nextChapter, target, limits, phases } from './literaryWorkflowFixtures.mjs';
import { createLiterarySequenceService } from '../../src/literarySequence.mjs';
import { createLiteraryProductionService } from '../../src/literaryProduction.mjs';
export const id = 'sequence-native-0001';
export async function setup(options = {}) {
  const f = await fixture(options),
    next = await nextChapter(f, { actId: options.acts ? 'second' : null }),
    api = createLiterarySequenceService({ db: f.db, now: () => 600 });
  if (options.publicationPolicy) {
    const saved = f.records.get('books/book/literaryProduction/current'),
      contract = structuredClone(saved.contract);
    contract.publicationPolicy = options.publicationPolicy;
    await createLiteraryProductionService({ db: f.db, now: () => 550 }).saveLiteraryContract(
      'author',
      {
        target,
        operationId: 'sequence-publication-policy-0001',
        expectedRevision: saved.revision,
        contract,
      },
    );
    await f.prepareGate();
  }
  const scope = await api.getLiterarySequenceScope('author', {
    target,
    chapterIds: [f.chapterId, next.chapterId],
  });
  const input = {
    target,
    jobId: id,
    chapterIds: [f.chapterId, next.chapterId],
    expectedScopeToken: scope.originToken,
    instruction: 'PRIVATE_SEQUENCE_INSTRUCTION',
    limits: { maxApplications: 3, maxCredits: 3, maxSteps: 1000 },
    authorizedPhases: options.mode && options.mode !== 'continuous' ? [] : phases,
    continueBetweenChapters: !options.mode || options.mode === 'continuous',
  };
  const start = () => api.startLiterarySequence('author', input);
  const get = () => api.getLiterarySequence('author', { target, jobId: id });
  const startFirst = async () => {
    const seq = await get();
    const wire = await f.startInput({
      budget: { ...limits, maxSteps: Math.min(limits.maxSteps, seq.limits.maxSteps - seq.steps) },
    });
    wire.instruction = input.instruction;
    return f.api.startLiteraryWorkflow(
      'author',
      wire,
      api.workflowHooks('author', { target, jobId: id, expectedOriginToken: seq.originToken }),
    );
  };
  const startNext = async () => {
    const seq = await get(),
      wire = await next.input();
    wire.instruction = input.instruction;
    wire.limits = {
      ...limits,
      maxApplications: Math.max(0, seq.limits.maxApplications - seq.applications),
      maxCredits: Math.max(0, seq.limits.maxCredits - seq.credits),
    };
    return f.api.startLiteraryWorkflow(
      'author',
      wire,
      api.workflowHooks('author', { target, jobId: id, expectedOriginToken: seq.originToken }),
    );
  };
  const complete = async (workflowId) => {
    const seq = await get();
    return api.completeLiterarySequenceChapter('author', {
      target,
      jobId: id,
      workflowId,
      expectedRevision: seq.revision,
      expectedOriginToken: seq.originToken,
    });
  };
  const control = async (action, extra = {}) => {
    const seq = await get();
    return api.setLiterarySequenceControl('author', {
      target,
      jobId: id,
      action,
      expectedRevision: seq.revision,
      expectedOriginToken: seq.originToken,
      ...extra,
    });
  };
  return {
    ...f,
    next,
    sequence: api,
    input,
    startSequence: start,
    getSequence: get,
    startFirst,
    startNext,
    complete,
    sequenceControl: control,
  };
}
