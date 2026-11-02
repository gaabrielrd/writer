import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { AdventureLoreCollection } from '../components/AdventureLoreCollection';
import { AdventureLoreReader } from '../components/AdventureLoreReader';
import * as api from '../services/adventureLoreCallables';
import type {
  AdventureLoreSummary,
  AdventureLoreEntityInput,
  AdventureLoreOutcome,
  AdventureLoreSave,
  AdventureLoreGet,
} from '../model/adventureLore';
import {
  adventureId,
  uid,
  identity,
  row,
  globalRow,
  entity,
  contextToken,
  list,
  deferred,
} from './adventureLoreFixtures';
const auth = vi.hoisted(() => ({ user: { uid: 'owner' } }));
const hints = vi.hoisted(() => ({ listeners: new Set<(kind: 'root' | 'universe') => void>() }));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/adventureLoreCallables');
vi.mock('../services/adventureLoreContext', () => ({
  subscribeAdventureLoreHints: (_input: unknown, notify: (kind: 'root' | 'universe') => void) => {
    hints.listeners.add(notify);
    return () => {
      hints.listeners.delete(notify);
    };
  },
}));
let rows: AdventureLoreSummary[], body: AdventureLoreEntityInput, collection: number;
function outcome(
  request: AdventureLoreSave,
  action: 'save' | 'delete' = 'save',
): AdventureLoreOutcome {
  return {
    ...identity,
    kind: 'confirmed',
    receipt: {
      operationId: request.operationId,
      action,
      entityId: request.entityId,
      expectedRevision: request.expectedRevision,
      revision: request.expectedRevision + 1,
      collectionRevision: request.expectedCollectionRevision + 1,
    },
  };
}
function commit(request: AdventureLoreSave) {
  body = structuredClone(request.entity);
  collection = request.expectedCollectionRevision + 1;
  rows = [
    {
      id: 'adventure:' + adventureId + ':' + request.entityId,
      reference: { kind: 'adventure', scopeId: adventureId, entityId: request.entityId },
      entityToken: row.entityToken,
      name: body.name,
      aliases: body.aliases,
      category: body.category,
      summary: body.summary,
      isPublic: false,
      createdAt: 1,
      updatedAt: collection,
      revision: request.expectedRevision + 1,
      relationCount: body.relations.length,
    },
  ];
  return outcome(request);
}
beforeEach(() => {
  vi.resetAllMocks();
  hints.listeners.clear();
  auth.user = { uid };
  rows = [structuredClone(row)];
  body = structuredClone(entity);
  collection = 1;
  vi.mocked(api.listAdventureLore).mockImplementation((input) =>
    Promise.resolve({
      ...list(input, input.scope === 'adventure' ? rows.slice(0, input.limit ?? 25) : []),
      collectionRevision: collection,
    }),
  );
  vi.mocked(api.getAdventureLore).mockImplementation((input) =>
    Promise.resolve({
      ...identity,
      collectionRevision: collection,
      contextToken,
      item: {
        ...rows.find(
          (item) =>
            item.id ===
            input.reference.kind + ':' + input.reference.scopeId + ':' + input.reference.entityId,
        )!,
        details: body.details,
        structuredDetails: body.structuredDetails,
        relations: body.relations.map((r) => ({ ...r, available: true })),
      },
    }),
  );
  vi.mocked(api.saveAdventureLore).mockImplementation((input) => Promise.resolve(commit(input)));
  vi.mocked(api.deleteAdventureLore).mockImplementation((input) => {
    rows = [];
    collection++;
    return Promise.resolve(outcome({ ...input, entity: body }, 'delete'));
  });
  vi.mocked(api.resolveAdventureLoreOperation).mockImplementation((input) =>
    Promise.resolve({
      ...identity,
      kind: 'canceled',
      action: input.action,
      operationId: input.operationId,
    }),
  );
});
const field = () =>
  screen.getByRole('textbox', { name: 'Ficha Detalhada / Lore Completo (opcional)' });
