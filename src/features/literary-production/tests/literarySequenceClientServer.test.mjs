import { createElement } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiterarySequencePanel } from '../components/LiterarySequencePanel';
import { createLiteraryPlanningService } from '../../../../functions/src/literaryPlanning.mjs';
import { createDomainHandler } from '../../../../functions/src/domainCallable.mjs';
import { FUNCTION_DOMAINS, FUNCTION_ROUTES } from '../../../../functions/src/functionDomains.mjs';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { setup, id } from '../../../../functions/test/helpers/literarySequenceFixtures.mjs';
import { target } from '../../../../functions/test/helpers/literaryWorkflowFixtures.mjs';
import { createLiterarySequenceDriver } from '../../../../functions/src/literarySequenceDriver.mjs';
import * as client from '../services/literarySequenceService';
import {
  listLiteraryPendingOperations,
  finishLiteraryOperation,
  beginLiteraryOperation,
} from '../services/literaryRecoveryStorage';
const transport = vi.hoisted(() => ({ api: null, uid: 'author', calls: [], lose: null }));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { uid: transport.uid } }) }));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: vi.fn() }));
vi.mock('@/shared/api/domainCallable', () => ({
  getFunctions: vi.fn(),
  httpsCallable: (_functions, method) => async (input) => {
    transport.calls.push({ method, input: structuredClone(input) });
    let data;
    try {
      const name = FUNCTION_ROUTES[method],
        domain = FUNCTION_DOMAINS[name];
      if (!domain) throw new Error('Unregistered sector action: ' + method);
      const dispatch = createDomainHandler({
        name,
        domain,
        invoke: (selected, request) => transport.api[selected](request.auth.uid, request.data),
      });
      data = await dispatch({
        auth: { uid: transport.uid },
        app: { appId: 'demo' },
        data: { version: 1, action: method, payload: input },
      });
    } catch (cause) {
      throw Object.assign(new Error(cause.message), {
        code: cause.code ? 'functions/' + cause.code : undefined,
      });
    }
    if (transport.lose?.(method, data)) {
      transport.lose = null;
      throw new Error('Lost acknowledgement');
    }
    return { data };
  },
}));
let f,
  sequence = 0;
