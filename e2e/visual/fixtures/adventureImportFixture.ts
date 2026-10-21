/** Transport-only simulated server. Production normalization, journal, AES, IDB and Web Locks remain real. */
import type * as A from '../../../src/features/adventure-import/model/adventureImport';
import { countWords } from '../../../src/shared/lib/countWords';
import { fixtureInstallImportedAdventure, fixtureOwner } from './studioStore';
import { createScene, createSceneGroup } from './sceneService';
import { FIXTURE_TIME } from './data';

type Job = {
  progress: A.ImportProgress;
  project: A.ImportProject;
  sections: A.ImportSection[];
  key: string | null;
};
type Operation = { importId: string; fingerprint: string; receipt: A.ImportReceipt };
type Data = {
  jobs: Record<string, Job>;
  operations: Record<string, Operation>;
  fences: Record<string, string>;
  calls: {
    uid: string;
    method: string;
    importId: string;
    operationId?: string;
    index?: number;
    stage: string;
  }[];
};
type Method =
  | A.ImportAction
  | 'getAdventureImport'
  | 'listAdventureImports'
  | 'resolveAdventureImportStart'
  | 'getAdventureImportRecoveryKey';
type Fault = { method: Method; mode: 'hold-before' | 'hold-after' | 'fail-before' | 'fail-after' };
const storageKey = 'writer.visual.adventure-import-server';
const faultKey = 'writer.visual.adventure-import-fault';
const k = (uid: string, id: string) => JSON.stringify([uid, id]);
const read = (): Data =>
  JSON.parse(
    localStorage.getItem(storageKey) ?? '{"jobs":{},"operations":{},"fences":{},"calls":[]}',
  ) as Data;
const write = (data: Data) => localStorage.setItem(storageKey, JSON.stringify(data));
function fail(reason: string, code = 'failed-precondition'): never {
  throw Object.assign(new Error('Confira a preparação antes de tentar novamente.'), {
    code: 'functions/' + code,
    details: { reason },
  });
}
const sorted = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(sorted)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.entries(v)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, value]) => [key, sorted(value)]),
        )
      : v;
async function hashText(value: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, '0')).join('');
}
const digest = (v: unknown) => hashText(JSON.stringify(sorted(v)));
const phases: Record<A.ImportState, A.ImportPhase> = {
  uploading: 'upload',
  preparing: 'materialize',
  ready: 'ready',
  activated: 'complete',
  deleting: 'cleanup',
  deleted: 'deleted',
};
function row(data: Data, uid: string, input: { importId: string; jobToken?: string }): Job {
  const job = data.jobs[k(uid, input.importId)];
  if (!job) fail('import-unavailable', 'not-found');
  if (input.jobToken !== undefined && job.progress.jobToken !== input.jobToken)
    fail('identity-mismatch');
  return job;
}
const confirmed = (job: Job, receipt: A.ImportReceipt): A.ImportConfirmed => ({
  kind: 'confirmed',
  receipt: structuredClone(receipt),
  progress: structuredClone(job.progress),
});
async function transport<T>(
  method: Method,
  input: { importId?: string; operationId?: string; index?: number },
  work: (data: Data, uid: string) => Promise<T> | T,
): Promise<T> {
  const uid = fixtureOwner(),
    importId = input.importId ?? input.operationId ?? '';
  const pending = JSON.parse(localStorage.getItem(faultKey) ?? 'null') as Fault | null;
  const fault = pending?.method === method ? pending : null;
  if (fault) localStorage.removeItem(faultKey);
  const stage = async (value: string) =>
    navigator.locks.request('writer.visual.import-server', () => {
      const data = read();
      data.calls.push({
        uid,
        method,
        importId,
        operationId: input.operationId,
        index: input.index,
        stage: value,
      });
      write(data);
    });
  const wait = () =>
    new Promise<void>((resolve) =>
      window.addEventListener('writer.visual.import-release', () => resolve(), { once: true }),
    );
  await stage('sent');
  if (fault?.mode === 'hold-before') {
    await stage('held-before');
    await wait();
  }
  if (fault?.mode === 'fail-before') fail('temporary-unavailable', 'unavailable');
  const result = await navigator.locks.request('writer.visual.import-server', async () => {
    const data = read();
    const value = await work(data, uid);
    write(data);
    return structuredClone(value);
  });
  await stage('committed');
  if (fault?.mode === 'hold-after') {
    await stage('held-after');
    await wait();
  }
  if (fault?.mode === 'fail-after') fail('temporary-unavailable', 'unavailable');
  return result;
}
function receipt(
  input: A.ImportMutationInput,
  action: A.ImportAction,
  job: Job,
  index: number | null,
): A.ImportReceipt {
  return {
    operationId: input.operationId,
    action,
    expectedCheckpoint: input.expectedCheckpoint,
    checkpoint: job.progress.checkpoint,
    state: job.progress.state,
    phase: job.progress.phase,
    index,
  };
}
export function fixtureImportFault(method: Method, mode: Fault['mode']) {
  localStorage.setItem(faultKey, JSON.stringify({ method, mode }));
}
export function fixtureReleaseImport() {
  window.dispatchEvent(new Event('writer.visual.import-release'));
}
export function fixtureImportInspect() {
  return structuredClone(read());
}
export function fixtureResetAdventureImports() {
  localStorage.removeItem(storageKey);
  localStorage.removeItem(faultKey);
}

