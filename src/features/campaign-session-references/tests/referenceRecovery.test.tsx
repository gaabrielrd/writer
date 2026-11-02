import { beforeEach, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useSessionReferenceOperation } from '../hooks/useSessionReferenceOperation';
import * as calls from '../services/sessionReferenceCallables';
import * as store from '../services/sessionReferenceRecovery';
import { canonical } from '../services/sessionReferenceService';
import {
  uid,
  cid,
  operation,
  confirmed,
  journalKey,
  installLocks,
  deferred,
} from './referenceTestHelpers';
import type { SessionReferenceOutcome } from '../model/sessionReference';
vi.mock('../services/sessionReferenceCallables', () => ({
  listCampaignSessionReferences: vi.fn(),
  addCampaignSessionReference: vi.fn(),
  removeCampaignSessionReference: vi.fn(),
  readCampaignSessionLoreReference: vi.fn(),
  resolveCampaignSessionReferenceOperation: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  installLocks();
  vi.mocked(calls.addCampaignSessionReference).mockResolvedValue(confirmed(operation));
});
const seed = (value = operation) => localStorage.setItem(journalKey, canonical(value));
const next = () => ({
  ...operation,
  request: {
    ...operation.request,
    operationId: 'operation-reference-0002',
    referenceId: 'operation-reference-0002',
  },
});
it('Web Lock protege snapshot inteiro e não mantém lock durante HTTP; resposta perdida conserva o mesmo pedido', async () => {
  let locked = false;
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: vi.fn((_key: string, work: () => unknown) => {
        locked = true;
        try {
          return Promise.resolve(work());
        } finally {
          locked = false;
        }
      }),
    },
  });
  const held = deferred<SessionReferenceOutcome>();
  const done = vi.fn();
  vi.mocked(calls.addCampaignSessionReference).mockImplementation(() => {
    expect(locked).toBe(false);
    expect(store.readPendingSessionReference(uid, cid)).toEqual(operation);
    return held.promise;
  });
  const { result } = renderHook(() =>
    useSessionReferenceOperation({ uid, campaignId: cid, isActive: () => true, onConfirmed: done }),
  );
  let task!: Promise<void>;
  act(() => {
    task = result.current.execute(operation);
  });
  await waitFor(() => expect(calls.addCampaignSessionReference).toHaveBeenCalledOnce());
  await act(async () => {
    held.reject(new Error('Resposta perdida'));
    await task;
  });
  expect(store.readPendingSessionReference(uid, cid)).toEqual(operation);
  expect(done).not.toHaveBeenCalled();
  vi.mocked(calls.addCampaignSessionReference).mockResolvedValue(confirmed(operation));
  await act(async () => result.current.recover(operation));
  expect(done).toHaveBeenCalledOnce();
  expect(store.readPendingSessionReference(uid, cid)).toBeNull();
  expect(vi.mocked(calls.addCampaignSessionReference).mock.calls.map(([r]) => r)).toEqual([
    operation.request,
    operation.request,
  ]);
});
it('reserva suspensa revalida sessão dentro do lock e não escreve nem envia após troca de UID', async () => {
  let grant!: () => void;
  const locked = deferred<void>();
  let active = true;
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: vi.fn((_key: string, work: () => void) => {
        grant = () => {
          try {
            work();
            locked.resolve();
          } catch (e) {
            locked.reject(e);
          }
        };
        return locked.promise;
      }),
    },
  });
  const { result } = renderHook(() =>
    useSessionReferenceOperation({ uid, campaignId: cid, isActive: () => active }),
  );
  let task!: Promise<void>;
  act(() => {
    task = result.current.execute(operation);
  });
  active = false;
  await act(async () => {
    grant();
    await task;
  });
  expect(localStorage.getItem(journalKey)).toBeNull();
  expect(calls.addCampaignSessionReference).not.toHaveBeenCalled();
});
it('slot B gravado antes do lock preserva B, sem transmitir A nem substituir nomes por outro pedido', async () => {
  let grant!: () => void;
  const locked = deferred<void>();
  const b = next();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: vi.fn((_key: string, work: () => void) => {
        grant = () => {
          try {
            work();
            locked.resolve();
          } catch (e) {
            locked.reject(e);
          }
        };
        return locked.promise;
      }),
    },
  });
  const { result } = renderHook(() =>
    useSessionReferenceOperation({ uid, campaignId: cid, isActive: () => true }),
  );
  let task!: Promise<void>;
  act(() => {
    task = result.current.execute(operation);
  });
  seed(b);
  await act(async () => {
    grant();
    await task;
  });
  expect(store.readPendingSessionReference(uid, cid)).toEqual(b);
  expect(calls.addCampaignSessionReference).not.toHaveBeenCalled();
});
it('recibo A não limpa nem confirma B reservado antes do clear sob lock', async () => {
  const held = deferred<SessionReferenceOutcome>(),
    accepted = vi.fn(),
    b = next();
  seed();
  vi.mocked(calls.addCampaignSessionReference).mockReturnValue(held.promise);
  const { result } = renderHook(() =>
    useSessionReferenceOperation({
      uid,
      campaignId: cid,
      isActive: () => true,
      onConfirmed: accepted,
    }),
  );
  let task!: Promise<void>;
  act(() => {
    task = result.current.recover(operation);
  });
  await waitFor(() => expect(calls.addCampaignSessionReference).toHaveBeenCalledOnce());
  seed(b);
  await act(async () => {
    held.resolve(confirmed(operation));
    await task;
  });
  expect(store.readPendingSessionReference(uid, cid)).toEqual(b);
  expect(accepted).not.toHaveBeenCalled();
  expect(result.current.pending).toEqual(b);
});
it('recuperação exibida A não adota B fresco antes do clique; resposta tardia após sair preserva A', async () => {
  seed();
  const b = next();
  let active = true;
  const accepted = vi.fn();
  const { result } = renderHook(() =>
    useSessionReferenceOperation({
      uid,
      campaignId: cid,
      isActive: () => active,
      onConfirmed: accepted,
    }),
  );
  seed(b);
  await act(async () => result.current.recover(operation));
  expect(calls.addCampaignSessionReference).not.toHaveBeenCalled();
  expect(store.readPendingSessionReference(uid, cid)).toEqual(b);
  seed();
  const held = deferred<SessionReferenceOutcome>();
  vi.mocked(calls.addCampaignSessionReference).mockReturnValue(held.promise);
  let task!: Promise<void>;
  act(() => {
    task = result.current.recover(operation);
  });
  await waitFor(() => expect(calls.addCampaignSessionReference).toHaveBeenCalledOnce());
  active = false;
  await act(async () => {
    held.resolve(confirmed(operation));
    await task;
  });
  expect(store.readPendingSessionReference(uid, cid)).toEqual(operation);
  expect(accepted).not.toHaveBeenCalled();
});
it('falha ao persistir bloqueia envio e preserva slot; controle futuro recebido por storage passa a bloquear', async () => {
  const setter = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
    throw new DOMException('Quota', 'QuotaExceededError');
  });
  const { result } = renderHook(() =>
    useSessionReferenceOperation({ uid, campaignId: cid, isActive: () => true }),
  );
  await act(async () => result.current.execute(operation));
  expect(calls.addCampaignSessionReference).not.toHaveBeenCalled();
  expect(result.current.error).toBeTruthy();
  setter.mockRestore();
  const raw = JSON.stringify({ ...operation, schemaVersion: 9 });
  localStorage.setItem(journalKey, raw);
  void act(() => window.dispatchEvent(new StorageEvent('storage', { key: journalKey })));
  expect(result.current.blocked).toBe(true);
  await act(async () => result.current.execute(operation));
  expect(localStorage.getItem(journalKey)).toBe(raw);
  expect(calls.addCampaignSessionReference).not.toHaveBeenCalled();
});
it('closer público aguarda lock, confere UID no callback e conserva campos extras futuros e outros escopos', async () => {
  seed();
  localStorage.setItem('unrelated', 'kept');
  let grant!: () => void;
  const gate = deferred<void>();
  let active = true;
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: vi.fn((_key: string, work: () => void) => {
        grant = () => {
          try {
            work();
            gate.resolve();
          } catch (e) {
            gate.reject(e);
          }
        };
        return gate.promise;
      }),
    },
  });
  const task = store.forgetSessionReferenceRecovery(operation, () => {
    if (!active) throw new Error('UID mudou');
  });
  active = false;
  grant();
  await expect(task).rejects.toThrow('UID mudou');
  expect(store.readPendingSessionReference(uid, cid)).toEqual(operation);
  expect(localStorage.getItem('unrelated')).toBe('kept');
  installLocks();
  localStorage.setItem(
    journalKey,
    JSON.stringify({ ...operation, request: { ...operation.request, future: true } }),
  );
  await expect(store.forgetSessionReferenceRecovery(operation, () => {})).rejects.toThrow(
    /preservado/,
  );
  expect(localStorage.getItem(journalKey)).toContain('future');
});
