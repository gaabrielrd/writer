import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { PersonaManager } from '../components/PersonaManager';
import { DEFAULT_PERSONAS, type AIPersona } from '../model/persona';
import { savePersona, subscribePersonas } from '../services/personaService';
vi.mock('../services/personaService', () => ({ savePersona: vi.fn(), subscribePersonas: vi.fn() }));
let items: AIPersona[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  items = [];
  vi.mocked(subscribePersonas).mockImplementation((_owner, callback) => {
    callback(items);
    return vi.fn();
  });
  vi.mocked(savePersona).mockImplementation((_owner, input) => Promise.resolve(input));
});

it('personaliza um padrão com slider por teclado, atributo próprio e instruções salvas', async () => {
  // O formulário não depende de pausas entre teclas; preserva os eventos sem timers por caractere.
  const user = userEvent.setup({ delay: null });
  render(<PersonaManager ownerId="author" />);
  expect(await screen.findByText('Você ainda não criou personas')).toBeVisible();
  const avatarFiles = [
    '01-atmosferico',
    '02-incisivo',
    '03-intimo',
    '04-ironico',
    '05-epico',
    '06-inquietante',
  ];
  DEFAULT_PERSONAS.forEach((persona, index) => {
    expect(screen.getByRole('img', { name: `Avatar de ${persona.name}` })).toHaveAttribute(
      'src',
      `/img/persona/${avatarFiles[index]}.png`,
    );
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Ver detalhes de O Incisivo' }));
  expect(screen.getByRole('progressbar', { name: 'Concisão' })).toHaveAttribute('value', '95');
  await user.click(screen.getByRole('button', { name: 'Personalizar O Incisivo' }));
  await user.clear(screen.getByLabelText('Nome da persona'));
  await user.type(screen.getByLabelText('Nome da persona'), 'Minha voz');
  fireEvent.change(screen.getByLabelText('Concisão'), { target: { value: '80' } });
  await user.click(screen.getByRole('button', { name: /Criar slider personalizado/ }));
  await user.type(screen.getByLabelText('Nome do atributo'), 'Formalidade');
  await user.type(screen.getByLabelText('Significado do atributo'), 'Tratamento entre personagens');
  await user.type(screen.getByLabelText('Significado de 0'), 'Coloquial');
  await user.type(screen.getByLabelText('Significado de 100'), 'Cerimonial');
  await user.click(screen.getByRole('button', { name: 'Adicionar atributo' }));
  fireEvent.change(screen.getByLabelText('Formalidade'), { target: { value: '70' } });
  await user.click(screen.getByRole('button', { name: 'Salvar persona' }));
  await waitFor(() =>
    expect(savePersona).toHaveBeenCalledWith(
      'author',
      expect.objectContaining({
        name: 'Minha voz',
        id: expect.stringMatching(/^custom-/) as string,
        traits: expect.arrayContaining([
          expect.objectContaining({ id: 'concision', value: 80 }),
          expect.objectContaining({
            name: 'Formalidade',
            value: 70,
            low: 'Coloquial',
            high: 'Cerimonial',
          }),
        ]) as AIPersona['traits'],
      }),
      null,
    ),
  );
  expect(DEFAULT_PERSONAS[1]!.traits.find((trait) => trait.id === 'concision')!.value).toBe(95);
});

it('cria do zero, preserva o formulário em falha e permite retentativa', async () => {
  const user = userEvent.setup({ delay: null });
  vi.mocked(savePersona).mockRejectedValueOnce(new Error('Offline'));
  render(<PersonaManager ownerId="author" />);
  await user.click(await screen.findByRole('button', { name: 'Nova persona' }));
  await user.type(screen.getByLabelText('Nome da persona'), 'Voz nova');
  await user.type(screen.getByLabelText('Descrição da persona'), 'Minha descrição');
  await user.type(screen.getByLabelText('Instruções permanentes'), 'Prefira diálogos curtos.');
  await user.click(screen.getByRole('button', { name: 'Salvar persona' }));
  expect(await screen.findByText('Offline')).toBeVisible();
  expect(screen.getByLabelText('Nome da persona')).toHaveValue('Voz nova');
  await user.click(screen.getByRole('button', { name: 'Salvar persona' }));
  expect(await screen.findByRole('heading', { name: 'Personas de escrita' })).toBeVisible();
});

it('edita, arquiva, reativa e cancela sem alterar as personas padrão', async () => {
  const user = userEvent.setup({ delay: null });
  items = [{ ...DEFAULT_PERSONAS[0]!, id: 'custom-test', name: 'Minha persona' }];
  render(<PersonaManager ownerId="author" />);
  await user.click(await screen.findByRole('button', { name: 'Ver detalhes de Minha persona' }));
  await user.click(screen.getByRole('button', { name: 'Editar Minha persona' }));
  expect(screen.getByText(/Alterações afetam/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Cancelar edição' }));
  await user.click(screen.getByRole('button', { name: 'Arquivar Minha persona' }));
  await waitFor(() =>
    expect(savePersona).toHaveBeenCalledWith(
      'author',
      expect.objectContaining({ archived: true }),
      1,
    ),
  );
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('mostra falhas da biblioteca, permite retry e impede gravação sem conta', async () => {
  vi.mocked(subscribePersonas).mockImplementationOnce((_owner, _callback, failed) => {
    failed(new Error('Falha da biblioteca'));
    return vi.fn();
  });
  const user = userEvent.setup({ delay: null });
  const view = render(<PersonaManager ownerId="author" />);
  expect(await screen.findByText('Falha da biblioteca')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByText('Você ainda não criou personas')).toBeVisible();
  view.rerender(<PersonaManager ownerId={null} />);
  expect(screen.getByRole('button', { name: 'Nova persona' })).toBeDisabled();
});

it('edita a definição de um atributo próprio, remove outro e salva sem perder instruções', async () => {
  const user = userEvent.setup({ delay: null });
  items = [
    {
      ...DEFAULT_PERSONAS[0]!,
      id: 'custom-test',
      name: 'Minha persona',
      traits: [
        ...DEFAULT_PERSONAS[0]!.traits,
        ...['Formalidade', 'Distância'].map((name, index) => ({
          id: `custom-${index}`,
          name,
          description: 'Intensidade',
          low: 'Baixa',
          high: 'Alta',
          value: 50,
        })),
      ],
    },
  ];
  render(<PersonaManager ownerId="author" />);
  await user.click(await screen.findByRole('button', { name: 'Ver detalhes de Minha persona' }));
  await user.click(screen.getByRole('button', { name: 'Editar Minha persona' }));
  await user.click(screen.getByText('Editar definição de Formalidade'));
  fireEvent.change(screen.getByLabelText('Significado de Formalidade'), {
    target: { value: 'Forma de tratamento' },
  });
  fireEvent.change(screen.getByLabelText('Valor 0 de Formalidade'), {
    target: { value: 'Coloquial' },
  });
  fireEvent.change(screen.getByLabelText('Valor 100 de Formalidade'), {
    target: { value: 'Cerimonial' },
  });
  fireEvent.change(screen.getByLabelText('Nome de Formalidade'), {
    target: { value: 'Formalidade verbal' },
  });
  await user.click(screen.getByRole('button', { name: 'Remover atributo Distância' }));
  expect(screen.queryByLabelText('Distância')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Salvar persona' }));
  await waitFor(() => expect(savePersona).toHaveBeenCalled());
  expect(vi.mocked(savePersona).mock.calls[0]![1].traits).toHaveLength(9);
  expect(vi.mocked(savePersona).mock.calls[0]![1].traits[8]).toMatchObject({
    name: 'Formalidade verbal',
    description: 'Forma de tratamento',
    low: 'Coloquial',
    high: 'Cerimonial',
  });
});