export async function startAdventureImport(
  input: A.StartImportInput,
): Promise<A.ImportStartResult> {
  return transport('startAdventureImport', input, async (data, uid) => {
    const fingerprint = await digest({ action: 'startAdventureImport', request: input }),
      key = k(uid, input.operationId);
    const adventureId = await digest({
      version: 1,
      uid,
      importId: input.operationId,
      kind: 'adventure-import',
    });
    const fence = data.fences[key];
    if (fence) {
      if (fence !== fingerprint) fail('operation-mismatch', 'invalid-argument');
      return {
        schemaVersion: 1,
        ownerId: uid,
        importId: input.operationId,
        adventureId,
        kind: 'canceled',
      };
    }
    const prior = data.operations[key];
    if (prior) {
      if (prior.fingerprint !== fingerprint) fail('operation-mismatch', 'invalid-argument');
      return confirmed(row(data, uid, { importId: input.operationId }), prior.receipt);
    }
    const jobToken = await digest({
      version: 1,
      uid,
      importId: input.operationId,
      createTime: { seconds: Math.floor(FIXTURE_TIME / 1000), nanoseconds: 0 },
    });
    const keyId = Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
      n.toString(16).padStart(2, '0'),
    ).join('');
    const job: Job = {
      project: structuredClone(input.project),
      sections: [],
      key: null,
      progress: {
        schemaVersion: 1,
        ownerId: uid,
        importId: input.operationId,
        jobToken,
        adventureId,
        state: 'uploading',
        phase: 'upload',
        checkpoint: 0,
        title: input.project.title,
        universeId: input.project.universeId,
        source: structuredClone(input.source),
        keyId,
        recoveryKeyReady: false,
        reviewHash: input.reviewHash,
        sectionCount: input.sectionCount,
        totalBodyBytes: input.totalBodyBytes,
        uploadedSections: 0,
        uploadedBodyBytes: 0,
        uploadedChainHash: await digest({ version: 1, kind: 'adventure-import-sections' }),
        preparedSections: 0,
        wordCount: 0,
        cleanedSections: 0,
        cleanupComplete: false,
        result: null,
        createdAt: FIXTURE_TIME,
        updatedAt: FIXTURE_TIME,
      },
    };
    const result: A.ImportReceipt = {
      operationId: input.operationId,
      action: 'startAdventureImport',
      expectedCheckpoint: null,
      checkpoint: 0,
      state: 'uploading',
      phase: 'upload',
      index: null,
    };
    data.jobs[key] = job;
    data.operations[key] = { importId: input.operationId, fingerprint, receipt: result };
    return confirmed(job, result);
  });
}
export async function resolveAdventureImportStart(
  input: A.ResolveImportStartInput,
): Promise<A.ImportStartResult> {
  return transport('resolveAdventureImportStart', input, async (data, uid) => {
    const key = k(uid, input.operationId),
      prior = data.operations[key];
    if (prior) {
      if (prior.fingerprint !== input.requestHash) fail('operation-mismatch', 'invalid-argument');
      return confirmed(row(data, uid, { importId: input.operationId }), prior.receipt);
    }
    if (data.fences[key] && data.fences[key] !== input.requestHash)
      fail('operation-mismatch', 'invalid-argument');
    data.fences[key] = input.requestHash;
    return {
      schemaVersion: 1,
      ownerId: uid,
      importId: input.operationId,
      adventureId: await digest({
        version: 1,
        uid,
        importId: input.operationId,
        kind: 'adventure-import',
      }),
      kind: 'canceled',
    };
  });
}
export const getAdventureImport = (input: {
  importId: string;
  jobToken?: string;
}): Promise<A.ImportProgress> =>
  transport('getAdventureImport', input, (data, uid) =>
    structuredClone(row(data, uid, input).progress),
  );
