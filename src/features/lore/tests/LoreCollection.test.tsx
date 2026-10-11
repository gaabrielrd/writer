import { act, renderWithProviders, screen, waitFor, within } from '@/test/render';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoreCollection, LoreTab } from '../components/LoreTab';
import * as service from '../services/loreService';
import type { LoreEntity } from '../model/loreEntity';
import type { Book } from '@/features/books';

const entities: LoreEntity[] = [
  {
    id: 'arthur',
    bookId: 'book',
    name: 'Arthur',
    category: 'character',
    summary: 'Rei de Camelot',
    aliases: ['Pendragon'],
    details: 'Ficha completa',
    relations: [],
    isPublic: true,
    createdAt: 0,
    updatedAt: 0,
  },
  {
    id: 'camelot',
    bookId: 'book',
    name: 'Camelot',
    category: 'location',
    summary: 'Capital',
    aliases: [],
    details: '',
    relations: [],
    isPublic: false,
    createdAt: 0,
    updatedAt: 0,
  },
];
const book: Book = {
  id: 'book',
  authorId: 'author',
  title: 'Avalon',
  genre: '',
  synopsis: '',
  coverUrl: null,
  status: 'published',
  wordCount: 0,
  createdAt: 0,
  updatedAt: 0,
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(service, 'listLoreEntities').mockResolvedValue(structuredClone(entities));
  vi.spyOn(service, 'updateLoreEntity').mockResolvedValue();
  vi.spyOn(service, 'deleteLoreEntity').mockResolvedValue();
});

async function showList(props: Partial<Parameters<typeof LoreCollection>[0]> = {}) {
  const rendered = renderWithProviders(<LoreCollection scope="book" {...props} />);
  await screen.findByText('Arthur');
  await rendered.user.click(screen.getByRole('button', { name: 'Visualização em lista' }));
  return rendered;
}
const selectionBar = () => screen.getByRole('region', { name: 'Ações da seleção' });

