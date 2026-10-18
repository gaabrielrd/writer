import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampaignLoreOperationControls } from '../components/CampaignLoreOperationControls';
import { CampaignLoreReadView } from '../components/CampaignLoreReadView';
import * as api from '../services/campaignLoreRemoteCallables';
import * as journal from '../services/campaignLoreRemoteRecovery';
import * as local from '../services/campaignLoreRecovery';
import * as lore from '../services/campaignLoreCallables';
import type {
  CampaignLoreRemoteControl,
  CampaignLoreRemoteResolution,
} from '../model/campaignLoreRemote';
import {
  uid,
  campaignId,
  baseId,
  campaignToken,
  sourceKey,
  operation,
  result,
  resolution,
  installRecoveryHarness,
  deferred,
} from './loreTestHelpers';
const auth = vi.hoisted(() => ({ user: { uid: 'owner' } }));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/campaignLoreRemoteCallables', () => ({
  listCampaignLoreOperations: vi.fn(),
  resolveCampaignLoreRemoteOperation: vi.fn(),
}));
vi.mock('../services/campaignLoreCallables', () => ({
  resolveCampaignLoreOperation: vi.fn(),
  getCampaignLore: vi.fn(),
}));
const scope = { campaignId, baseId, campaignToken },
  remoteOp: CampaignLoreRemoteControl = {
    operationId: 'remote-one',
    state: 'prepared',
    revision: null,
    statusToken: 'a'.repeat(64),
  };
