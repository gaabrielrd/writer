import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VersionSource } from '@/features/manuscript-history';
import type { EditorChatEditorBridge } from '../model/editorChatEditorBridge';
import type { EditorChatOperationRow } from '../model/editorChat';
import { editorChatTextHash } from '../model/editorChat';
import {
  applyEditorChatSuggestion,
  type EditorChatApplyHost,
  type EditorChatApplyInput,
} from '../services/editorChatApplyService';
import { requestFor, responseFor, rowFor, hash } from './editorChatTestFixtures';
const mocks = vi.hoisted(() => ({
  user: ((): { uid: string } | null => ({ uid: 'user' }))(),
  listeners: new Set<(u: { uid: string } | null) => void>(),
  source: vi.fn(),
  call: vi.fn(),
  execute: vi.fn(),
  assert: vi.fn(),
  row: null as EditorChatOperationRow | null,
}));
vi.mock('@/shared/lib', () => ({
  auth: {
    get currentUser() {
      return mocks.user;
    },
  },
}));
vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_a: unknown, listener: (u: { uid: string } | null) => void) => {
    mocks.listeners.add(listener);
    return () => mocks.listeners.delete(listener);
  },
}));
vi.mock('@/features/manuscript-history', () => ({ getWorkVersionSource: mocks.source }));
vi.mock('../services/editorChatService', () => ({ callEditorChat: mocks.call }));
vi.mock('../services/editorChatOperationSession', () => ({
  createEditorChatOperationSession: () => ({ execute: mocks.execute, read: () => mocks.row }),
}));
vi.mock('../services/editorChatOperationStorage', () => ({
  assertEditorChatOperation: mocks.assert,
}));
function switchUser(u: { uid: string } | null) {
  mocks.user = u;
  for (const listener of mocks.listeners) listener(u);
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.user = { uid: 'user' };
  mocks.listeners.clear();
});
afterEach(() => vi.restoreAllMocks());
async function setup() {
  const read = await responseFor(await requestFor('getTurn'));
  const frozen = read.answer!.context;
  const content = '<p><b>Próprio</b></p>',
    html = '<p><strong>Próprio</strong></p>',
    after = '<p>Texto sugerido</p>';
  const oldHash = await editorChatTextHash(content),
    newHash = await editorChatTextHash(after);
  frozen.source.bodyHash = oldHash;
  frozen.capture.editorHash = await editorChatTextHash(html);
  const saved: VersionSource = {
    target: frozen.source.target,
    resource: frozen.source.resource,
    title: 'Cena',
    content,
    contentHash: oldHash,
    sourceToken: frozen.source.sourceToken,
    revision: frozen.source.revision,
  };
  const next: VersionSource = {
    ...saved,
    content: after,
    contentHash: newHash,
    revision: saved.revision! + 1,
    sourceToken: hash('a'),
  };
  const state = {
    locked: false,
    pmCurrent: true,
    snapshot: { content, bodyHash: oldHash, revision: saved.revision! },
  };
  const guard = () => {
    if (!state.pmCurrent) throw new Error('pm-changed');
  };
  const prepared = {
    before: html,
    after,
    checkCurrent: vi.fn(guard),
    commit: vi.fn(() => {
      expect(state.locked).toBe(true);
      guard();
    }),
  };
  const bridge: EditorChatEditorBridge = {
    preview: vi.fn(),
    capture: vi.fn(() =>
      Promise.resolve({ capture: { ...frozen.capture }, html, checkCurrent: guard }),
    ),
    prepare: vi.fn(() => Promise.resolve(prepared)),
    setBusy: vi.fn(),
    focus: vi.fn(),
  };
  const host: EditorChatApplyHost = {
    target: saved.target,
    resource: frozen.source.resource,
    checkCurrent: vi.fn(),
    getBridge: () => bridge,
    getConfirmedSnapshot: () => state.snapshot,
    async runExclusive(work) {
      if (state.locked) throw new Error('nested lock');
      state.locked = true;
      try {
        return await work();
      } finally {
        state.locked = false;
      }
    },
    acceptConfirmed: vi.fn(() => {
      expect(prepared.commit).toHaveBeenCalledTimes(1);
      expect(state.locked).toBe(true);
    }),
  };
  mocks.source.mockResolvedValueOnce(saved).mockResolvedValue(next);
  mocks.call.mockResolvedValue(read);
  const result = await responseFor(await requestFor('applySuggestion'));
  result.current = {
    ...result.current!,
    revision: next.revision!,
    contentHash: newHash,
    bodyBytes: new TextEncoder().encode(after).byteLength,
    wordCount: 2,
  };
  mocks.execute.mockResolvedValue(result);
  mocks.row = { ...rowFor(await requestFor('applySuggestion')), state: 'settled' };
  mocks.assert.mockImplementation((_row: unknown, check: () => void) => check());
  const input: EditorChatApplyInput = {
    conversationId: 'conversation',
    conversationToken: hash('4'),
    turnId: 'turn',
    placement: 'original',
    replace: true,
  };
  return {
    read,
    saved,
    next,
    state,
    prepared,
    bridge,
    host,
    input,
    result,
    run: () => applyEditorChatSuggestion('user', host, input),
  };
}
describe('aceite protegido da sugestão no editor', () => {
  it('confirma pela fonte pública antes de commit único e adoção, preservando HTML normalizado distinto', async () => {
    const f = await setup();
    await expect(f.run()).resolves.toMatchObject({ chargedCredits: 1 });
    expect(f.prepared.commit).toHaveBeenCalledTimes(1);
    expect(f.host.acceptConfirmed).toHaveBeenCalledWith(f.next);
    expect(mocks.call).toHaveBeenCalledTimes(2);
    expect(vi.mocked(f.bridge.setBusy).mock.calls).toEqual([[true], [false]]);
    expect(f.state.locked).toBe(false);
    expect(mocks.listeners.size).toBe(0);
  });
  it('não edita nem adota antes da confirmação remota', async () => {
    const f = await setup();
    mocks.execute.mockImplementation(() => {
      expect(f.prepared.commit).not.toHaveBeenCalled();
      expect(f.host.acceptConfirmed).not.toHaveBeenCalled();
      return Promise.resolve(f.result);
    });
    await f.run();
  });
  it('resposta bloqueada não abre fonte nem prepara texto', async () => {
    const f = await setup();
    mocks.call.mockResolvedValue({ ...f.read, presentation: 'blocked', answer: null });
    await expect(f.run()).rejects.toThrow();
    expect(mocks.source).not.toHaveBeenCalled();
    expect(f.bridge.prepare).not.toHaveBeenCalled();
  });
  it('base original alterada exige realocação explícita', async () => {
    const f = await setup();
    f.read.answer!.context.source.revision++;
    await expect(f.run()).rejects.toThrow();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('realocação explícita usa captura nova e conserva CAS persistido', async () => {
    const f = await setup();
    f.read.answer!.context.source.revision++;
    f.input.placement = 'retargeted';
    f.input.source = 'selection';
    await f.run();
    expect(f.bridge.capture).toHaveBeenCalledWith('selection');
    const fields: unknown = mocks.execute.mock.calls[0]?.[1];
    expect(fields).toMatchObject({ placement: 'retargeted', base: { revision: f.saved.revision } });
  });
  it('guarda PM impede aplicação quando a seleção muda durante leitura', async () => {
    const f = await setup();
    mocks.source.mockReset().mockImplementationOnce(() => {
      f.state.pmCurrent = false;
      return Promise.resolve(f.saved);
    });
    await expect(f.run()).rejects.toThrow('pm-changed');
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(f.prepared.commit).not.toHaveBeenCalled();
  });
  it('guarda UID não aceita retorno após A→B→A', async () => {
    const f = await setup(),
      original = mocks.user;
    mocks.source.mockReset().mockImplementationOnce(() => {
      switchUser({ uid: 'other' });
      switchUser(original);
      return Promise.resolve(f.saved);
    });
    await expect(f.run()).rejects.toThrow();
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.listeners.size).toBe(0);
  });
  it('resultado incerto preserva o editor e solta somente a reserva', async () => {
    const f = await setup();
    mocks.execute.mockRejectedValue(new Error('uncertain'));
    await expect(f.run()).rejects.toThrow('uncertain');
    expect(f.prepared.commit).not.toHaveBeenCalled();
    expect(f.host.acceptConfirmed).not.toHaveBeenCalled();
    expect(f.state.locked).toBe(false);
  });
  it.each(['revisão', 'conteúdo', 'hash', 'escopo'] as const)(
    'fonte após aceite divergente (%s) não sobrescreve editor',
    async (field) => {
      const f = await setup(),
        next = { ...f.next };
      if (field === 'revisão') next.revision!++;
      if (field === 'conteúdo') next.content = '<p>Edição posterior</p>';
      if (field === 'hash') next.contentHash = hash('b');
      if (field === 'escopo') next.resource = { kind: 'scene', id: 'other' };
      mocks.source.mockReset().mockResolvedValueOnce(f.saved).mockResolvedValueOnce(next);
      await expect(f.run()).rejects.toThrow();
      expect(f.prepared.commit).not.toHaveBeenCalled();
      expect(f.host.acceptConfirmed).not.toHaveBeenCalled();
    },
  );
  it('revogação após confirmação salva impede adoção de derivado', async () => {
    const f = await setup();
    mocks.call
      .mockReset()
      .mockResolvedValueOnce(f.read)
      .mockResolvedValueOnce({ ...f.read, presentation: 'blocked', answer: null });
    await expect(f.run()).rejects.toThrow();
    expect(f.prepared.commit).not.toHaveBeenCalled();
  });
  it('outra aba que altera journal após o recibo impede commit local', async () => {
    const f = await setup();
    mocks.assert.mockImplementation(() => {
      throw new Error('journal-changed');
    });
    await expect(f.run()).rejects.toThrow('journal-changed');
    expect(f.prepared.commit).not.toHaveBeenCalled();
  });
  it('metadados completos são preparados antes do commit e adotados sem await após o texto', async () => {
    const f = await setup();
    const adopt = vi.fn();
    f.host.prepareAdoption = vi.fn(() => {
      expect(f.prepared.commit).not.toHaveBeenCalled();
      return Promise.resolve(adopt);
    });
    await f.run();
    expect(f.host.prepareAdoption).toHaveBeenCalledWith(f.next);
    expect(adopt).toHaveBeenCalledOnce();
    expect(f.host.acceptConfirmed).not.toHaveBeenCalled();
  });
  it('falha na leitura de metadados após confirmação preserva PM e texto local', async () => {
    const f = await setup();
    f.host.prepareAdoption = vi.fn(() => Promise.reject(new Error('metadata-conflict')));
    await expect(f.run()).rejects.toThrow('metadata-conflict');
    expect(f.prepared.commit).not.toHaveBeenCalled();
    expect(f.host.acceptConfirmed).not.toHaveBeenCalled();
  });
});
