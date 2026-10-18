import { webcrypto } from 'node:crypto';
import { vi } from 'vitest';
import type {
  ComparisonIdentity,
  ComparisonProgress,
  ComparisonSource,
  ComparisonReadEnvelope,
  StartComparisonPending,
  StepComparisonPending,
  ComparisonItemSummary,
} from '../model/campaignComparison';
export const uid = 'owner',
  campaignId = 'campaign',
  comparisonId = 'comparison-1',
  currentBaseId = 'a'.repeat(64),
  candidateBaseId = 'b'.repeat(64),
  campaignToken = 'c'.repeat(64),
  sourceToken = 'd'.repeat(64),
  token = 'e'.repeat(64),
  sceneKey = '1'.repeat(64),
  loreKey = '2'.repeat(64),
  imageKey = '3'.repeat(64),
  referenceKey = '4'.repeat(64),
  rootKey = '5'.repeat(64);
export const identity: ComparisonIdentity = {
  schemaVersion: 1,
  ownerId: uid,
  comparisonId,
  campaignId,
  campaignToken,
  currentBaseId,
  candidateBaseId,
};
export const source: ComparisonSource = {
  schemaVersion: 1,
  ownerId: uid,
  campaignId,
  campaignToken,
  currentBaseId,
  currentCapturedAt: 1000,
  adventureId: 'adventure',
  sourceToken,
};
export const envelope: ComparisonReadEnvelope = {
  ...identity,
  currentCapturedAt: 1000,
  candidateCapturedAt: 2000,
  collectionRevision: 0,
  comparisonToken: token,
};
export const progress: ComparisonProgress = {
  ...identity,
  state: 'ready',
  phase: 'complete',
  checkpoint: 3,
  processed: 2,
  counts: {
    part: 0,
    scene: 1,
    block: 0,
    arc: 0,
    milestone: 0,
    event: 0,
    lore: 1,
    loreReference: 1,
    image: 1,
  },
  sourceAvailable: true,
  cleanupComplete: false,
  reason: null,
  createdAt: 1000,
  updatedAt: 2000,
};
export const startPending: StartComparisonPending = {
  schemaVersion: 1,
  ownerId: uid,
  scope: { kind: 'start', campaignId },
  phase: 'request',
  input: {
    campaignId,
    campaignToken,
    currentBaseId,
    expectedSourceToken: sourceToken,
    operationId: comparisonId,
  },
  expected: { campaignId, campaignToken, currentBaseId, comparisonId },
};
export const stepPending: StepComparisonPending = {
  schemaVersion: 1,
  ownerId: uid,
  scope: { kind: 'job', campaignId, comparisonId },
  method: 'advance',
  input: { comparisonId, operationId: 'step-1', expectedCheckpoint: 1 },
  expected: identity,
};
export const sceneSummary: ComparisonItemSummary = {
  sourceKey: sceneKey,
  kind: 'scene',
  parentKey: null,
  title: 'Cena congelada',
  archived: false,
  orderContext: { previousKey: null, nextKey: null },
  stage: 'draft',
};
export const loreSummary: ComparisonItemSummary = {
  sourceKey: loreKey,
  kind: 'lore',
  parentKey: null,
  title: 'Guardiã congelada',
  archived: false,
  orderContext: null,
  category: 'character',
};
export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export function installBrowser() {
  localStorage.clear();
  vi.stubGlobal('crypto', webcrypto);
  let tail = Promise.resolve();
  let gate: Promise<void> | null = null;
  const request = vi.fn((_key: string, work: () => unknown) => {
    const call = tail.then(async () => {
      if (gate) await gate;
      return work();
    });
    tail = call.then(
      () => {},
      () => {},
    );
    return call;
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
export async function sha(content: string): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content))),
    (b) => b.toString(16).padStart(2, '0'),
  ).join('');
}