describe('Compêndio em lista e ações em lote', () => {
  it('alterna grid/lista, mantém busca acessível e abre ficha e edição na lista', async () => {
    const { user } = await showList();
    expect(screen.getByRole('table', { name: 'Entidades do compêndio' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Visualização em lista' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('textbox', { name: 'Buscar no compêndio' })).toBeInTheDocument();
    expect(screen.queryByText('Buscar no compêndio')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ver ficha de Arthur' }));
    expect(screen.getByText('Ficha completa')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await user.click(screen.getByRole('button', { name: 'Editar Arthur' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(screen.getByRole('button', { name: 'Visualização em grid' }));
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Ver Ficha' })).toHaveLength(2);
  });

  it('seleciona uma, todas, desmarca todas e limpa pela barra', async () => {
    const { user } = await showList();
    const all = screen.getByRole('checkbox', { name: 'Selecionar todas as entidades exibidas' });
    expect(screen.queryByRole('region', { name: 'Ações da seleção' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Arthur' }));
    expect(all).toBePartiallyChecked();
    expect(selectionBar()).toHaveTextContent('1 selecionada');
    await user.click(all);
    expect(all).toBeChecked();
    expect(selectionBar()).toHaveTextContent('2 selecionadas');
    await user.click(all);
    expect(all).not.toBeChecked();
    expect(screen.queryByRole('region', { name: 'Ações da seleção' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Camelot' }));
    await user.click(within(selectionBar()).getByRole('button', { name: 'Limpar seleção' }));
    expect(screen.getByRole('checkbox', { name: 'Selecionar Camelot' })).not.toBeChecked();
  });

  it('seleciona só resultados filtrados e limpa seleção ao buscar, filtrar ou mudar visualização', async () => {
    const { user } = await showList();
    await user.type(screen.getByRole('textbox', { name: 'Buscar no compêndio' }), 'Pendragon');
    await user.click(
      screen.getByRole('checkbox', { name: 'Selecionar todas as entidades exibidas' }),
    );
    expect(selectionBar()).toHaveTextContent('1 selecionada');
    await user.clear(screen.getByRole('textbox', { name: 'Buscar no compêndio' }));
    expect(screen.getByRole('checkbox', { name: 'Selecionar Arthur' })).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Arthur' }));
    await user.click(screen.getByRole('tab', { name: /Locais/ }));
    expect(screen.queryByRole('region', { name: 'Ações da seleção' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Camelot' }));
    await user.click(screen.getByRole('button', { name: 'Visualização em grid' }));
    await user.click(screen.getByRole('button', { name: 'Visualização em lista' }));
    expect(screen.getByRole('checkbox', { name: 'Selecionar Camelot' })).not.toBeChecked();
  });

  it('cancela exclusão e visibilidade sem gravar, preservando seleção e devolvendo foco', async () => {
    const { user } = await showList();
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Arthur' }));
    const deleteButton = within(selectionBar()).getByRole('button', {
      name: 'Excluir',
    });
    await user.click(deleteButton);
    expect(screen.getByRole('dialog')).toHaveTextContent('Arthur');
    expect(screen.getByRole('dialog')).toHaveTextContent('publicação atual');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(deleteButton).toHaveFocus();
    await user.click(within(selectionBar()).getByRole('button', { name: 'Alterar visibilidade' }));
    expect(screen.getByRole('button', { name: 'Confirmar visibilidade' })).toBeDisabled();
    await user.selectOptions(screen.getByLabelText('Nova visibilidade'), 'private');
    await user.keyboard('{Escape}');
    expect(service.updateLoreEntity).not.toHaveBeenCalled();
    expect(service.deleteLoreEntity).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: 'Selecionar Arthur' })).toBeChecked();
  });

  it.each(['private', 'public'])(
    'aplica visibilidade %s após confirmar e atualiza o livro',
    async (visibility) => {
      const changed = vi.fn();
      const { user } = await showList({ onEntitiesChanged: changed });
      await user.click(
        screen.getByRole('checkbox', { name: 'Selecionar todas as entidades exibidas' }),
      );
      await user.click(
        within(selectionBar()).getByRole('button', { name: 'Alterar visibilidade' }),
      );
      expect(screen.getByLabelText('Nova visibilidade')).toHaveValue('');
      await user.selectOptions(screen.getByLabelText('Nova visibilidade'), visibility);
      if (visibility === 'public')
        expect(screen.getByRole('dialog')).toHaveTextContent('não publica automaticamente');
      else expect(screen.getByRole('dialog')).toHaveTextContent('publicação atual');
      expect(service.updateLoreEntity).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Confirmar visibilidade' }));
      await screen.findByText('2 de 2 entidades atualizadas.');
      expect(service.updateLoreEntity).toHaveBeenCalledWith('book', 'arthur', {
        isPublic: visibility === 'public',
      });
      expect(service.updateLoreEntity).toHaveBeenCalledWith('book', 'camelot', {
        isPublic: visibility === 'public',
      });
      expect(screen.getAllByText(visibility === 'public' ? 'Público' : 'Privado')).toHaveLength(2);
      expect(changed).toHaveBeenCalledOnce();
      await waitFor(() =>
        expect(
          screen.getByRole('checkbox', { name: 'Selecionar todas as entidades exibidas' }),
        ).toHaveFocus(),
      );
      expect(screen.queryByRole('region', { name: 'Ações da seleção' })).not.toBeInTheDocument();
    },
  );

  it('exclui a seleção somente após confirmar e mantém foco quando a lista fica vazia', async () => {
    const { user } = await showList();
    await user.click(
      screen.getByRole('checkbox', { name: 'Selecionar todas as entidades exibidas' }),
    );
    await user.click(within(selectionBar()).getByRole('button', { name: 'Excluir' }));
    expect(service.deleteLoreEntity).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    await screen.findByText('2 de 2 entidades excluídas.');
    expect(service.deleteLoreEntity).toHaveBeenCalledTimes(2);
    expect(screen.getByText('Nenhuma entidade cadastrada')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Visualização em lista' })).toHaveFocus(),
    );
  });

  it.each(['delete', 'visibility'])(
    'mantém só as falhas selecionadas em %s e permite tentar novamente',
    async (action) => {
      const mutation = action === 'delete' ? service.deleteLoreEntity : service.updateLoreEntity;
      vi.mocked(mutation)
        .mockResolvedValueOnce()
        .mockRejectedValueOnce(new Error('Sem conexão'))
        .mockResolvedValue();
      const { user } = await showList();
      await user.click(
        screen.getByRole('checkbox', { name: 'Selecionar todas as entidades exibidas' }),
      );
      const open = async () => {
        await user.click(
          within(selectionBar()).getByRole('button', {
            name: action === 'delete' ? 'Excluir' : 'Alterar visibilidade',
          }),
        );
        if (action !== 'delete')
          await user.selectOptions(screen.getByLabelText('Nova visibilidade'), 'private');
        await user.click(
          screen.getByRole('button', {
            name: action === 'delete' ? 'Confirmar exclusão' : 'Confirmar visibilidade',
          }),
        );
      };
      await open();
      expect(await screen.findByText(/1 de 2 entidades/)).toHaveTextContent('Camelot: Sem conexão');
      expect(selectionBar()).toHaveTextContent('1 selecionada');
      expect(screen.getByRole('checkbox', { name: 'Selecionar Camelot' })).toBeChecked();
      await open();
      await screen.findByText(
        action === 'delete' ? '1 de 1 entidade excluída.' : '1 de 1 entidade atualizada.',
      );
      expect(mutation).toHaveBeenCalledTimes(3);
      expect(screen.queryByRole('region', { name: 'Ações da seleção' })).not.toBeInTheDocument();
    },
  );

  it('mantém modal e bloqueia envios duplicados durante a execução', async () => {
    let finish!: () => void;
    vi.mocked(service.updateLoreEntity).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    const busy = vi.fn();
    const { user } = await showList({ onBusyChange: busy });
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Arthur' }));
    await user.click(within(selectionBar()).getByRole('button', { name: 'Alterar visibilidade' }));
    await user.selectOptions(screen.getByLabelText('Nova visibilidade'), 'private');
    await user.click(screen.getByRole('button', { name: 'Confirmar visibilidade' }));
    expect(screen.getByRole('button', { name: 'Aplicando...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(screen.getByText('Aplicando 0 de 1…')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Aplicando...' }));
    expect(service.updateLoreEntity).toHaveBeenCalledOnce();
    act(() => {
      finish();
    });
    await screen.findByText('1 de 1 entidade atualizada.');
    expect(busy.mock.calls).toEqual([[true], [false]]);
  });

  it('reconcilia entidades removidas por sincronização e confirma o alcance global', async () => {
    const scope = { kind: 'universe' as const, id: 'world' };
    const globalEntities = entities.map((entity) => ({
      ...entity,
      bookId: undefined,
      id: `universe:world:${entity.id}`,
      universeId: 'world',
    }));
    let publish!: (next: LoreEntity[]) => void;
    vi.spyOn(service, 'subscribeLoreEntities').mockImplementation((_scope, changed) => {
      publish = changed;
      changed(globalEntities);
      return vi.fn();
    });
    const { user } = await showList({ scope });
    await user.click(
      screen.getByRole('checkbox', { name: 'Selecionar todas as entidades exibidas' }),
    );
    act(() => publish([globalEntities[0]!]));
    expect(selectionBar()).toHaveTextContent('1 selecionada');
    await user.click(within(selectionBar()).getByRole('button', { name: 'Excluir' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('todos os livros deste universo');
    expect(screen.getByRole('dialog')).toHaveTextContent('publicações dos livros');
    await user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    await screen.findByText('1 de 1 entidade excluída.');
    expect(service.deleteLoreEntity).toHaveBeenCalledWith(scope, 'universe:world:arthur');
  });

  it('limpa seleção na troca de escopo/livro e mantém controles em portal opcional', async () => {
    vi.spyOn(service, 'subscribeLoreEntities').mockImplementation((_scope, changed) => {
      changed([]);
      return vi.fn();
    });
    const slot = document.createElement('div');
    document.body.append(slot);
    const { user, rerender, unmount } = renderWithProviders(
      <LoreTab book={{ ...book, universeId: 'world' }} actionsContainer={slot} />,
    );
    await screen.findByText('Arthur');
    expect(within(slot).getByRole('button', { name: 'Nova Entidade' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Visualização em lista' }));
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Arthur' }));
    await user.selectOptions(screen.getByLabelText('Escopo do compêndio'), 'global');
    expect(screen.queryByRole('region', { name: 'Ações da seleção' })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Escopo do compêndio'), 'local');
    await screen.findByText('Arthur');
    await user.click(screen.getByRole('button', { name: 'Visualização em lista' }));
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Arthur' }));
    rerender(<LoreTab book={{ ...book, id: 'other' }} actionsContainer={slot} />);
    expect(screen.queryByRole('region', { name: 'Ações da seleção' })).not.toBeInTheDocument();
    unmount();
    expect(slot).toBeEmptyDOMElement();
    slot.remove();
  });
});