const pending = () => listLiteraryPendingOperations('author', 'book');
const advanceInput = (frame) => ({
  target,
  jobId: id,
  operationId: 'sequence-client-step-' + String(++sequence).padStart(4, '0'),
  expectedRevision: frame.job.revision,
  expectedOriginToken: frame.job.originToken,
});
beforeEach(async () => {
  vi.clearAllMocks();
  localStorage.clear();
  transport.calls = [];
  transport.uid = 'author';
  transport.lose = null;
  sequence = 0;
  f = await setup();
  transport.api = createLiterarySequenceDriver({
    db: f.db,
    workflows: f.api,
    sequences: f.sequence,
    now: () => 800,
  });
});
afterEach(() => vi.restoreAllMocks());
it('uses the native scope, registration and bounded metadata discovery without generating prose', async () => {
  const scope = await client.getLiterarySequenceScope('book', f.input.chapterIds);
  expect(scope.originToken).toBe(f.input.expectedScopeToken);
  const frame = await client.startLiterarySequence(f.input, 'author');
  expect(frame.job.collaboration.mode).toBe('continuous');
  expect(pending()).toEqual([]);
  const page = await client.listLiterarySequences('book');
  expect(page.items[0]).toMatchObject({ jobId: id, chapterCount: 2, index: 0 });
  expect(transport.calls.at(-1).input).toEqual({ target, afterId: null, limit: 25 });
  expect(f.calls).toEqual([]);
});
it('keeps only metadata after registration ACK loss and querying never replays the start', async () => {
  transport.lose = (method) => method === 'startLiterarySequence';
  await expect(client.startLiterarySequence(f.input, 'author')).rejects.toThrow(
    'Lost acknowledgement',
  );
  const entry = pending()[0];
  expect(entry).toMatchObject({
    kind: 'sequence',
    method: 'startLiterarySequence',
    id,
    operationId: id,
    expectedRevision: 0,
  });
  expect(Object.keys(entry).sort()).toEqual([
    'actorId',
    'bookId',
    'expectedRevision',
    'id',
    'kind',
    'method',
    'operationId',
    'version',
    'wireHash',
  ]);
  expect(JSON.stringify(localStorage)).not.toContain('PRIVATE_SEQUENCE_INSTRUCTION');
  expect(JSON.stringify(localStorage)).not.toContain('authorizedPhases');
  const result = await client.getLiterarySequenceOperation('book', id, entry.operationId);
  expect(client.verifyLiterarySequenceOperation(entry, result).state).toBe('confirmed');
  expect(pending()).toHaveLength(1);
  finishLiteraryOperation(entry);
  expect(transport.calls.filter((call) => call.method === 'startLiterarySequence')).toHaveLength(1);
  expect(f.calls).toHaveLength(0);
});
it('freezes the actual producer input before hashing and keeps metadata ahead of the call', async () => {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
    await held;
    return digest(...args);
  });
  const input = structuredClone(f.input),
    original = structuredClone(input);
  const sending = client.startLiterarySequence(input, 'author');
  input.instruction = 'changed while hashing';
  input.chapterIds.reverse();
  input.limits.maxCredits = 99;
  expect(transport.calls).toHaveLength(0);
  release();
  await sending;
  expect(transport.calls.find((call) => call.method === 'startLiterarySequence').input).toEqual({
    ...original,
    requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
  });
  expect((await client.getLiterarySequence('book', id)).job.limits.maxCredits).toBe(3);
});
it('write-ahead failure prevents transport and keeps existing journal methods compatible', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
    throw new Error('Storage unavailable');
  });
  await expect(client.startLiterarySequence(f.input, 'author')).rejects.toThrow(
    'Storage unavailable',
  );
  expect(transport.calls).toHaveLength(0);
  const old = await beginLiteraryOperation('author', 'book', 'contract', 'current', {
    operationId: 'old-contract-operation',
    expectedRevision: 0,
  });
  expect(listLiteraryPendingOperations('author', 'book')).toEqual([old]);
  expect(old.method).toBeUndefined();
  finishLiteraryOperation(old);
});
it('retains a running native step across reload and explicitly recovers its frozen action once', async () => {
  const registered = await client.startLiterarySequence(f.input, 'author');
  const start = f.api.startLiteraryWorkflow;
  let lost = false;
  f.api.startLiteraryWorkflow = async (...args) => {
    const frame = await start(...args);
    if (!lost) {
      lost = true;
      throw new Error('Child reply lost');
    }
    return frame;
  };
  const wire = advanceInput(registered);
  await expect(client.advanceLiterarySequence(wire, 'author')).rejects.toThrow('Child reply lost');
  const [entry] = pending();
  expect(entry.method).toBe('advanceLiterarySequence');
  const outcome = await client.getLiterarySequenceOperation('book', id, wire.operationId);
  expect(client.verifyLiterarySequenceOperation(entry, outcome).state).toBe('running');
  expect(pending()).toHaveLength(1);
  await expect(
    client.advanceLiterarySequence({ ...wire, actIntegrationId: 'another-report' }, 'author'),
  ).rejects.toThrow('outro acompanhamento');
  const frame = await client.resumeLiterarySequenceOperation(
    JSON.parse(JSON.stringify(entry)),
    'author',
  );
  expect(frame.job.currentWorkflowId).toBeTruthy();
  expect(pending()).toEqual([]);
  expect(f.calls).toHaveLength(0);
  expect(
    [...f.records.keys()].filter((key) => /literaryWorkflowJobs\/[^/]+$/.test(key)),
  ).toHaveLength(1);
});
it('a lost confirmed scene response is resolved without resuming a producer or entering another scene', async () => {
  let frame = await client.startLiterarySequence(f.input, 'author');
  transport.lose = (method, value) =>
    method === 'advanceLiterarySequence' && value.job.applications === 1;
  for (let i = 0; i < 40; i++) {
    try {
      frame = await client.advanceLiterarySequence(advanceInput(frame), 'author');
    } catch (cause) {
      expect(cause.message).toContain('Lost acknowledgement');
      break;
    }
  }
  const [entry] = pending();
  expect(entry).toBeTruthy();
  const count = f.calls.length;
  const recovered = await client.resumeLiterarySequenceOperation(entry, 'author');
  expect(recovered.job.applications).toBe(1);
  expect(f.calls).toHaveLength(count);
  expect(f.records.get('users/author').credits).toBe(9);
  expect(f.records.get('books/book/scenes/' + f.ids[1] + '/body/current').content).toBe('');
  expect(transport.calls.some((call) => call.method === 'resumeLiterarySequenceOperation')).toBe(
    false,
  );
  expect(pending()).toEqual([]);
});
it('a later pause resolves a superseded advance at its original revision without rearming it', async () => {
  const registered = await client.startLiterarySequence(f.input, 'author');
  f.api.startLiteraryWorkflow = async () => {
    throw new Error('Interrupted start');
  };
  await expect(client.advanceLiterarySequence(advanceInput(registered), 'author')).rejects.toThrow(
    'Interrupted start',
  );
  const [entry] = pending();
  const current = await client.getLiterarySequence('book', id);
  await client.setLiterarySequenceControl({ ...advanceInput(current), action: 'pause' }, 'author');
  const recovered = await client.resumeLiterarySequenceOperation(entry, 'author');
  expect(recovered.job.paused).toBe(true);
  expect(pending()).toEqual([]);
  expect(f.calls).toHaveLength(0);
  expect(transport.calls.some((call) => call.method === 'resumeLiterarySequenceOperation')).toBe(
    false,
  );
});
it('rejects mismatched methods/revisions and blocks resume after account/session changes or lost local CAS', async () => {
  const frame = await client.startLiterarySequence(f.input, 'author');
  f.api.startLiteraryWorkflow = async () => {
    throw new Error('Interrupted start');
  };
  await expect(client.advanceLiterarySequence(advanceInput(frame), 'author')).rejects.toThrow(
    'Interrupted start',
  );
  const [entry] = pending();
  const outcome = await client.getLiterarySequenceOperation('book', id, entry.operationId);
  expect(() =>
    client.verifyLiterarySequenceOperation(entry, { ...outcome, method: 'startLiterarySequence' }),
  ).toThrow('não corresponde');
  expect(() =>
    client.verifyLiterarySequenceOperation(entry, {
      ...outcome,
      revision: entry.expectedRevision + 1,
    }),
  ).toThrow('não corresponde');
  expect(() =>
    client.verifyLiterarySequenceOperation(entry, { ...outcome, requestHash: '0'.repeat(64) }),
  ).toThrow('não corresponde');
  await expect(client.resumeLiterarySequenceOperation(entry, 'other')).rejects.toThrow('conta');
  await expect(
    client.resumeLiterarySequenceOperation(entry, 'author', () => false),
  ).rejects.toThrow('sessão mudou');
  finishLiteraryOperation(entry);
  await expect(client.resumeLiterarySequenceOperation(entry, 'author')).rejects.toThrow(
    'acompanhamento local mudou',
  );
  expect(transport.calls.some((call) => call.method === 'resumeLiterarySequenceOperation')).toBe(
    false,
  );
});