let items: CampaignLoreRemoteControl[];
beforeEach(() => {
  vi.resetAllMocks();
  auth.user = { uid };
  localStorage.clear();
  installRecoveryHarness();
  items = [remoteOp];
  vi.mocked(api.listCampaignLoreOperations).mockImplementation(() =>
    Promise.resolve().then(() => ({
      schemaVersion: 1,
      ownerId: uid,
      ...scope,
      items: [...items],
      nextCursor: null,
    })),
  );
  vi.mocked(api.resolveCampaignLoreRemoteOperation).mockImplementation((input) =>
    Promise.resolve().then(() => {
      items = [];
      return {
        schemaVersion: 1,
        ownerId: uid,
        request: input,
        outcome: 'resolved',
        state: input.intent === 'confirm' ? 'confirmed' : 'canceled',
        reason: null,
        revision: input.intent === 'confirm' ? 1 : null,
      };
    }),
  );
  vi.mocked(lore.resolveCampaignLoreOperation).mockImplementation((input) =>
    Promise.resolve().then(() =>
      resolution(
        { ...operation, header: input },
        input.intent === 'confirm' ? 'committed' : 'canceled',
      ),
    ),
  );
  vi.mocked(lore.getCampaignLore).mockResolvedValue(result());
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function tree() {
  return <CampaignLoreOperationControls scope={scope} mode="metadata-only" />;
}
async function select() {
  await userEvent.click(await screen.findByRole('button', { name: 'Encerrar preparo remoto' }));
}
async function confirm() {
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar encerramento do pedido' }));
}
it('encerramento remoto explícito usa só metadados e preserva ciphertext local integral', async () => {
  await local.reserveLoreOperation(operation);
  const sealed = {
    ...operation,
    phase: 'sealed' as const,
    nonce: new Uint8Array(12).buffer,
    ciphertext: new Uint8Array(16).buffer,
  };
  await local.replaceLoreOperation(sealed, 'preparing');
  render(tree());
  await select();
  await userEvent.click(screen.getByRole('button', { name: 'Manter pedido' }));
  expect(api.resolveCampaignLoreRemoteOperation).not.toHaveBeenCalled();
  await select();
  await confirm();
  expect(await screen.findByText('Resolução do pedido remoto confirmada.')).toBeInTheDocument();
  expect(await local.readLoreOperation(uid, campaignId)).toEqual(sealed);
  expect(journal.readRemoteResolution(uid, campaignId)).toBeNull();
  const sent = vi.mocked(api.resolveCampaignLoreRemoteOperation).mock.calls[0]![0];
  expect(Object.keys(sent).sort()).toEqual(
    [
      'campaignId',
      'campaignToken',
      'baseId',
      'operationId',
      'statusToken',
      'resolutionId',
      'intent',
    ].sort(),
  );
});
it('resposta perdida reaparece com lista vazia e repete exatamente a resolução após reload', async () => {
  const send = vi.mocked(api.resolveCampaignLoreRemoteOperation).getMockImplementation()!;
  vi.mocked(api.resolveCampaignLoreRemoteOperation).mockImplementationOnce(async (input) => {
    await send(input);
    throw new Error('Resposta perdida');
  });
  const view = render(tree());
  await select();
  await confirm();
  expect(
    await screen.findByRole('button', { name: 'Confirmar resolução preservada' }),
  ).toBeInTheDocument();
  const input = vi.mocked(api.resolveCampaignLoreRemoteOperation).mock.calls[0]![0];
  view.unmount();
  render(tree());
  await userEvent.click(
    await screen.findByRole('button', { name: 'Confirmar resolução preservada' }),
  );
  expect(await screen.findByText('Resolução do pedido remoto confirmada.')).toBeInTheDocument();
  expect(api.resolveCampaignLoreRemoteOperation).toHaveBeenNthCalledWith(2, input);
  expect(journal.readRemoteResolution(uid, campaignId)).toBeNull();
});
it('rejeição com recibo é preservada até encerramento explícito, sem apagar journal cifrado', async () => {
  await local.reserveLoreOperation(operation);
  vi.mocked(api.resolveCampaignLoreRemoteOperation).mockImplementation((input) =>
    Promise.resolve().then(() => ({
      schemaVersion: 1,
      ownerId: uid,
      request: input,
      outcome: 'rejected',
      state: null,
      reason: 'operation-changed',
      revision: null,
    })),
  );
  render(tree());
  await select();
  await confirm();
  expect(
    await screen.findByRole('button', { name: 'Encerrar tentativa de resolução' }),
  ).toBeInTheDocument();
  const pending = journal.readRemoteResolution(uid, campaignId);
  expect(pending).not.toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar resolução preservada' }));
  expect(api.resolveCampaignLoreRemoteOperation).toHaveBeenNthCalledWith(2, pending!.input);
  await userEvent.click(screen.getByRole('button', { name: 'Encerrar tentativa de resolução' }));
  await waitFor(() => expect(journal.readRemoteResolution(uid, campaignId)).toBeNull());
  expect(await local.readLoreOperation(uid, campaignId)).toEqual(operation);
});
it.each(['owner', 'request', 'unconfirmed'] as const)(
  'resposta %s não limpa nem substitui tentativa preservada',
  async (which) => {
    vi.mocked(api.resolveCampaignLoreRemoteOperation).mockImplementationOnce((input) =>
      Promise.resolve().then(() => {
        if (which === 'unconfirmed')
          throw Object.assign(new Error('Status mudou sem recibo'), {
            details: { reason: 'operation-changed' },
          });
        return {
          schemaVersion: 1,
          ownerId: which === 'owner' ? 'other' : uid,
          request: which === 'request' ? { ...input, baseId: 'f'.repeat(64) } : input,
          outcome: 'resolved',
          state: 'canceled',
          reason: null,
          revision: null,
        };
      }),
    );
    render(tree());
    await select();
    await confirm();
    expect(
      await screen.findByRole('button', { name: 'Confirmar resolução preservada' }),
    ).toBeInTheDocument();
    expect(journal.readRemoteResolution(uid, campaignId)).not.toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Encerrar tentativa de resolução' }),
    ).not.toBeInTheDocument();
  },
);
it('controle local antigo nunca recebido encerra pelo descriptor original sem depender de outra base', async () => {
  await local.reserveLoreOperation(operation);
  render(
    <CampaignLoreOperationControls
      scope={{ ...scope, baseId: 'f'.repeat(64) }}
      mode="metadata-only"
    />,
  );
  await userEvent.click(
    await screen.findByRole('button', { name: 'Encerrar pedido local sem recuperar texto' }),
  );
  await confirm();
  await waitFor(async () => expect(await local.readLoreOperation(uid, campaignId)).toBeNull());
  expect(lore.resolveCampaignLoreOperation).toHaveBeenCalledWith({
    ...operation.header,
    action: 'save',
    relatedSourceKeys: [],
    intent: 'cancel',
  });
  expect(lore.getCampaignLore).not.toHaveBeenCalled();
});
it('fase confirmed encerra só por confirm e clear antigo preserva fase nova do mesmo ID', async () => {
  await local.reserveLoreOperation(operation);
  const confirmed = { ...operation, phase: 'confirmed' as const, confirmedRevision: 1 };
  await local.replaceLoreOperation(confirmed, 'preparing');
  render(tree());
  await userEvent.click(
    await screen.findByRole('button', { name: 'Finalizar recuperação local confirmada' }),
  );
  await confirm();
  await waitFor(async () => expect(await local.readLoreOperation(uid, campaignId)).toBeNull());
  expect(lore.resolveCampaignLoreOperation).toHaveBeenLastCalledWith({
    ...operation.header,
    action: 'save',
    relatedSourceKeys: [],
    intent: 'confirm',
  });
  await local.reserveLoreOperation(operation);
  await local.replaceLoreOperation(confirmed, 'preparing');
  expect(await local.clearLoreOperation(operation)).toEqual(confirmed);
  expect(await local.readLoreOperation(uid, campaignId)).toEqual(confirmed);
});
it('sem WebLocks lista readonly e janela vazia continua; erro de lista oferece retry', async () => {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  vi.mocked(api.listCampaignLoreOperations)
    .mockRejectedValueOnce(new Error('Sem rede'))
    .mockResolvedValueOnce({
      schemaVersion: 1,
      ownerId: uid,
      ...scope,
      items: [],
      nextCursor: 'next',
    })
    .mockResolvedValueOnce({
      schemaVersion: 1,
      ownerId: uid,
      ...scope,
      items: [remoteOp],
      nextCursor: null,
    });
  render(tree());
  await screen.findByText('Sem rede');
  await userEvent.click(screen.getByRole('button', { name: 'Consultar pedidos novamente' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Carregar mais pedidos remotos' }),
  );
  expect(await screen.findByRole('button', { name: 'Encerrar preparo remoto' })).toBeDisabled();
  expect(api.resolveCampaignLoreRemoteOperation).not.toHaveBeenCalled();
});
it('UID tardio não limpa resolução anterior e fechar confirmação não reabre na resposta', async () => {
  const gate = deferred<CampaignLoreRemoteResolution>();
  vi.mocked(api.resolveCampaignLoreRemoteOperation).mockReturnValueOnce(gate.promise);
  const view = render(tree());
  await select();
  await confirm();
  const input = vi.mocked(api.resolveCampaignLoreRemoteOperation).mock.calls[0]![0];
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  auth.user = { uid: 'other' };
  view.rerender(tree());
  await act(async () => {
    gate.resolve({
      schemaVersion: 1,
      ownerId: uid,
      request: input,
      outcome: 'resolved',
      state: 'canceled',
      reason: null,
      revision: null,
    });
    await gate.promise;
  });
  expect(journal.readRemoteResolution(uid, campaignId)?.input).toEqual(input);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('consulta inteira mostra legado autorizado, campos e relações sem transformar em nota', async () => {
  const value = result();
  value.item!.legacy = true;
  vi.mocked(lore.getCampaignLore).mockResolvedValue(value);
  render(
    <CampaignLoreReadView
      scope={scope}
      sourceKey={sourceKey}
      expectedCollectionRevision={0}
      isActive={() => true}
      onInvalidated={vi.fn()}
    />,
  );
  expect(await screen.findByText('Legado da mesa')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Lia' })).toBeInTheDocument();
  expect(screen.getByText(/Segredo 🐉/)).toBeInTheDocument();
});
it.each(['revision', 'unavailable', 'UID'] as const)(
  'consulta inteira invalida %s sem publicar corpo',
  async (which) => {
    const value = result(),
      invalid = vi.fn();
    if (which === 'revision') value.collectionRevision = 1;
    if (which === 'unavailable') value.item = null;
    const gate = deferred<typeof value>();
    vi.mocked(lore.getCampaignLore).mockReturnValue(gate.promise);
    const view = render(
      <CampaignLoreReadView
        scope={scope}
        sourceKey={sourceKey}
        expectedCollectionRevision={0}
        isActive={() => true}
        onInvalidated={invalid}
      />,
    );
    if (which === 'UID') {
      auth.user = { uid: 'other' };
      view.rerender(
        <CampaignLoreReadView
          scope={scope}
          sourceKey={sourceKey}
          expectedCollectionRevision={0}
          isActive={() => true}
          onInvalidated={invalid}
        />,
      );
    }
    await act(async () => {
      gate.resolve(value);
      await gate.promise;
    });
    expect(screen.queryByText(/Segredo 🐉/)).not.toBeInTheDocument();
    if (which !== 'UID') expect(invalid).toHaveBeenCalled();
  },
);
it('reserva remota vencida antes do envio não substitui nem envia controle de outra aba', async () => {
  const original = journal.reserveRemoteResolution;
  let preserved: ReturnType<typeof journal.readRemoteResolution> = null;
  vi.spyOn(journal, 'reserveRemoteResolution').mockImplementationOnce(async (op, check) => {
    await original(op, check);
    await journal.clearRemoteResolution(op, check);
    preserved = { ...op, input: { ...op.input, resolutionId: 'third-resolution' } };
    await original(preserved, check);
  });
  render(tree());
  await select();
  await confirm();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Confirmar resolução preservada' })).toBeEnabled(),
  );
  expect(api.resolveCampaignLoreRemoteOperation).not.toHaveBeenCalled();
  expect(journal.readRemoteResolution(uid, campaignId)).toEqual(preserved);
});
it('confirmação local congela A e não encerra novo ciphertext B de outra aba', async () => {
  await local.reserveLoreOperation(operation);
  render(tree());
  await userEvent.click(
    await screen.findByRole('button', { name: 'Encerrar pedido local sem recuperar texto' }),
  );
  await local.clearLoreOperation(operation);
  const newer = { ...operation, header: { ...operation.header, operationId: 'another-operation' } };
  await local.reserveLoreOperation(newer);
  await confirm();
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'Confirmar encerramento do pedido' }),
    ).not.toBeInTheDocument(),
  );
  expect(lore.resolveCampaignLoreOperation).not.toHaveBeenCalled();
  expect(await local.readLoreOperation(uid, campaignId)).toEqual(newer);
});
