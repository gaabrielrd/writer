import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Book } from '@/features/books';
import { EditorOptionsMenu } from '../components/EditorOptionsMenu';

vi.mock('../components/ExportDialog', () => ({
  ExportDialog: ({ currentContent, onClose }: { currentContent?: string; onClose: () => void }) => (
    <div role="dialog" aria-label="Exportação">
      <p>{currentContent}</p>
      <button onClick={onClose}>Fechar</button>
    </div>
  ),
}));
const book: Book = {
  id: 'b',
  authorId: 'u',
  title: 'Livro',
  genre: 'Fantasia',
  synopsis: '',
  coverUrl: null,
  status: 'draft',
  wordCount: 0,
  createdAt: 1,
  updatedAt: 1,
};

describe('opções do capítulo', () => {
  it('abre Persona depois de fechar o menu e restaurar o foco ao gatilho estável', async () => {
    const user = userEvent.setup();
    const triggerRef = createRef<HTMLButtonElement>();
    const onPersona = vi.fn(() => expect(document.activeElement).toBe(triggerRef.current));
    render(
      <EditorOptionsMenu
        book={book}
        disabled={false}
        triggerRef={triggerRef}
        onPersona={onPersona}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Opções do capítulo' }));
    await user.click(screen.getByRole('menuitem', { name: 'Persona' }));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(onPersona).toHaveBeenCalledOnce();
  });

  it('exporta a versão atual e permite reabrir o diálogo', async () => {
    const user = userEvent.setup();
    render(
      <EditorOptionsMenu
        book={book}
        currentContent="Versão em edição"
        disabled={false}
        triggerRef={createRef()}
        onPersona={vi.fn()}
      />,
    );
    const open = async () => {
      await user.click(screen.getByRole('button', { name: 'Opções do capítulo' }));
      await user.click(screen.getByRole('menuitem', { name: 'Exportar' }));
    };
    await open();
    expect(screen.getByRole('dialog')).toHaveTextContent('Versão em edição');
    await user.click(screen.getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await open();
    expect(screen.getByRole('dialog')).toHaveTextContent('Versão em edição');
  });

  it('bloqueia ações secundárias durante aplicação de IA e mantém o erro de persona acessível', () => {
    render(
      <EditorOptionsMenu
        book={book}
        disabled
        personaError="Persona indisponível"
        triggerRef={createRef()}
        onPersona={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: 'Opções do capítulo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Opções do capítulo' })).toHaveAttribute(
      'title',
      'Persona indisponível',
    );
  });
});
