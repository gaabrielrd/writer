import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorLoreSidebar } from '../components/EditorLoreSidebar';
import type { LoreEntity, BookLoreAuthoringProps } from '@/features/lore';
import * as loreAPI from '@/features/lore';
import { Button, Dialog } from '@/shared/ui';
import { chooseDropdown } from '@/test/dropdown';

describe('EditorLoreSidebar', () => {
  const mockEntities: LoreEntity[] = [
    {
      id: 'e-1',
      bookId: 'b-1',
      name: 'Merlin',
      aliases: ['O Mago'],
      category: 'character',
      summary: 'Arquimago da corte',
      details: 'Grande conhecedor dos segredos antigos',
      relations: [],
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'e-2',
      bookId: 'b-1',
      name: 'Avalon',
      aliases: ['Ilha Sagrada'],
      category: 'location',
      summary: 'Ilha envolta em brumas',
      details: 'Santuário lendário',
      relations: [],
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];

  const native = vi.fn<(props: BookLoreAuthoringProps) => void>();
  beforeEach(() => {
    vi.restoreAllMocks();
    native.mockClear();
    vi.spyOn(loreAPI, 'BookLoreAuthoring').mockImplementation((props) => {
      native(props);
      return (
        <Dialog
          open
          title={'Fluxo protegido ' + props.target.kind}
          onClose={() => props.onClose(props.target)}
          footer={<Button onClick={() => props.onClose(props.target)}>Fechar fluxo</Button>}
        >
          <Button onClick={() => props.onConfirmed?.()}>Confirmar no fluxo protegido</Button>
        </Dialog>
      );
    });
    vi.spyOn(loreAPI, 'BookLoreInlineDetails').mockImplementation(({ loreId }) => {
      const entity = mockEntities.find((e) => e.id === loreId);
      return (
        <section aria-label={'Ficha completa de ' + (entity?.name ?? loreId)}>
          {entity?.details}
        </section>
      );
    });
  });

  it('renderiza entidades, filtra por busca e por categoria', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCreateEntity = vi.fn().mockResolvedValue(undefined);
    const onUpdateEntity = vi.fn().mockResolvedValue(undefined);

    render(
      <EditorLoreSidebar
        bookId="b-1"
        isOpen={true}
        entities={mockEntities}
        onClose={onClose}
        onCreateEntity={onCreateEntity}
        onUpdateEntity={onUpdateEntity}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Compêndio' })).toBeInTheDocument();
    expect(screen.getByText('Merlin')).toBeInTheDocument();
    expect(screen.getByText('Avalon')).toBeInTheDocument();

    // Filtros por categoria
    await user.click(screen.getByRole('button', { name: 'Personagens' }));
    expect(screen.getByText('Merlin')).toBeInTheDocument();
    expect(screen.queryByText('Avalon')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Locais' }));
    expect(screen.getByText('Avalon')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Conceitos' }));
    expect(screen.getByText('Nenhuma entidade encontrada.')).toBeInTheDocument();

    // Resetar filtro
    await user.click(screen.getByRole('button', { name: 'Todos' }));
    expect(screen.getByText('Avalon')).toBeInTheDocument();

    // Busca por termo
    await user.type(screen.getByLabelText(/buscar no compêndio/i), 'Brumas');
    expect(screen.queryByText('Merlin')).not.toBeInTheDocument();
    expect(screen.getByText('Avalon')).toBeInTheDocument();

    // Fechar sidebar
    await user.click(screen.getByLabelText('Fechar painel de lore'));
    expect(onClose).toHaveBeenCalled();
  });

  it('encaminha criação local ao host protegido sem callback legado', async () => {
    const user = userEvent.setup(),
      legacy = vi.fn(),
      confirmed = vi.fn();
    render(
      <EditorLoreSidebar
        bookId="b-1"
        isOpen
        entities={mockEntities}
        onClose={vi.fn()}
        onCreateEntity={legacy}
        onUpdateEntity={vi.fn()}
        onNativeConfirmed={confirmed}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Nova Entidade' }));
    expect(native.mock.calls.at(-1)![0]).toMatchObject({
      bookId: 'b-1',
      target: { kind: 'create' },
    });
    await user.click(screen.getByRole('button', { name: 'Confirmar no fluxo protegido' }));
    expect(confirmed).toHaveBeenCalledOnce();
    expect(legacy).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Fechar fluxo' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('encaminha edição e leitura locais por ID sem usar o escritor legado', async () => {
    const user = userEvent.setup(),
      legacy = vi.fn();
    render(
      <EditorLoreSidebar
        bookId="b-1"
        isOpen
        entities={mockEntities}
        onClose={vi.fn()}
        onCreateEntity={vi.fn()}
        onUpdateEntity={legacy}
      />,
    );
    await user.click(screen.getAllByRole('button', { name: 'Editar' })[0]!);
    expect(native.mock.calls.at(-1)![0]).toMatchObject({
      bookId: 'b-1',
      target: { kind: 'edit', loreId: 'e-1' },
    });
    await user.click(screen.getByRole('button', { name: 'Confirmar no fluxo protegido' }));
    expect(legacy).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Fechar fluxo' }));
    await user.click(screen.getAllByRole('button', { name: 'Ver Ficha' })[0]!);
    expect(native.mock.calls.at(-1)![0]).toMatchObject({ target: { kind: 'read', loreId: 'e-1' } });
  });

  it('exibe ficha completa do termo selecionado mesmo com filtro ativo', async () => {
    const user = userEvent.setup();
    const props = {
      isOpen: true,
      entities: mockEntities,
      onClose: vi.fn(),
      onCreateEntity: vi.fn(),
      onUpdateEntity: vi.fn(),
    };
    const { rerender } = render(<EditorLoreSidebar bookId="b-1" {...props} />);
    await user.click(screen.getByRole('button', { name: 'Locais' }));
    rerender(<EditorLoreSidebar bookId="b-1" {...props} selectedEntityId="e-1" />);
    expect(screen.getByRole('region', { name: 'Ficha completa de Merlin' })).toHaveTextContent(
      'Grande conhecedor dos segredos antigos',
    );
  });

  it('abre criação com nome da menção e encerra solicitação ao cancelar', async () => {
    const user = userEvent.setup();
    const handled = vi.fn();
    render(
      <EditorLoreSidebar
        bookId="b-1"
        isOpen
        entities={mockEntities}
        createEntityName="Galahad"
        onCreateRequestHandled={handled}
        onClose={vi.fn()}
        onCreateEntity={vi.fn()}
        onUpdateEntity={vi.fn()}
      />,
    );
    expect(native.mock.calls.at(-1)![0]).toMatchObject({
      target: { kind: 'create', initialName: 'Galahad' },
    });
    await user.click(screen.getByRole('button', { name: 'Fechar fluxo' }));
    expect(handled).toHaveBeenCalledExactlyOnceWith('Galahad');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('retorna null quando isOpen e falso', () => {
    const { container } = render(
      <EditorLoreSidebar
        bookId="b-1"
        isOpen={false}
        entities={mockEntities}
        onClose={vi.fn()}
        onCreateEntity={vi.fn()}
        onUpdateEntity={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('preserva o formulário e os callbacks do universo, sem abrir o escritor do livro', async () => {
    const user = userEvent.setup(),
      create = vi.fn().mockResolvedValue(undefined),
      update = vi.fn().mockResolvedValue(undefined),
      globalEntity: LoreEntity = {
        ...mockEntities[0]!,
        id: 'global-1',
        universeId: 'u-1',
        bookId: undefined,
        adventureId: undefined,
      };
    const input = { name: 'Nome global', category: 'character' as const, summary: 'Resumo global' };
    vi.spyOn(loreAPI, 'LoreEntityForm').mockImplementation((props) =>
      props.open ? (
        <Dialog
          open
          title="Formulário do universo"
          onClose={props.onClose}
          footer={<Button onClick={props.onClose}>Fechar universo</Button>}
        >
          <Button onClick={() => void props.onSubmit(input)}>Confirmar no universo</Button>
        </Dialog>
      ) : null,
    );
    render(
      <EditorLoreSidebar
        bookId="b-1"
        isOpen
        universeId="u-1"
        entities={[...mockEntities, globalEntity]}
        onClose={vi.fn()}
        onCreateEntity={create}
        onUpdateEntity={update}
      />,
    );
    await chooseDropdown(
      user,
      screen.getByRole('combobox', { name: 'Escopo do lore' }),
      'Lore global — universo compartilhado',
    );
    await user.click(screen.getByRole('button', { name: 'Nova Entidade' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar no universo' }));
    expect(create).toHaveBeenCalledExactlyOnceWith(input, 'global');
    await user.click(screen.getByRole('button', { name: 'Fechar universo' }));
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar no universo' }));
    expect(update).toHaveBeenCalledExactlyOnceWith('global-1', input);
    expect(native).not.toHaveBeenCalled();
  });
  it('não abre outro escritor durante uma operação e oferece retomadas ao liberar', async () => {
    const user = userEvent.setup(),
      props = {
        bookId: 'b-1',
        isOpen: true,
        entities: mockEntities,
        onClose: vi.fn(),
        onCreateEntity: vi.fn(),
        onUpdateEntity: vi.fn(),
      };
    const { rerender } = render(<EditorLoreSidebar {...props} disabled />);
    expect(screen.getByRole('button', { name: 'Nova Entidade' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Retomadas do compêndio' })).toBeDisabled();
    expect(screen.getAllByRole('button', { name: 'Editar' })[0]).toBeDisabled();
    expect(native).not.toHaveBeenCalled();
    rerender(<EditorLoreSidebar {...props} />);
    await user.click(screen.getByRole('button', { name: 'Retomadas do compêndio' }));
    expect(native.mock.calls.at(-1)![0]).toMatchObject({
      bookId: 'b-1',
      target: { kind: 'recoveries' },
    });
    await user.click(screen.getByRole('button', { name: 'Fechar fluxo' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('preserva escopo local/global e a ação de atualizar no topo compacto', async () => {
    const user = userEvent.setup();
    const analyze = vi.fn();
    const globalEntity: LoreEntity = {
      ...mockEntities[1]!,
      id: 'global-place',
      name: 'Ilha global',
      universeId: 'universe-1',
      bookId: undefined,
      adventureId: undefined,
    };
    render(
      <EditorLoreSidebar
        bookId="b-1"
        isOpen
        universeId="universe-1"
        entities={[...mockEntities, globalEntity]}
        onClose={vi.fn()}
        onCreateEntity={vi.fn()}
        onUpdateEntity={vi.fn()}
        onAnalyzeText={analyze}
      />,
    );
    expect(screen.getByText('Merlin')).toBeInTheDocument();
    expect(screen.queryByText('Ilha global')).not.toBeInTheDocument();
    await chooseDropdown(
      user,
      screen.getByRole('combobox', { name: 'Escopo do lore' }),
      'Lore global — universo compartilhado',
    );
    expect(screen.getByText('Ilha global')).toBeInTheDocument();
    expect(screen.queryByText('Merlin')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Atualizar compêndio com base no texto' }));
    expect(analyze).toHaveBeenCalledOnce();
    await chooseDropdown(
      user,
      screen.getByRole('combobox', { name: 'Escopo do lore' }),
      'Lore local — somente este livro',
    );
    expect(screen.getByText('Merlin')).toBeInTheDocument();
  });
});