it('a native receipt from another intent with the same method/id/revision cannot clear the new journal', async () => {
  const frame = await client.startLiterarySequence(f.input, 'author');
  const wire = advanceInput(frame);
  transport.lose = (method) => method === 'advanceLiterarySequence';
  await expect(client.advanceLiterarySequence(wire, 'author')).rejects.toThrow(
    'Lost acknowledgement',
  );
  const [original] = pending();
  finishLiteraryOperation(original);
  const changed = await beginLiteraryOperation(
    'author',
    'book',
    'sequence',
    id,
    { ...wire, actIntegrationId: 'another-intention' },
    'advanceLiterarySequence',
  );
  const result = await client.getLiterarySequenceOperation('book', id, wire.operationId);
  expect(result.state).toBe('confirmed');
  expect(() => client.verifyLiterarySequenceOperation(changed, result)).toThrow('não corresponde');
  await expect(client.resumeLiterarySequenceOperation(changed, 'author')).rejects.toThrow(
    'não corresponde',
  );
  expect(pending()).toEqual([changed]);
  expect(f.calls).toHaveLength(0);
});

it('an edited metadata object during lookup cannot redirect an explicitly resumed native step', async () => {
  const frame = await client.startLiterarySequence(f.input, 'author');
  const start = f.api.startLiteraryWorkflow;
  f.api.startLiteraryWorkflow = async () => {
    throw new Error('Interrupted start');
  };
  await expect(client.advanceLiterarySequence(advanceInput(frame), 'author')).rejects.toThrow(
    'Interrupted start',
  );
  f.api.startLiteraryWorkflow = start;
  const [saved] = pending(),
    input = structuredClone(saved);
  const query = transport.api.getLiterarySequenceOperation;
  let release;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  transport.api.getLiterarySequenceOperation = async (...args) => {
    const value = await query(...args);
    await held;
    return value;
  };
  const resuming = client.resumeLiterarySequenceOperation(input, 'author');
  input.operationId = 'different-native-operation';
  input.id = 'another-sequence';
  release();
  const recovered = await resuming;
  expect(recovered.job.currentWorkflowId).toBeTruthy();
  expect(
    transport.calls.find((call) => call.method === 'resumeLiterarySequenceOperation').input,
  ).toEqual({ target, jobId: id, operationId: saved.operationId });
  expect(pending()).toEqual([]);
  expect(f.calls).toHaveLength(0);
});