export async function listAdventureImports(input: A.ListImportsInput = {}): Promise<A.ImportPage> {
  return transport('listAdventureImports', {}, (data, uid) => {
    const view = input.view ?? 'pending',
      limit = input.limit ?? 25;
    const after = input.cursor
      ? (JSON.parse(atob(input.cursor)) as { uid: string; view: string; id: string })
      : null;
    if (after && (after.uid !== uid || after.view !== view))
      fail('invalid-cursor', 'invalid-argument');
    const all = Object.values(data.jobs)
      .map((j) => j.progress)
      .filter((p) => p.ownerId === uid)
      .sort((a, b) => b.createdAt - a.createdAt || (a.importId < b.importId ? 1 : -1));
    const offset = after ? all.findIndex((p) => p.importId === after.id) + 1 : 0,
      window = all.slice(offset, offset + limit);
    const tail = window.at(-1);
    return {
      items: structuredClone(
        window.filter(
          (p) =>
            view === 'all' || ['uploading', 'preparing', 'ready', 'deleting'].includes(p.state),
        ),
      ),
      nextCursor:
        offset + window.length < all.length && tail
          ? btoa(JSON.stringify({ uid, view, id: tail.importId }))
          : null,
    };
  });
}
async function mutate(
  action: Exclude<A.ImportAction, 'startAdventureImport'>,
  input: A.ImportMutationInput | A.AppendImportInput,
): Promise<A.ImportConfirmed> {
  return transport(action, input, async (data, uid) => {
    const job = row(data, uid, input),
      p = job.progress,
      key = k(uid, input.operationId),
      fingerprint = await digest({ action, request: input });
    const prior = data.operations[key];
    if (prior) {
      if (prior.importId !== input.importId || prior.fingerprint !== fingerprint)
        fail('operation-mismatch', 'invalid-argument');
      return confirmed(job, prior.receipt);
    }
    if (p.checkpoint !== input.expectedCheckpoint) fail('checkpoint-conflict');
    let index: number | null = null;
    if (action === 'appendAdventureImportSection') {
      const request = input as A.AppendImportInput;
      index = request.index;
      if (p.state !== 'uploading' || !p.recoveryKeyReady) fail('state-conflict');
      if (index !== p.uploadedSections) fail('review-mismatch');
      const content = request.section.content,
        bodyBytes = new TextEncoder().encode(content).length,
        bodyHash = await hashText(content);
      const chain = await digest({
        version: 1,
        previous: p.uploadedChainHash,
        index,
        title: request.section.title,
        bodyHash,
        bodyBytes,
      });
      if (index + 1 === p.sectionCount) {
        const actual = await digest({
          version: 1,
          project: job.project,
          source: p.source,
          sectionCount: p.sectionCount,
          totalBodyBytes: p.uploadedBodyBytes + bodyBytes,
          sectionsHash: chain,
        });
        if (actual !== p.reviewHash) fail('review-mismatch');
      }
      job.sections.push(structuredClone(request.section));
      p.uploadedSections++;
      p.uploadedBodyBytes += bodyBytes;
      p.uploadedChainHash = chain;
      p.wordCount += countWords(content);
      if (p.uploadedSections === p.sectionCount) p.state = 'preparing';
    } else if (action === 'advanceAdventureImport') {
      if (p.state === 'preparing') {
        index = p.preparedSections++;
        if (p.preparedSections === p.sectionCount) p.state = 'ready';
      } else if (p.state === 'deleting') {
        if (p.cleanedSections < p.uploadedSections) {
          index = p.cleanedSections;
          p.cleanedSections = Math.min(p.uploadedSections, p.cleanedSections + 6);
        } else {
          p.state = 'deleted';
          p.cleanupComplete = true;
          job.sections = [];
        }
      } else fail('state-conflict');
    } else if (action === 'cancelAdventureImport') {
      if (!['uploading', 'preparing', 'ready'].includes(p.state)) fail('state-conflict');
      p.state = 'deleting';
      p.recoveryKeyReady = false;
      job.key = null;
    } else {
      if (p.state !== 'ready') fail('state-conflict');
      fixtureInstallImportedAdventure({
        id: p.adventureId,
        ownerId: uid,
        schemaVersion: 1,
        revision: 1,
        title: p.title,
        synopsis: job.project.synopsis,
        universeId: p.universeId,
        language: 'pt-BR',
        status: 'draft',
        editorialState: 'draft',
        hasProgressResources: true,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        origin: {
          kind: 'imported',
          importId: p.importId,
          sourceMediaType: p.source.mediaType,
          sourceHash: p.source.sha256,
          reviewHash: p.reviewHash,
        },
      });
      const target = { kind: 'adventure' as const, id: p.adventureId };
      for (const [i, section] of job.sections.entries()) {
        const partId = await digest({
          version: 1,
          uid,
          importId: p.importId,
          index: i,
          kind: 'part',
        });
        const sceneId = await digest({
          version: 1,
          uid,
          importId: p.importId,
          index: i,
          kind: 'scene',
        });
        const group = await createSceneGroup({ target, operationId: partId, title: section.title });
        await createScene({
          target,
          operationId: sceneId,
          parentId: group.id,
          title: section.title,
          content: section.content,
        });
      }
      job.sections = []; // Final prose now belongs only to the scene transport store.
      p.state = 'activated';
      p.result = { adventureId: p.adventureId, revision: 1 };
      p.recoveryKeyReady = false;
      job.key = null;
    }
    p.phase = phases[p.state];
    p.checkpoint++;
    p.updatedAt = FIXTURE_TIME + p.checkpoint;
    const result = receipt(input, action, job, index);
    data.operations[key] = { importId: input.importId, fingerprint, receipt: result };
    return confirmed(job, result);
  });
}
export const appendAdventureImportSection = (input: A.AppendImportInput) =>
  mutate('appendAdventureImportSection', input);
