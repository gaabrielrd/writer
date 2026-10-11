import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ChapterMinimap } from '../components/ChapterMinimap';
import type { MeasuredMinimapDestination } from '../hooks/useChapterMinimap';

const entries: MeasuredMinimapDestination[] = [
  {
    position: 1,
    blockPosition: 0,
    kind: 'heading',
    label: 'Título: Início',
    length: 6,
    level: 1,
    start: 0,
    end: 0.1,
  },
  {
    position: 9,
    blockPosition: 8,
    kind: 'paragraph',
    label: 'Parágrafo: Chegada',
    length: 150,
    level: 0,
    start: 0.4,
    end: 0.6,
  },
  {
    position: 12,
    blockPosition: 8,
    kind: 'entity',
    label: 'Lia — Lia',
    category: 'character',
    length: 3,
    level: 0,
    start: 0.42,
    end: 0.6,
  },
  {
    position: 180,
    blockPosition: 179,
    kind: 'heading',
    label: 'Título: Fim',
    length: 3,
    level: 2,
    start: 0.9,
    end: 1,
  },
];

function setup(destinations = entries) {
  const onNavigate = vi.fn();
  const result = render(
    <ChapterMinimap
      destinations={destinations}
      viewport={{ start: 0.4, end: 0.6 }}
      onNavigate={onNavigate}
    />,
  );
  const map = screen.getByRole('listbox', { name: 'Trechos do capítulo' });
  vi.spyOn(map, 'getBoundingClientRect').mockReturnValue({
    top: 0,
    bottom: 500,
    left: 0,
    right: 100,
    width: 100,
    height: 500,
  } as DOMRect);
  return { ...result, map, onNavigate };
}

describe('navegação no minimapa', () => {
  it('oferece destinos pelo teclado sem navegar antes do aceite', () => {
    const { map, onNavigate, rerender } = setup();
    fireEvent.keyDown(map, { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: 'Parágrafo: Chegada' })).toHaveAttribute(
      'aria-posinset',
      '2',
    );
    expect(onNavigate).not.toHaveBeenCalled();
    fireEvent.keyDown(map, { key: 'Enter' });
    expect(onNavigate).toHaveBeenLastCalledWith(0.4, 9);
    fireEvent.keyDown(map, { key: 'End' });
    fireEvent.keyDown(map, { key: 'ArrowDown' });
    fireEvent.keyDown(map, { key: ' ' });
    expect(onNavigate).toHaveBeenLastCalledWith(0.9, 180);
    fireEvent.keyDown(map, { key: 'Home' });
    fireEvent.keyDown(map, { key: 'ArrowUp' });
    fireEvent.keyDown(map, { key: 'Enter' });
    expect(onNavigate).toHaveBeenLastCalledWith(0, 1);
    fireEvent.keyDown(map, { key: 'End' });
    rerender(
      <ChapterMinimap
        destinations={entries.slice(0, 1)}
        viewport={{ start: 0, end: 1 }}
        onNavigate={onNavigate}
      />,
    );
    fireEvent.keyDown(map, { key: 'Enter' });
    expect(onNavigate).toHaveBeenLastCalledWith(0, 1);
  });

  it('navega por parágrafo, ocorrência e espaço livre, sem pular ao iniciar um gesto de toque', () => {
    const { map, onNavigate } = setup();
    fireEvent.pointerDown(map, { pointerType: 'touch', clientX: 90, clientY: 210 });
    expect(onNavigate).not.toHaveBeenCalled();
    fireEvent.click(map, { clientX: 20, clientY: 200 });
    expect(onNavigate).toHaveBeenLastCalledWith(0.4, 9);
    fireEvent.click(map, { clientX: 90, clientY: 210 });
    expect(onNavigate).toHaveBeenLastCalledWith(0.42, 12);
    fireEvent.click(map, { clientX: 20, clientY: 350 });
    expect(onNavigate).toHaveBeenLastCalledWith(0.7, undefined);
    fireEvent.pointerMove(map, { clientX: 90, clientY: 210 });
    fireEvent.pointerLeave(map, { clientX: 110, clientY: 210 });
  });

  it('informa capítulo vazio e mantém navegação inativa', () => {
    const { map, onNavigate } = setup([]);
    expect(screen.getByText('Capítulo vazio')).toBeInTheDocument();
    expect(map).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(map);
    fireEvent.keyDown(map, { key: 'Enter' });
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
