import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoreEntityForm } from '../components/LoreEntityForm';
import type { LoreEntity } from '../model/loreEntity';

describe('LoreEntityForm', () => {
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
    const user = userEvent.setup();
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

    await user.type(screen.getByLabelText(/nome da entidade/i), 'Excalibur');
    await user.selectOptions(screen.getByLabelText('Categoria'), 'concept');
    await user.type(screen.getByLabelText(/apelidos \/ aliases/i), 'Espada Sagrada, Caliburn');
    await user.type(screen.getByLabelText(/resumo curto/i), 'A lendária lâmina forjada em Avalon.');
    await user.type(screen.getByLabelText(/ficha detalhada/i), 'Concedida pela Dama do Lago.');

    // Adicionar relação
    await user.click(screen.getByRole('button', { name: /adicionar relação/i }));
    expect(screen.getByLabelText('Entidade Vinculada')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Entidade Vinculada'), 'e-target');
    const relationTypeInput = screen.getByLabelText('Tipo de Relação');
    await user.clear(relationTypeInput);
    await user.type(relationTypeInput, 'Forjada para');

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
    const user = userEvent.setup();
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