export const advanceAdventureImport = (input: A.ImportMutationInput) =>
  mutate('advanceAdventureImport', input);
export const activateAdventureImport = (input: A.ImportMutationInput) =>
  mutate('activateAdventureImport', input);
export const cancelAdventureImport = (input: A.ImportMutationInput) =>
  mutate('cancelAdventureImport', input);
export const getAdventureImportRecoveryKey = (
  input: A.ImportKeyInput,
): Promise<A.ImportRecoveryKey> =>
  transport('getAdventureImportRecoveryKey', input, (data, uid) => {
    const job = row(data, uid, input),
      p = job.progress;
    if (!['uploading', 'preparing', 'ready'].includes(p.state)) fail('state-conflict');
    if (input.reviewHash !== p.reviewHash) fail('review-mismatch');
    if (input.expectedKeyId && input.expectedKeyId !== p.keyId) fail('key-mismatch');
    if (p.recoveryKeyReady && !job.key) fail('inconsistent');
    if (!job.key) {
      job.key = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))));
      p.recoveryKeyReady = true;
    }
    return {
      schemaVersion: 1,
      ownerId: uid,
      importId: p.importId,
      jobToken: p.jobToken,
      adventureId: p.adventureId,
      reviewHash: p.reviewHash,
      keyId: p.keyId,
      algorithm: 'AES-GCM',
      keyBase64: job.key,
    };
  });
