import { chooseDropdown } from '@/test/dropdown';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoreEntityForm } from '../components/LoreEntityForm';
import type { CreateLoreEntityInput, LoreEntity } from '../model/loreEntity';

describe('LoreEntityForm', () => {
  it('creates with only name and summary without visiting optional sections', async () => {
    const user = userEvent.setup();
    const submit = vi.fn().mockResolvedValue(undefined);
    render(<LoreEntityForm open allEntities={[]} onClose={vi.fn()} onSubmit={submit} />);
    await user.type(screen.getByLabelText('Nome da Entidade'), 'Lia');
    await user.type(screen.getByLabelText(/Resumo Curto/), 'Cartógrafa');
    expect(screen.getByLabelText('Notas privadas')).not.toBeVisible();
    expect(screen.getByLabelText(/Tornar visível/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Cadastrar Entidade' }));
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Lia', summary: 'Cartógrafa', relations: [] }),
    );
  });

  it('opens an invalid relation and prevents saving a collapsed incomplete field', async () => {
    const user = userEvent.setup();
    const submit = vi
      .fn<(input: CreateLoreEntityInput) => Promise<void>>()
      .mockResolvedValue(undefined);
    render(
      <LoreEntityForm
        open
        entityToEdit={{
          id: 'lia',
          bookId: 'book',
          name: 'Lia',
          aliases: [],
          category: 'character',
          summary: 'Cartógrafa',
          details: 'História preservada',
          structuredDetails: { appearance: '', personality: '', history: '', notes: 'Privado' },
          relations: [{ targetEntityId: 'target', relationType: '' }],
          isPublic: true,
          createdAt: 1,
          updatedAt: 1,
        }}
        allEntities={[]}
        onClose={vi.fn()}
        onSubmit={submit}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
    expect(screen.getByLabelText('Tipo de Relação')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveFocus();
    expect(submit).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Tipo de Relação'), 'Aliada');
    await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
    expect(submit.mock.calls[0]?.[0].details).toBe('História preservada');
    expect(submit.mock.calls[0]?.[0].structuredDetails?.notes).toBe('Privado');
  });
  const otherEntity: LoreEntity = {
    id: 'e-target',
    bookId: 'b-1',
    name: 'Reino de Logres',
    aliases: [],
    category: 'location',
    summary: 'O reino unificado.',
    details: '',
    relations: [],
    isPublic: true,
    createdAt: 1000,
    updatedAt: 1000,
  };

  it('renderiza modo de criacao, preenche dados, adiciona relacao e submete', async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <LoreEntityForm
        open={true}
        allEntities={[otherEntity]}
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    );

    expect(
      screen.getByRole('heading', { name: /cadastrar nova entidade no compêndio/i }),
    ).toBeInTheDocument();

    await fill(user, screen.getByLabelText(/nome da entidade/i), 'Excalibur');
    await chooseDropdown(user, screen.getByLabelText('Categoria'), 'Conceito / Item');
    await fill(user, screen.getByLabelText(/apelidos \/ aliases/i), 'Espada Sagrada, Caliburn');
    await fill(
      user,
      screen.getByLabelText(/resumo curto/i),
      'A lendária lâmina forjada em Avalon.',
    );
    await user.click(screen.getByRole('button', { name: /^História e notas/ }));
    await fill(user, screen.getByLabelText(/ficha detalhada/i), 'Concedida pela Dama do Lago.');

    await user.click(screen.getByRole('button', { name: /^Relações/ }));
    // Adicionar relação
    await user.click(screen.getByRole('button', { name: /adicionar relação/i }));
    expect(screen.getByLabelText('Entidade Vinculada')).toBeInTheDocument();
    await chooseDropdown(
      user,
      screen.getByLabelText('Entidade Vinculada'),
      'Reino de Logres (Local)',
    );
    const relationTypeInput = screen.getByLabelText('Tipo de Relação');
    await user.clear(relationTypeInput);
    await fill(user, relationTypeInput, 'Forjada para');

    await user.click(screen.getByRole('button', { name: 'Cadastrar Entidade' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Excalibur',
        category: 'concept',
        aliases: ['Espada Sagrada', 'Caliburn'],
        summary: 'A lendária lâmina forjada em Avalon.',
        details: 'Concedida pela Dama do Lago.',
        relations: [{ targetEntityId: 'e-target', relationType: 'Forjada para', description: '' }],
        isPublic: true,
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('renderiza modo de edicao, permite remover relacao e alterar visibilidade', async () => {
    const user = userEvent.setup({ delay: null });
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    const entityToEdit: LoreEntity = {
      id: 'e-1',
      bookId: 'b-1',
      name: 'Arthur',
      aliases: ['Pendragon'],
      category: 'character',
      summary: 'Rei de Camelot.',
      details: 'Portador da espada.',
      relations: [{ targetEntityId: 'e-target', relationType: 'Governante de' }],
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1000,
    };

    render(
      <LoreEntityForm
        open={true}
        entityToEdit={entityToEdit}
        allEntities={[entityToEdit, otherEntity]}
        onClose={onClose}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Editar Entidade: Arthur' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Arthur')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Relações/ }));
    // Alternar visibilidade
    const checkbox = screen.getByLabelText(/tornar visível no leitor público/i);
    await user.click(checkbox);

    // Remover relação existente
    await user.click(screen.getByRole('button', { name: 'Remover relação' }));

    await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Arthur',
        isPublic: false,
        relations: [],
      }),
    );
  });
});

