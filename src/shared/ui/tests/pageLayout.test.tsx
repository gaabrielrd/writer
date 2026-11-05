import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { Button } from '../Button';
import { FilterChips } from '../FilterChips';
import { ObjectHeader } from '../ObjectHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../Tabs';
import { Toolbar } from '../Toolbar';

function Sections({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState('chapters');
  return (
    <Tabs
      value={value}
      onValueChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    >
      <TabsList aria-label="Seções do livro" actions={<Button size="sm">Novo capítulo</Button>}>
        <TabsTrigger value="chapters" count={6}>
          Capítulos
        </TabsTrigger>
        <TabsTrigger value="scenes">Cenas</TabsTrigger>
        <TabsTrigger value="lore">Compêndio</TabsTrigger>
      </TabsList>
      <TabsContent value="chapters">Lista de capítulos</TabsContent>
      <TabsContent value="scenes">Lista de cenas</TabsContent>
      <TabsContent value="lore">Fichas</TabsContent>
    </Tabs>
  );
}

it('troca de seção por clique e teclado e mantém as ações fora do tablist', async () => {
  const user = userEvent.setup();
  const onChange = vi.fn();
  render(<Sections onChange={onChange} />);
  const list = screen.getByRole('tablist', { name: 'Seções do livro' });
  expect(within(list).queryByRole('button', { name: 'Novo capítulo' })).not.toBeInTheDocument();
  expect(
    within(screen.getByRole('group', { name: 'Ações de Seções do livro' })).getByRole('button'),
  ).toHaveAccessibleName('Novo capítulo');
  expect(screen.getByRole('tab', { name: 'Capítulos 6' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tabpanel', { name: 'Capítulos 6' })).toHaveTextContent(
    'Lista de capítulos',
  );

  await user.click(screen.getByRole('tab', { name: 'Cenas' }));
  expect(onChange).toHaveBeenLastCalledWith('scenes');
  expect(screen.getByRole('tabpanel', { name: 'Cenas' })).toHaveTextContent('Lista de cenas');

  await user.keyboard('{ArrowRight}');
  expect(screen.getByRole('tab', { name: 'Compêndio' })).toHaveFocus();
  expect(screen.getByRole('tab', { name: 'Compêndio' })).toHaveAttribute('aria-selected', 'true');
  await user.keyboard('{Home}');
  expect(screen.getByRole('tab', { name: 'Capítulos 6' })).toHaveAttribute('aria-selected', 'true');
  await user.keyboard('{End}');
  expect(screen.getByRole('tabpanel', { name: 'Compêndio' })).toHaveTextContent('Fichas');
});

it('filtra com escolha única anunciada por aria-pressed', async () => {
  const user = userEvent.setup();
  function Filters() {
    const [value, setValue] = useState<'all' | 'draft' | 'done'>('all');
    return (
      <FilterChips
        label="Estado do capítulo"
        value={value}
        onValueChange={setValue}
        options={[
          { value: 'all', label: 'Todos', count: 6 },
          { value: 'draft', label: 'Rascunho', count: 4 },
          { value: 'done', label: 'Revisado', count: 2 },
        ]}
      />
    );
  }
  render(<Filters />);
  const group = screen.getByRole('group', { name: 'Estado do capítulo' });
  const all = within(group).getByRole('button', { name: 'Todos 6' });
  const draft = within(group).getByRole('button', { name: 'Rascunho 4' });
  expect(all).toHaveAttribute('aria-pressed', 'true');
  expect(draft).toHaveAttribute('aria-pressed', 'false');
  await user.click(draft);
  expect(draft).toHaveAttribute('aria-pressed', 'true');
  expect(all).toHaveAttribute('aria-pressed', 'false');
  await user.tab();
  await user.keyboard('{Enter}');
  expect(within(group).getByRole('button', { name: 'Revisado 2' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

it('não repete a notificação ao escolher o filtro já ativo', async () => {
  const user = userEvent.setup();
  const onValueChange = vi.fn();
  render(
    <FilterChips
      label="Categoria"
      value="all"
      onValueChange={onValueChange}
      options={[
        { value: 'all', label: 'Todas' },
        { value: 'people', label: 'Personagens' },
      ]}
    />,
  );
  await user.click(screen.getByRole('button', { name: 'Todas' }));
  expect(onValueChange).not.toHaveBeenCalled();
});

it('organiza busca, filtros, resumo e ações em uma barra nomeada', () => {
  render(
    <Toolbar
      label="Ferramentas de capítulos"
      search={<input aria-label="Buscar capítulo" />}
      filters={<button type="button">Ato I</button>}
      summary="6 capítulos · 18.420 palavras"
      actions={<Button size="sm">Novo capítulo</Button>}
    />,
  );
  const toolbar = screen.getByRole('group', { name: 'Ferramentas de capítulos' });
  expect(within(toolbar).getByRole('textbox', { name: 'Buscar capítulo' })).toBeVisible();
  expect(within(toolbar).getByText('6 capítulos · 18.420 palavras')).toBeVisible();
  expect(within(toolbar).getByRole('button', { name: 'Novo capítulo' })).toBeVisible();
});

it('exibe o objeto com título de página e agrupa ações principal, secundárias e menu', () => {
  render(
    <ObjectHeader
      kind="Livro · Fantasia literária"
      title="O Atlas das Marés Esquecidas"
      media={<img alt="Capa de O Atlas das Marés Esquecidas" src="data:," />}
      meta={<span>18.420 palavras</span>}
      description="Uma cartógrafa encontra um mapa que muda a cada amanhecer."
      secondaryActions={<Button variant="outline">Ler</Button>}
      menu={<Button variant="outline" aria-label="Opções do livro" />}
      primaryAction={<Button>Continuar escrevendo</Button>}
    />,
  );
  expect(
    screen.getByRole('heading', { level: 1, name: 'O Atlas das Marés Esquecidas' }),
  ).toBeVisible();
  expect(screen.getByText('Livro · Fantasia literária')).toBeVisible();
  expect(screen.getByRole('img', { name: 'Capa de O Atlas das Marés Esquecidas' })).toBeVisible();
  const actions = within(
    screen.getByRole('group', { name: 'Ações de O Atlas das Marés Esquecidas' }),
  ).getAllByRole('button');
  expect(actions.map((button) => button.getAttribute('aria-label') ?? button.textContent)).toEqual([
    'Ler',
    'Opções do livro',
    'Continuar escrevendo',
  ]);
});

it('omite o grupo de ações quando o objeto não oferece nenhuma', () => {
  render(<ObjectHeader title="Universo das Marés" />);
  expect(screen.getByRole('heading', { level: 1, name: 'Universo das Marés' })).toBeVisible();
  expect(screen.queryByRole('group')).not.toBeInTheDocument();
});

it('usa título de nível 2 quando incorporado em outra página', () => {
  render(<ObjectHeader title="Exemplo incorporado" headingLevel={2} />);
  expect(screen.getByRole('heading', { level: 2, name: 'Exemplo incorporado' })).toBeVisible();
  expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
});
