import { webcrypto } from 'node:crypto';
import { vi } from 'vitest';
import type {
  AdoptionIdentity,
  AdoptionProgress,
  AdoptionDecision,
  StartAdoptionPending,
  StepAdoptionPending,
} from '../model/campaignAdoption';
import type { ComparisonReadEnvelope } from '@/features/campaign-comparisons';
export const uid = 'owner',
  campaignId = 'campaign',
  adoptionId = 'adoption-one',
  sourceKey = '1'.repeat(64),
  otherKey = '2'.repeat(64);
export const identity: AdoptionIdentity = {
  schemaVersion: 1,
  ownerId: uid,
  campaignId,
  adoptionId,
  campaignToken: 'c'.repeat(64),
  comparisonId: 'comparison',
  currentBaseId: 'a'.repeat(64),
  candidateBaseId: 'b'.repeat(64),
  loreGenerationId: 'd'.repeat(64),
  expectedCollectionRevision: 2,
};
export const context: ComparisonReadEnvelope = {
  schemaVersion: 1,
  ownerId: uid,
  campaignId,
  campaignToken: identity.campaignToken,
  comparisonId: identity.comparisonId,
  currentBaseId: identity.currentBaseId,
  candidateBaseId: identity.candidateBaseId,
  currentCapturedAt: 1000,
  candidateCapturedAt: 2000,
  collectionRevision: 2,
  comparisonToken: 'e'.repeat(64),
};
export const progress: AdoptionProgress = {
  ...identity,
  state: 'reviewing',
  phase: 'review',
  checkpoint: 0,
  processed: 0,
  sourceAvailable: true,
  cleanupComplete: false,
  reason: null,
  createdAt: 1000,
  updatedAt: 2000,
};
export const row: AdoptionDecision = {
  sourceKey,
  revision: 3,
  mode: 'override',
  legacy: false,
  current: { name: 'Guardiã da mesa', category: 'character' },
  candidate: { present: false },
  choice: null,
  required: true,
  impediments: [],
};
export const start: StartAdoptionPending = {
  schemaVersion: 1,
  ownerId: uid,
  scope: { kind: 'start', campaignId },
  phase: 'request',
  input: {
    operationId: adoptionId,
    campaignId,
    campaignToken: identity.campaignToken,
    comparisonId: identity.comparisonId,
    currentBaseId: identity.currentBaseId,
    candidateBaseId: identity.candidateBaseId,
    expectedCollectionRevision: 2,
  },
  expected: {
    adoptionId,
    campaignId,
    campaignToken: identity.campaignToken,
    comparisonId: identity.comparisonId,
    currentBaseId: identity.currentBaseId,
    candidateBaseId: identity.candidateBaseId,
    expectedCollectionRevision: 2,
  },
};
export const step: StepAdoptionPending = {
  schemaVersion: 1,
  ownerId: uid,
  scope: { kind: 'job', campaignId, adoptionId },
  method: 'prepare',
  input: { adoptionId, operationId: 'prepare-one', expectedCheckpoint: 0 },
  expected: identity,
};
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (value: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export function installBrowser() {
  localStorage.clear();
  vi.stubGlobal('crypto', webcrypto);
  let tail = Promise.resolve(),
    gate: Promise<void> | null = null;
  const request = vi.fn((_key: string, work: () => unknown) => {
    const result = tail.then(async () => {
      if (gate) await gate;
      return work();
    });
    tail = result.then(
      () => {},
      () => {},
    );
    return result;
  });
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
  return {
    request,
    hold: (value: Promise<void>) => {
      gate = value;
    },
    release: () => {
      gate = null;
    },
  };
}
