import { beforeEach, expect, it, vi } from 'vitest';
import * as api from '../services/literaryImpactService';
import { impactStart, impactFrame, impactHash } from './impactFixtures';
const transport = vi.hoisted(() => ({ invoke: vi.fn(), callable: vi.fn(), functions: {} }));
vi.mock('@/shared/api/domainCallable', () => ({
  getFunctions: () => transport.functions,
  httpsCallable: transport.callable,
}));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: () => ({}) }));
beforeEach(() => {
  vi.clearAllMocks();
  transport.callable.mockReturnValue(transport.invoke);
  transport.invoke.mockResolvedValue({ data: impactFrame });
});
it('routes scope and start through the domain transport and preserves the exact frozen start wire', async () => {
  await api.getLiteraryImpactScope('book', {
    bookIds: ['book'],
    sources: impactStart.sources,
    prepareIndices: false,
  });
  expect(transport.callable).toHaveBeenLastCalledWith(
    transport.functions,
    'getLiteraryImpactScope',
    { timeout: 120000 },
  );
  expect(transport.invoke).toHaveBeenLastCalledWith({
    target: impactStart.target,
    bookIds: ['book'],
    sources: impactStart.sources,
    prepareIndices: false,
  });
  await api.startLiteraryImpact(impactStart);
  expect(transport.invoke).toHaveBeenLastCalledWith(impactStart);
});
it('queries the original receipt by book incarnation and request hash without an automatic producer fallback', async () => {
  transport.invoke.mockRejectedValueOnce(new Error('unknown outcome'));
  await expect(
    api.getLiteraryImpactOperation(
      'book',
      impactFrame.jobId,
      'original-step',
      impactHash,
      impactFrame.bookToken,
    ),
  ).rejects.toThrow('unknown outcome');
  expect(transport.callable).toHaveBeenCalledTimes(1);
  expect(transport.callable).toHaveBeenLastCalledWith(
    transport.functions,
    'getLiteraryImpactOperation',
    { timeout: 120000 },
  );
  expect(transport.invoke).toHaveBeenLastCalledWith({
    target: impactStart.target,
    jobId: impactFrame.jobId,
    operationId: 'original-step',
    requestHash: impactHash,
    expectedBookToken: impactFrame.bookToken,
  });
});
it('uses a distinct metadata-only operation-close action with the original method and identity', async () => {
  await api.cancelLiteraryImpactOperation(
    'book',
    impactFrame.jobId,
    'original-step',
    'resolveLiteraryImpact',
    impactHash,
    impactFrame.originToken,
  );
  expect(transport.callable).toHaveBeenLastCalledWith(
    transport.functions,
    'cancelLiteraryImpactOperation',
    { timeout: 120000 },
  );
  expect(transport.invoke).toHaveBeenLastCalledWith({
    target: impactStart.target,
    jobId: impactFrame.jobId,
    operationId: 'original-step',
    method: 'resolveLiteraryImpact',
    requestHash: impactHash,
    expectedOriginToken: impactFrame.originToken,
  });
});
it('paginates observations with their original control identity and keeps private-note reads separate', async () => {
  await api.readLiteraryImpactPage(
    'book',
    impactFrame.jobId,
    impactFrame.originToken,
    'decisions',
    'cursor',
  );
  expect(transport.invoke).toHaveBeenLastCalledWith({
    target: impactStart.target,
    jobId: impactFrame.jobId,
    expectedOriginToken: impactFrame.originToken,
    kind: 'decisions',
    afterId: 'cursor',
    limit: 25,
  });
  expect(transport.callable).toHaveBeenCalledTimes(1);
});
