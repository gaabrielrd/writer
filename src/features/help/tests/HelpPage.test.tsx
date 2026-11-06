import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { describe, expect, it } from 'vitest';
import { HelpPage } from '../components/HelpPage';

function LocationControls() {
  const { search } = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <p aria-label="Endereço">{search}</p>
      <button onClick={() => void navigate(-1)}>Voltar no navegador</button>
    </>
  );
}

function renderHelp(path = '/help') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <HelpPage />
      <LocationControls />
    </MemoryRouter>,
  );
}

describe('Central de ajuda', () => {
  it('oferece caminhos equilibrados e artigos sem depender de login ou chamadas externas', () => {
    renderHelp();
    expect(screen.getByRole('heading', { level: 1, name: 'Central de ajuda' })).toBeVisible();
    for (const name of ['Escrever um livro', 'Preparar uma aventura', 'Organizar uma campanha']) {
      expect(screen.getByRole('link', { name })).toHaveAttribute(
        'href',
        expect.stringContaining('/help?article='),
      );
    }
    expect(screen.getByRole('navigation', { name: 'Assuntos da ajuda' })).toBeVisible();
  });

  it('busca em todos os assuntos mesmo ao sair de uma categoria ou artigo', async () => {
    const user = userEvent.setup();
    renderHelp('/help?topic=books');
    await user.type(screen.getByRole('searchbox', { name: 'Buscar na ajuda' }), 'selo partido');
    expect(
      screen.getByRole('link', { name: /Acompanhar pistas, missões e pendências/ }),
    ).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('1 artigo encontrado');
    expect(screen.getByLabelText('Endereço')).toHaveTextContent('q=selo+partido');
    expect(screen.getByLabelText('Endereço')).not.toHaveTextContent('topic=');
  });

  it('informa busca vazia e permite reiniciar', async () => {
    const user = userEvent.setup();
    renderHelp('/help?q=nenhum-termo-assim');
    expect(screen.getByText('Nenhum artigo encontrado')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(screen.getByRole('heading', { name: 'O que você quer fazer?' })).toBeVisible();
    expect(screen.getByRole('searchbox')).toHaveValue('');
  });

  it('abre artigo por URL, comunica assunto, orienta passos e oferece destino real', () => {
    renderHelp('/help?article=primeira-campanha');
    expect(
      screen.getByRole('heading', { level: 2, name: 'Quero organizar minha campanha' }),
    ).toHaveFocus();
    expect(within(screen.getByRole('article')).getAllByRole('list')[0]).toBeVisible();
    expect(screen.getByRole('link', { name: 'Criar uma campanha' })).toHaveAttribute(
      'href',
      '/studio/new?kind=campaign',
    );
    const topics = screen.getByRole('navigation', { name: 'Assuntos da ajuda' });
    expect(within(topics).getByRole('link', { name: 'Primeiros passos' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('navega entre leituras relacionadas e conserva o voltar do navegador', async () => {
    const user = userEvent.setup();
    renderHelp('/help?article=primeira-campanha');
    await user.click(
      screen.getByRole('link', { name: 'O que é a base congelada de uma campanha?' }),
    );
    expect(
      screen.getByRole('heading', { level: 2, name: 'O que é a base congelada de uma campanha?' }),
    ).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Voltar no navegador' }));
    expect(
      screen.getByRole('heading', { level: 2, name: 'Quero organizar minha campanha' }),
    ).toBeVisible();
  });

  it('filtra assunto por link acessível pelo teclado', async () => {
    const user = userEvent.setup();
    renderHelp();
    const nav = screen.getByRole('navigation', { name: 'Assuntos da ajuda' });
    const topic = within(nav).getByRole('link', { name: 'Imagens e capas' });
    topic.focus();
    await user.keyboard('{Enter}');
    expect(topic).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: /Gerenciar a Biblioteca de Imagens/ })).toBeVisible();
    expect(
      screen.queryByRole('link', { name: /Atos, capítulos, cenas e manuscrito/ }),
    ).not.toBeInTheDocument();
  });

  it('mostra orientação para um endereço de artigo inexistente', async () => {
    const user = userEvent.setup();
    renderHelp('/help?article=inexistente');
    expect(screen.getByText('Este artigo não foi encontrado')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Explorar a ajuda' }));
    expect(screen.getByRole('heading', { name: 'Guias e conceitos' })).toBeVisible();
  });

  it('permite recuperar busca no link e explica os limites de publicação', () => {
    renderHelp('/help?q=marketplace');
    expect(screen.getByRole('searchbox')).toHaveValue('marketplace');
    expect(screen.getByRole('link', { name: /O que significa Em breve/ })).toBeVisible();
  });
});
