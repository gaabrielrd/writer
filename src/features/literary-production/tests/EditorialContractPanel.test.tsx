import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorialContractPanel } from '../components/EditorialContractPanel';
import { editorialFields, type EditorialContract, type EditorialState } from '../model/editorial';
import { getLiteraryContract, saveLiteraryContract } from '../services/literaryProductionService';
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { uid: 'author' } }) }));
vi.mock('../services/literaryProductionService', () => ({
  getLiteraryContract: vi.fn(),
  saveLiteraryContract: vi.fn(),
  getLiteraryContractVersion: vi.fn(),
  listLiteraryContractVersions: vi.fn(),
}));
const empty = (): EditorialContract => ({
  schemaVersion: 1,
  fields: Object.fromEntries(
    Object.keys(editorialFields).map((key) => [key, '']),
  ) as EditorialContract['fields'],
  decisions: [],
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getLiteraryContract).mockResolvedValue({
    revision: 0,
    updatedAt: null,
    contract: empty(),
  });
});
it('salva a intenção do autor sem inventar decisões aprovadas', async () => {
  const user = userEvent.setup();
  vi.mocked(saveLiteraryContract).mockImplementation((input) =>
    Promise.resolve({
      revision: 1,
      updatedAt: 1,
      contract: input.contract,
    }),
  );
  render(<EditorialContractPanel bookId="book" />);
  await user.type(await screen.findByLabelText('Premissa'), 'Uma carta atrasada.');
  await user.click(screen.getByRole('button', { name: 'Salvar contrato e decisões' }));
  await waitFor(() => expect(saveLiteraryContract).toHaveBeenCalledTimes(1));
  const input = vi.mocked(saveLiteraryContract).mock.calls[0]?.[0];
  if (!input) throw new Error('Salvamento não registrado.');
  expect(input.contract.fields.premise).toBe('Uma carta atrasada.');
  expect(input.contract.decisions).toEqual([]);
  expect(await screen.findByText('Revisão 1')).toBeInTheDocument();
});
it('repete exatamente o pedido preservado após resposta incerta', async () => {
  const user = userEvent.setup();
  vi.mocked(saveLiteraryContract).mockRejectedValueOnce(new Error('Resposta incerta'));
  vi.mocked(saveLiteraryContract).mockImplementationOnce((input) =>
    Promise.resolve({
      revision: 1,
      updatedAt: 1,
      contract: input.contract,
    }),
  );
  render(<EditorialContractPanel bookId="book" />);
  await user.type(await screen.findByLabelText('Premissa'), 'A carta.');
  await user.click(screen.getByRole('button', { name: 'Salvar contrato e decisões' }));
  await user.click(await screen.findByRole('button', { name: 'Recuperar salvamento' }));
  await waitFor(() => expect(saveLiteraryContract).toHaveBeenCalledTimes(2));
  expect(vi.mocked(saveLiteraryContract).mock.calls[0]?.[0]).toEqual(
    vi.mocked(saveLiteraryContract).mock.calls[1]?.[0],
  );
});
it('comparar com servidor conserva o rascunho até escolha explícita', async () => {
  const user = userEvent.setup();
  render(<EditorialContractPanel bookId="book" />);
  await user.type(await screen.findByLabelText('Premissa'), 'Minha versão.');
  const remote = empty();
  remote.fields.premise = 'Outra versão.';
  vi.mocked(getLiteraryContract).mockResolvedValue({ revision: 2, updatedAt: 2, contract: remote });
  await user.click(screen.getByRole('button', { name: 'Comparar com servidor' }));
  await screen.findByText('Versão atual do servidor: 2');
  expect(screen.getByLabelText('Premissa')).toHaveValue('Minha versão.');
});

it('saves the operational mode separately from free-form observations without starting execution', async () => {
  const user = userEvent.setup();
  vi.mocked(saveLiteraryContract).mockImplementation((input) =>
    Promise.resolve({
      revision: 1,
      updatedAt: 1,
      contract: input.contract,
    }),
  );
  const onStateChange = vi.fn<(state: EditorialState) => void>();
  render(<EditorialContractPanel bookId="book" onStateChange={onStateChange} />);
  await user.click(await screen.findByRole('combobox', { name: 'Método de colaboração' }));
  await user.click(screen.getByRole('option', { name: 'Orientação' }));
  await user.click(screen.getByRole('button', { name: 'Salvar contrato e decisões' }));
  await waitFor(() => expect(saveLiteraryContract).toHaveBeenCalledTimes(1));
  const saved = vi.mocked(saveLiteraryContract).mock.calls[0]?.[0];
  expect(saved?.contract.collaborationPolicy).toEqual({ version: 1, mode: 'guidance' });
  expect(saved?.contract.fields.collaboration).toBe('');
  await waitFor(() => expect(onStateChange.mock.calls.at(-1)?.[0].revision).toBe(1));
  expect(onStateChange.mock.calls.at(-1)?.[0].contract.collaborationPolicy).toEqual({
    version: 1,
    mode: 'guidance',
  });
});

it('saves the publication unit chosen by the author as part of the same contract', async () => {
  vi.mocked(saveLiteraryContract).mockImplementation((input) =>
    Promise.resolve({
      revision: 1,
      updatedAt: 1,
      contract: input.contract,
    }),
  );
  render(<EditorialContractPanel bookId="book" />);
  const field = await screen.findByLabelText('Unidade de publicação do contrato');
  await userEvent.click(field);
  await userEvent.click(await screen.findByRole('option', { name: 'Ato' }));
  await userEvent.click(screen.getByRole('button', { name: 'Salvar contrato e decisões' }));
  await waitFor(() => expect(saveLiteraryContract).toHaveBeenCalledTimes(1));
  expect(vi.mocked(saveLiteraryContract).mock.calls[0]?.[0].contract.publicationPolicy).toEqual({
    version: 1,
    unit: 'act',
  });
});
