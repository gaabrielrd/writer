import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

it('mostra todos os atributos no painel lateral, inclusive personalizados e valores zero e cem', async () => {
  const media = window.matchMedia.bind(window);
  window.matchMedia = (query) => ({
    matches: query === '(min-width: 1100px)',
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
  const custom: AIPersona = {
    ...DEFAULT_PERSONAS[0]!,
    id: 'custom-completa',
    name: 'Voz completa',
    traits: [
      ...DEFAULT_PERSONAS[0]!.traits,
      ...Array.from({ length: 8 }, (_, index) => ({
        id: `custom-${index}`,
        name: `Atributo personalizado com nome longo ${index + 1}`,
        description: 'Intensidade',
        low: 'Baixa',
        high: 'Alta',
        value: index === 0 ? 0 : index === 7 ? 100 : 50,
      })),
    ],
  };
  items = [custom];
  try {
    render(<PersonaManager ownerId="author" />);
    for (const persona of [DEFAULT_PERSONAS[0]!, custom]) {
      fireEvent.click(
        await screen.findByRole('button', { name: `Ver detalhes de ${persona.name}` }),
      );
      const panel = within(
        screen.getByRole('complementary', { name: `Detalhes de ${persona.name}` }),
      );
      const traits = panel.getByRole('list', { name: 'Atributos da persona' });
      expect(within(traits).getAllByRole('listitem')).toHaveLength(persona.traits.length);
      expect(within(traits).getAllByRole('progressbar')).toHaveLength(persona.traits.length);
      persona.traits.forEach((trait, index) => {
        expect(within(traits).getAllByRole('listitem')[index]).toHaveTextContent(trait.name);
        expect(
          within(traits).getByRole('progressbar', { name: `${persona.name}: ${trait.name}` }),
        ).toHaveAttribute('value', String(trait.value));
      });
      expect(panel.getByRole('button', { name: 'Abrir detalhes' })).toBeVisible();
    }
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir detalhes' }));
    expect(screen.getByRole('dialog')).toBeVisible();
  } finally {
    window.matchMedia = media;
  }
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

it('resume o rascunho completo e acompanha valores e definições sem salvar a persona', async () => {
  const user = userEvent.setup({ delay: null });
  const persona: AIPersona = {
    ...DEFAULT_PERSONAS[3]!,
    id: 'custom-resumo',
    name: 'Minha voz',
    traits: [
      ...DEFAULT_PERSONAS[3]!.traits,
      ...Array.from({ length: 8 }, (_, index) => ({
        id: `custom-${index}`,
        name: `Atributo próprio ${index + 1}`,
        description: 'Tratamento entre personagens',
        low: 'Coloquial',
        high: 'Cerimonial',
        value: index === 0 ? 0 : index === 7 ? 100 : 50,
      })),
    ],
  };
  items = [persona];
  render(<PersonaManager ownerId="author" />);
  await user.click(await screen.findByRole('button', { name: 'Ver detalhes de Minha voz' }));
  await user.click(screen.getByRole('button', { name: 'Editar Minha voz' }));
  const toggle = screen.getByRole('button', { name: /^Resumo das orientações/ });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await user.click(toggle);
  const summary = within(screen.getByRole('region', { name: 'Atributos do resumo' }));
  expect(summary.getAllByRole('term')).toHaveLength(16);
  expect(summary.getByText('16 atributos')).toBeVisible();
  for (const trait of persona.traits) {
    expect(summary.getByRole('progressbar', { name: `Resumo de ${trait.name}` })).toHaveAttribute(
      'value',
      String(trait.value),
    );
  }
  fireEvent.change(screen.getByLabelText('Sensorialidade'), { target: { value: '0' } });
  expect(summary.getByRole('progressbar', { name: 'Resumo de Sensorialidade' })).toHaveAttribute(
    'value',
    '0',
  );
  const instructions = 'Primeira orientação.\n\nSegunda orientação.';
  fireEvent.change(screen.getByLabelText('Instruções permanentes'), {
    target: { value: instructions },
  });
  expect(
    within(screen.getByRole('region', { name: 'Direção de escrita do resumo' })).getByText(
      /Primeira orientação/,
    ).textContent,
  ).toBe(instructions);
  await user.click(screen.getByText('Editar definição de Atributo próprio 1'));
  fireEvent.change(screen.getByLabelText('Valor 100 de Atributo próprio 1'), {
    target: { value: 'Formalidade máxima' },
  });
  expect(summary.getByText('100 · Formalidade máxima')).toBeVisible();
  await user.click(toggle);
  await user.click(toggle);
  expect(summary.getByRole('progressbar', { name: 'Resumo de Sensorialidade' })).toHaveAttribute(
    'value',
    '0',
  );
  expect(savePersona).not.toHaveBeenCalled();
});

it('mostra um estado explícito no resumo quando a persona ainda não tem instruções', async () => {
  render(<PersonaManager ownerId="author" />);
  await userEvent.click(await screen.findByRole('button', { name: 'Nova persona' }));
  await userEvent.click(screen.getByRole('button', { name: /^Resumo das orientações/ }));
  expect(screen.getByText('Nenhuma instrução permanente definida.')).toBeVisible();
  expect(
    within(screen.getByRole('region', { name: 'Atributos do resumo' })).getAllByRole('term'),
  ).toHaveLength(8);
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