it('another device recovers the registered native step using only its authorized receipt metadata', async () => {
  const frame = await client.startLiterarySequence(f.input, 'author');
  const start = f.api.startLiteraryWorkflow;
  f.api.startLiteraryWorkflow = async () => {
    throw new Error('Lost process');
  };
  const wire = advanceInput(frame);
  await expect(client.advanceLiterarySequence(wire, 'author')).rejects.toThrow('Lost process');
  const [entry] = pending();
  finishLiteraryOperation(entry);
  f.api.startLiteraryWorkflow = start;
  expect(pending()).toEqual([]);
  const recovered = await client.recoverLiterarySequenceStep(
    'book',
    id,
    wire.operationId,
    'author',
  );
  expect(recovered.job.currentWorkflowId).toBeTruthy();
  expect(pending()).toEqual([]);
  expect(f.calls).toHaveLength(0);
  expect(
    transport.calls.find((call) => call.method === 'resumeLiterarySequenceOperation').input,
  ).toEqual({ target, jobId: id, operationId: wire.operationId });
});

it('cross-device recovery refuses another local sequence and a changed account after query without sending a producer', async () => {
  const frame = await client.startLiterarySequence(f.input, 'author');
  f.api.startLiteraryWorkflow = async () => {
    throw new Error('Interrupted');
  };
  const wire = advanceInput(frame);
  await expect(client.advanceLiterarySequence(wire, 'author')).rejects.toThrow('Interrupted');
  await expect(
    client.recoverLiterarySequenceStep('book', 'another-sequence', wire.operationId, 'author'),
  ).rejects.toThrow('outra sequência');
  finishLiteraryOperation(pending()[0]);
  await expect(
    client.recoverLiterarySequenceStep('book', id, wire.operationId, 'author', () => false),
  ).rejects.toThrow('sessão mudou');
  expect(pending()).toEqual([]);
  expect(transport.calls.some((call) => call.method === 'resumeLiterarySequenceOperation')).toBe(
    false,
  );
});

it('the actual sequence UI completes two prepared chapters through the registered sector handlers and one native budget', async () => {
  transport.api = {
    ...transport.api,
    ...f.api,
    ...createLiteraryPlanningService({ db: f.db, now: () => 800 }),
  };
  const user = userEvent.setup();
  render(createElement(LiterarySequencePanel, { bookId: 'book', collaborationMode: 'continuous' }));
  await user.click(screen.getByRole('button', { name: 'Consultar capítulos para sequência' }));
  for (const title of ['A carta', 'A resposta']) {
    await user.click(screen.getByRole('combobox', { name: 'Adicionar capítulo à sequência' }));
    await user.click(screen.getByRole('option', { name: title }));
    await user.click(screen.getByRole('button', { name: 'Adicionar capítulo selecionado' }));
  }
  for (const phase of ['Primeira versão', 'Revisão integral', 'Versão revisada']) {
    await user.click(
      screen.getByRole('combobox', { name: 'Autorizar fase na sequência: ' + phase }),
    );
    await user.click(
      screen.getByRole('option', { name: 'Autorizar no escopo e limites da sequência' }),
    );
  }
  await user.click(screen.getByRole('combobox', { name: 'Passagem entre capítulos da seleção' }));
  await user.click(
    screen.getByRole('option', { name: 'Continuar dentro da seleção e dos limites' }),
  );
  await user.click(screen.getByRole('button', { name: 'Conferir escopo e preparar prévia' }));
  await user.click(
    await screen.findByRole('button', { name: 'Registrar esta sequência com estes limites' }),
  );
  expect(f.calls).toHaveLength(0);
  await user.click(
    await screen.findByRole('button', { name: 'Avançar sequência até a próxima decisão' }),
  );
  await screen.findByText('Seleção concluída', {}, { timeout: 15000 });
  expect(
    screen.getByText(/2 de 2 capítulos concluídos · 3 de 3 aplicações · 3 de 3 créditos/),
  ).toBeInTheDocument();
  expect(f.records.get('users/author').credits).toBe(7);
  expect(
    [...f.records.keys()].filter((key) => /literaryWorkflowJobs\/[^/]+$/.test(key)),
  ).toHaveLength(2);
  expect(listLiteraryPendingOperations('author', 'book')).toEqual([]);
}, 20000);