async function openEdit() {
  await userEvent.click(await screen.findByRole('button', { name: 'Editar Dragão' }));
  await screen.findByRole('dialog');
  await screen.findByRole('textbox', { name: 'Nome da Entidade' });
  await openHistory();
}
async function click(name: string) {
  await userEvent.click(await screen.findByRole('button', { name }));
}
async function openHistory() {
  await userEvent.click(screen.getByRole('button', { name: /^História e notas/ }));
}
it('edita prosa integral, fecha após confirmação e exclui pela confirmação própria', async () => {
  render(<AdventureLoreCollection adventureId={adventureId} />);
  await openEdit();
  fireEvent.change(field(), { target: { value: '  Texto 🐉\n  ' } });
  await click('Salvar Alterações');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(vi.mocked(api.saveAdventureLore).mock.calls[0]![0].entity.details).toBe('  Texto 🐉\n  ');
  await click('Excluir Dragão');
  await click('Confirmar exclusão');
  await screen.findByText('Nenhuma entidade cadastrada');
  expect(api.deleteAdventureLore).toHaveBeenCalledTimes(1);
});
it('cria ficha privada sem fake body e oferece abandonar rascunho explicitamente', async () => {
  rows = [];
  render(<AdventureLoreCollection adventureId={adventureId} />);
  await screen.findByText('Nenhuma entidade cadastrada');
  await click('Nova Entidade');
  await openHistory();
  fireEvent.change(screen.getByLabelText('Nome da Entidade'), { target: { value: '  Sábia  ' } });
  fireEvent.change(screen.getByLabelText('Resumo Curto'), { target: { value: '  Guardiã  ' } });
  fireEvent.change(screen.getByLabelText('Apelidos / Aliases'), {
    target: { value: '  Nome oculto  ' },
  });
  fireEvent.change(field(), { target: { value: '  Corpo preservado  ' } });
  await click('Cancelar');
  await screen.findByRole('dialog', { name: 'Descartar rascunho de lore?' });
  await click('Continuar editando');
  expect(field()).toHaveValue('  Corpo preservado  ');
  await click('Cadastrar Entidade');
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const sent = vi.mocked(api.saveAdventureLore).mock.calls[0]![0];
  expect(sent.entityId).toBe(sent.operationId);
  expect(sent.entity).toMatchObject({
    name: 'Sábia',
    summary: 'Guardiã',
    aliases: ['Nome oculto'],
    details: '  Corpo preservado  ',
    isPublic: false,
  });
});
it('hint global preserva texto local e relações indisponíveis permitem manter/remover sem rótulo antigo', async () => {
  body.relations = [
    { targetEntityId: globalRow.id, relationType: 'Conhece', description: '  Minha descrição  ' },
  ];
  rows = [{ ...row, relationCount: 1 }];
  vi.mocked(api.getAdventureLore).mockResolvedValue({
    ...identity,
    collectionRevision: 1,
    contextToken,
    item: {
      ...row,
      relationCount: 1,
      details: body.details,
      structuredDetails: body.structuredDetails,
      relations: [{ ...body.relations[0]!, available: false }],
    },
  });
  render(<AdventureLoreCollection adventureId={adventureId} />);
  await openEdit();
  fireEvent.change(field(), { target: { value: 'Meu rascunho local' } });
  act(() => {
    for (const notify of hints.listeners) notify('universe');
  });
  await waitFor(() => expect(field()).toHaveValue('Meu rascunho local'));
  await userEvent.click(screen.getByRole('button', { name: /^Relações/ }));
  await screen.findByText(/Relação indisponível/);
  expect(screen.getByLabelText('Tipo de Relação')).toBeDisabled();
  expect(screen.getByLabelText('Descrição da Relação')).toBeDisabled();
  expect(screen.queryByText('Global')).not.toBeInTheDocument();
  await click('Salvar Alterações');
  await waitFor(() => expect(api.saveAdventureLore).toHaveBeenCalled());
  expect(vi.mocked(api.saveAdventureLore).mock.calls[0]![0].entity.relations).toEqual(
    body.relations,
  );
});
it('lista atualizada não rebaseia CAS do formulário nem apaga prosa ao conflito', async () => {
  render(<AdventureLoreCollection adventureId={adventureId} />);
  await openEdit();
  fireEvent.change(field(), { target: { value: 'Texto em conflito' } });
  collection = 2;
  act(() => {
    for (const notify of hints.listeners) notify('universe');
  });
  await waitFor(() => expect(field()).toHaveValue('Texto em conflito'));
  vi.mocked(api.saveAdventureLore).mockRejectedValueOnce(new Error('Conflito CAS'));
  await click('Salvar Alterações');
  await screen.findAllByText('Conflito CAS');
  expect(field()).toHaveValue('Texto em conflito');
  expect(vi.mocked(api.saveAdventureLore).mock.calls[0]![0].expectedCollectionRevision).toBe(1);
  await click('Encerrar pedido de lore');
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Confirmar pedido de lore' })).toBeNull(),
  );
  expect(field()).toHaveValue('Texto em conflito');
});
it('confirmação histórica de criação e comparação explícita mantêm edição posterior sem remount', async () => {
  rows = [];
  collection = 0;
  vi.mocked(api.saveAdventureLore)
    .mockImplementationOnce((input) => {
      commit(input);
      return Promise.reject(new Error('Sem resposta'));
    })
    .mockImplementation((input) => Promise.resolve(outcome(input)));
  render(<AdventureLoreCollection adventureId={adventureId} />);
  await screen.findByText('Nenhuma entidade cadastrada');
  await click('Nova Entidade');
  await openHistory();
  fireEvent.change(screen.getByLabelText('Nome da Entidade'), { target: { value: 'Nova ficha' } });
  fireEvent.change(screen.getByLabelText('Resumo Curto'), { target: { value: 'Resumo' } });
  fireEvent.change(field(), { target: { value: 'Texto enviado' } });
  await click('Cadastrar Entidade');
  await screen.findAllByText('Sem resposta');
  fireEvent.change(field(), { target: { value: 'Meu texto posterior' } });
  await click('Confirmar pedido de lore');
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Confirmar pedido de lore' })).toBeNull(),
  );
  expect(field()).toHaveValue('Meu texto posterior');
  await click('Conferir revisão atual');
  await screen.findByRole('dialog', { name: 'Comparar ficha atual' });
  await click('Usar esta revisão e manter meu rascunho');
  expect(field()).toHaveValue('Meu texto posterior');
  await click('Salvar Alterações');
  await waitFor(() => expect(api.saveAdventureLore).toHaveBeenCalledTimes(3));
  expect(vi.mocked(api.saveAdventureLore).mock.calls[2]![0]).toMatchObject({
    expectedRevision: 1,
    expectedCollectionRevision: 1,
    entity: { details: 'Meu texto posterior' },
  });
});
it('revogação local oculta corpo e conserva rascunho somente em memória até nova checagem', async () => {
  render(<AdventureLoreCollection adventureId={adventureId} />);
  await openEdit();
  fireEvent.change(field(), { target: { value: 'RASCUNHO PRIVADO' } });
  vi.mocked(api.listAdventureLore).mockRejectedValue(new Error('Aventura indisponível'));
  act(() => {
    for (const notify of hints.listeners) notify('root');
  });
  await screen.findByText('Aventura indisponível');
  expect(screen.queryByDisplayValue('RASCUNHO PRIVADO')).not.toBeInTheDocument();
  vi.mocked(api.listAdventureLore).mockImplementation((input) => Promise.resolve(list(input)));
  await click('Atualizar lore da aventura');
  await waitFor(() => expect(field()).toHaveValue('RASCUNHO PRIVADO'));
});
it('get A não fica visível ao trocar para B inexistente na mesma geração', async () => {
  const rendered = render(
    <AdventureLoreReader adventureId={adventureId} entityId={row.id} onClose={vi.fn()} />,
  );
  await screen.findByText(entity.details.trim());
  rendered.rerender(
    <AdventureLoreReader
      adventureId={adventureId}
      entityId="adventure:adventure-lore-fixture:missing-entity-long"
      onClose={vi.fn()}
    />,
  );
  expect(screen.queryByText(entity.details.trim())).toBeNull();
  await screen.findByText('Ficha indisponível.');
});
it('leitura com get pendente só oferece loading; erro não inventa corpo', async () => {
  const pending = deferred<AdventureLoreGet>();
  vi.mocked(api.getAdventureLore).mockReturnValueOnce(pending.promise);
  render(<AdventureLoreReader adventureId={adventureId} entityId={row.id} onClose={vi.fn()} />);
  await screen.findByText('Conferindo ficha completa…');
  await act(async () => {
    pending.resolve({
      ...identity,
      collectionRevision: 1,
      contextToken: 'd'.repeat(64),
      item: {
        ...row,
        details: 'PROSA NÃO AUTORIZADA',
        structuredDetails: entity.structuredDetails,
        relations: [],
      },
    });
    await Promise.resolve();
  });
  await screen.findByRole('alert');
  expect(screen.queryByText('PROSA NÃO AUTORIZADA')).toBeNull();
});

it('get B com erro não reabre o corpo de A na mesma geração', async () => {
  const second = {
    ...row,
    id: 'adventure:' + adventureId + ':second-entity-long',
    reference: { kind: 'adventure' as const, scopeId: adventureId, entityId: 'second-entity-long' },
  };
  rows.push(second);
  const rendered = render(
    <AdventureLoreReader adventureId={adventureId} entityId={row.id} onClose={vi.fn()} />,
  );
  await screen.findByText(entity.details.trim());
  vi.mocked(api.getAdventureLore).mockRejectedValueOnce(new Error('B indisponível'));
  rendered.rerender(
    <AdventureLoreReader adventureId={adventureId} entityId={second.id} onClose={vi.fn()} />,
  );
  expect(screen.queryByText(entity.details.trim())).toBeNull();
  await screen.findByText('B indisponível');
  expect(screen.queryByText(entity.details.trim())).toBeNull();
});
