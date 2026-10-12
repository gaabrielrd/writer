import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BookDraftPreview } from '../components/BookDraftPreview';

describe('BookDraftPreview', () => {
  it('shows placeholders and reflects the current draft without creating a book', () => {
    const props = { title: '', genre: '', synopsis: '', coverUrl: '' };
    const view = render(<BookDraftPreview {...props} />);
    const preview = within(screen.getByLabelText('Prévia do livro'));
    expect(preview.getByText('Título da sua obra')).toBeInTheDocument();
    expect(preview.getByText('Gênero literário')).toBeInTheDocument();
    expect(preview.getByText('Sem capa')).toBeInTheDocument();
    view.rerender(
      <BookDraftPreview {...props} title=" Atlas " genre=" Fantasia " synopsis=" Uma viagem. " />,
    );
    expect(preview.getByText('Atlas')).toHaveAttribute('title', 'Atlas');
    expect(preview.getByText('Fantasia')).toBeInTheDocument();
    expect(preview.getByText('Uma viagem.')).toBeInTheDocument();
    expect(preview.queryByText('Título da sua obra')).not.toBeInTheDocument();
  });

  it('updates and removes the selected cover, with a fallback for failed images', () => {
    const props = {
      title: 'Atlas',
      genre: '',
      synopsis: '',
      coverUrl: 'https://example.test/a.png',
    };
    const view = render(<BookDraftPreview {...props} />);
    expect(screen.getByAltText('Prévia da capa de Atlas')).toHaveAttribute('src', props.coverUrl);
    fireEvent.error(screen.getByAltText('Prévia da capa de Atlas'));
    expect(screen.getByText('Sem capa')).toBeInTheDocument();
    view.rerender(<BookDraftPreview {...props} coverUrl="https://example.test/b.png" />);
    expect(screen.getByAltText('Prévia da capa de Atlas')).toHaveAttribute(
      'src',
      'https://example.test/b.png',
    );
    view.rerender(<BookDraftPreview {...props} coverUrl="" />);
    expect(screen.queryByAltText('Prévia da capa de Atlas')).not.toBeInTheDocument();
    expect(screen.getByText('Sem capa')).toBeInTheDocument();
  });

  it.each(['invalid', 'javascript:alert(1)'])(
    'keeps incomplete or unsupported URLs out of the image: %s',
    (coverUrl) => {
      render(<BookDraftPreview title="" genre="" synopsis="" coverUrl={coverUrl} />);
      expect(screen.queryByAltText('Prévia da capa de seu livro')).not.toBeInTheDocument();
      expect(screen.getByText('Sem capa')).toBeInTheDocument();
    },
  );
});