it('the supervised sequence UI keeps both scene applications and every chapter phase under explicit author decisions', async () => {
  f = await setup({ mode: 'supervised' });
  transport.api = {
    ...f.api,
    ...f.drafts,
    ...f.reviews,
    ...createLiteraryPlanningService({ db: f.db, now: () => 800 }),
    ...createLiterarySequenceDriver({
      db: f.db,
      workflows: f.api,
      sequences: f.sequence,
      now: () => 800,
    }),
  };
  const user = userEvent.setup();
  render(createElement(LiterarySequencePanel, { bookId: 'book', collaborationMode: 'supervised' }));
  await user.click(screen.getByRole('button', { name: 'Consultar capítulos para sequência' }));
  await user.click(screen.getByRole('combobox', { name: 'Adicionar capítulo à sequência' }));
  await user.click(screen.getByRole('option', { name: 'A carta' }));
  await user.click(screen.getByRole('button', { name: 'Adicionar capítulo selecionado' }));
  await user.click(screen.getByRole('button', { name: 'Conferir escopo e preparar prévia' }));
  await user.click(
    await screen.findByRole('button', { name: 'Registrar esta sequência com estes limites' }),
  );
  const advance = async () => {
    const button = screen.getByRole('button', { name: 'Avançar sequência até a próxima decisão' });
    await waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
  };
  await advance();
  await user.click(
    await screen.findByRole('button', { name: 'Autorizar primeira versão deste ciclo' }),
  );
  await advance();
  await user.click(
    await screen.findByRole('button', { name: 'Conferir redação e relatório deste ciclo' }),
  );
  for (let i = 0; i < 2; i++) {
    const acceptance = await screen.findByRole(
      'button',
      { name: 'Revisar aceite desta cena · 1 crédito' },
      { timeout: 10000 },
    );
    await waitFor(() => expect(acceptance).toBeEnabled());
    await user.click(acceptance);
    await user.click(await screen.findByRole('button', { name: 'Salvar esta cena · 1 crédito' }));
    await screen.findByText(/Cena salva na revisão/);
    await advance();
  }
  await user.click(
    await screen.findByRole(
      'button',
      { name: 'Aceitar primeira versão e iniciar revisão' },
      { timeout: 10000 },
    ),
  );
  await advance();
  await user.click(
    await screen.findByRole(
      'button',
      { name: 'Aceitar revisão e preservar versão revisada' },
      { timeout: 10000 },
    ),
  );
  // The native manual action explicitly accepts the review and requests preservation together.
  await advance();
  await screen.findByText('Seleção concluída', {}, { timeout: 10000 });
  expect(f.records.get('users/author').credits).toBe(8);
  expect(
    transport.calls
      .filter((call) => call.method === 'setLiteraryWorkflowControl')
      .map((call) => call.input.action),
  ).toEqual(['startFirstVersion', 'acceptFirstVersion', 'acceptReview']);
  const root = [...f.records.entries()].find(([key]) =>
    /literarySequenceJobs\/[^/]+$/.test(key),
  )[1];
  expect(root.applications).toBe(2);
  expect(root.completed).toHaveLength(1);
  expect(listLiteraryPendingOperations('author', 'book')).toEqual([]);
}, 20000);