it('preserva notas estruturadas privadas e descricao da relacao', async () => {
  const user = userEvent.setup({ delay: null });
  const onSubmit = vi.fn().mockResolvedValue(undefined);
  render(
    <LoreEntityForm
      open
      initialName="Nova"
      allEntities={[
        {
          id: 'b',
          bookId: 'book',
          name: 'Aliado',
          aliases: [],
          category: 'character',
          summary: 'Aliado',
          details: '',
          relations: [],
          isPublic: false,
          createdAt: 1,
          updatedAt: 1,
        },
      ]}
      onClose={vi.fn()}
      onSubmit={onSubmit}
    />,
  );
  expect(screen.getByLabelText('Nome da Entidade')).toHaveValue('Nova');
  await fill(user, screen.getByLabelText(/Resumo Curto/), 'Resumo público');
  await user.click(screen.getByRole('button', { name: /^Características/ }));
  await fill(user, screen.getByLabelText('Aparência'), 'Capa azul');
  await fill(user, screen.getByLabelText('Personalidade'), 'Reservada');
  await user.click(screen.getByRole('button', { name: /^História e notas/ }));
  await fill(user, screen.getByLabelText('Histórico'), 'Viajante');
  await fill(user, screen.getByLabelText('Notas privadas'), 'Segredo');
  await user.click(screen.getByRole('button', { name: /^Relações/ }));
  await user.click(screen.getByRole('button', { name: 'Adicionar Relação' }));
  await fill(user, screen.getByLabelText('Descrição da Relação'), 'Vínculo secreto');
  await user.click(screen.getByRole('button', { name: 'Cadastrar Entidade' }));
  expect(onSubmit).toHaveBeenCalledWith(
    expect.objectContaining({
      structuredDetails: {
        appearance: 'Capa azul',
        personality: 'Reservada',
        history: 'Viajante',
        notes: 'Segredo',
      },
      relations: [expect.objectContaining({ description: 'Vínculo secreto' })],
    }),
  );
});

it('mostra erro mantendo dados preenchidos para tentar novamente', async () => {
  const user = userEvent.setup({ delay: null });
  const onSubmit = vi
    .fn()
    .mockRejectedValueOnce(new Error('Sem conexão'))
    .mockResolvedValue(undefined);
  render(
    <LoreEntityForm
      open
      initialName="Nova"
      allEntities={[]}
      onClose={vi.fn()}
      onSubmit={onSubmit}
    />,
  );
  await fill(user, screen.getByLabelText(/Resumo Curto/), 'Resumo');
  await user.click(screen.getByRole('button', { name: 'Cadastrar Entidade' }));
  expect(await screen.findByText('Sem conexão')).toBeInTheDocument();
  expect(screen.getByLabelText('Nome da Entidade')).toHaveValue('Nova');
  await user.click(screen.getByRole('button', { name: 'Cadastrar Entidade' }));
  expect(onSubmit).toHaveBeenCalledTimes(2);
  expect(onSubmit.mock.calls[0]).toEqual(onSubmit.mock.calls[1]);
});

async function fill(user: ReturnType<typeof userEvent.setup>, field: HTMLElement, value: string) {
  await user.click(field);
  await user.paste(value);
}
