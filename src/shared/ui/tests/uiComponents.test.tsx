import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  Button,
  Input,
  Textarea,
  Select,
  Badge,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Dialog,
  Alert,
  LoadingState,
  EmptyState,
  ErrorState,
  PageHeader,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  StyleguidePage,
} from '../index';
import { ThemeProvider } from '@/shared/theme';

describe('UI Design System Components', () => {
  it('renderiza Button com variantes e lida com clique', () => {
    const handleClick = vi.fn();
    render(
      <Button variant="primary" size="lg" onClick={handleClick}>
        Salvar
      </Button>,
    );

    const btn = screen.getByRole('button', { name: 'Salvar' });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renderiza Input com label, hint e mensagem de erro', () => {
    const { rerender } = render(<Input label="Título" hint="Preencha o título" />);
    expect(screen.getByLabelText('Título')).toBeInTheDocument();
    expect(screen.getByText('Preencha o título')).toBeInTheDocument();

    rerender(<Input label="Título" error="Campo obrigatório" />);
    expect(screen.getByText('Campo obrigatório')).toBeInTheDocument();
  });

  it('renderiza Textarea com label e erro', () => {
    render(<Textarea label="Descrição" error="Muito curto" />);
    expect(screen.getByLabelText('Descrição')).toBeInTheDocument();
    expect(screen.getByText('Muito curto')).toBeInTheDocument();
  });

  it('renderiza Select com opções e dispara evento onChange', () => {
    const handleChange = vi.fn();
    render(
      <Select
        label="Categoria"
        options={[
          { value: 'cat1', label: 'Categoria 1' },
          { value: 'cat2', label: 'Categoria 2' },
        ]}
        onChange={handleChange}
      />,
    );

    const select = screen.getByLabelText('Categoria');
    expect(select).toBeInTheDocument();
    fireEvent.change(select, { target: { value: 'cat2' } });
    expect(handleChange).toHaveBeenCalled();
  });

  it('renderiza Badge com diferentes variantes', () => {
    render(<Badge variant="accent">Destaque</Badge>);
    expect(screen.getByText('Destaque')).toBeInTheDocument();
  });

  it('renderiza Card com header, content e footer', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Título do Card</CardTitle>
          <CardDescription>Descrição do Card</CardDescription>
        </CardHeader>
        <CardContent>Conteúdo</CardContent>
        <CardFooter>Rodapé</CardFooter>
      </Card>,
    );

    expect(screen.getByText('Título do Card')).toBeInTheDocument();
    expect(screen.getByText('Descrição do Card')).toBeInTheDocument();
    expect(screen.getByText('Conteúdo')).toBeInTheDocument();
    expect(screen.getByText('Rodapé')).toBeInTheDocument();
  });

  it('renderiza Dialog e dispara onClose ao fechar', () => {
    const handleClose = vi.fn();
    render(
      <Dialog
        open={true}
        title="Modal de Teste"
        description="Descrição do modal"
        onClose={handleClose}
      >
        <p>Corpo do diálogo</p>
      </Dialog>,
    );

    expect(screen.getByText('Modal de Teste')).toBeInTheDocument();
    expect(screen.getByText('Corpo do diálogo')).toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: 'Fechar' });
    fireEvent.click(closeBtn);
    expect(handleClose).toHaveBeenCalled();
  });

  it('renderiza Alert em todas as variantes', () => {
    render(
      <div>
        <Alert variant="info" title="Info">
          Texto info
        </Alert>
        <Alert variant="success">Texto sucesso</Alert>
        <Alert variant="warning">Texto warning</Alert>
        <Alert variant="destructive">Texto erro</Alert>
      </div>,
    );

    expect(screen.getByText('Info')).toBeInTheDocument();
    expect(screen.getByText('Texto info')).toBeInTheDocument();
    expect(screen.getByText('Texto sucesso')).toBeInTheDocument();
    expect(screen.getByText('Texto warning')).toBeInTheDocument();
    expect(screen.getByText('Texto erro')).toBeInTheDocument();
  });

  it('renderiza LoadingState, EmptyState e ErrorState', () => {
    const handleRetry = vi.fn();
    render(
      <div>
        <LoadingState label="Carregando dados..." />
        <EmptyState title="Vazio" description="Sem itens" action={<button>Adicionar</button>} />
        <ErrorState title="Erro" message="Falha na rede" onRetry={handleRetry} />
      </div>,
    );

    expect(screen.getByText('Carregando dados...')).toBeInTheDocument();
    expect(screen.getByText('Vazio')).toBeInTheDocument();
    expect(screen.getByText('Sem itens')).toBeInTheDocument();
    expect(screen.getByText('Erro')).toBeInTheDocument();
    expect(screen.getByText('Falha na rede')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(handleRetry).toHaveBeenCalled();
  });

  it('renderiza PageHeader e Table', () => {
    render(
      <div>
        <PageHeader
          title="Página de Obras"
          description="Gerencie suas histórias"
          actions={<button>Nova Obra</button>}
        />
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell>Capítulo 1</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>,
    );

    expect(screen.getByText('Página de Obras')).toBeInTheDocument();
    expect(screen.getByText('Gerencie suas histórias')).toBeInTheDocument();
    expect(screen.getByText('Nova Obra')).toBeInTheDocument();
    expect(screen.getByText('Nome')).toBeInTheDocument();
    expect(screen.getByText('Capítulo 1')).toBeInTheDocument();
  });

  it('renderiza StyleguidePage com catalogo completo e lida com interações', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <StyleguidePage />
      </ThemeProvider>,
    );

    expect(screen.getByText(/Catálogo do Design System & Temas/i)).toBeInTheDocument();
    expect(screen.getByText(/Paletas e Temas Ativos/i)).toBeInTheDocument();
    expect(screen.getByText(/Botões \(Button\)/i)).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Ex: As Crônicas de Aethelgard/i);
    fireEvent.change(input, { target: { value: 'Minha Obra Épica' } });
    expect(input).toHaveValue('Minha Obra Épica');

    const openModalBtn = screen.getByRole('button', {
      name: /Abrir Modal de Demonstração/i,
    });
    fireEvent.click(openModalBtn);
    expect(screen.getByText(/Modal do Design System/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: 'Confirmar' });
    fireEvent.click(confirmBtn);
  });
});
