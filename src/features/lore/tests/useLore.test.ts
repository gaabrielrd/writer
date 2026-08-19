import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useLore } from '../hooks/useLore';
import * as loreService from '../services/loreService';
import type { LoreEntity } from '../model/loreEntity';

describe('useLore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('retorna array vazio quando bookId nao e informado', async () => {
    const { result } = renderHook(() => useLore(null));

    expect(result.current.loading).toBe(false);
    expect(result.current.entities).toEqual([]);

    await act(async () => {
      await result.current.refreshEntities();
    });

    await expect(
      result.current.createEntity({
        name: 'Sem livro',
        category: 'character',
        summary: 'Resumo',
      }),
    ).rejects.toThrow(/livro não selecionado/i);

    await act(async () => {
      await result.current.updateEntity('e-1', { name: 'Novo' });
      await result.current.deleteEntity('e-1');
    });
  });

  it('carrega entidades do livro com sucesso', async () => {
    const mockEntities: LoreEntity[] = [
      {
        id: 'e-1',
        bookId: 'b-1',
        name: 'Rei Arthur',
        aliases: ['Pendragon'],
        category: 'character',
        summary: 'Monarca lendário',
        details: '',
        relations: [],
        isPublic: true,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];

    vi.spyOn(loreService, 'listLoreEntities').mockResolvedValue(mockEntities);

    const { result } = renderHook(() => useLore('b-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.entities).toHaveLength(1);
    expect(result.current.entities[0]?.name).toBe('Rei Arthur');
  });

  it('captura erro ao carregar e permite retentativa', async () => {
    vi.spyOn(loreService, 'listLoreEntities').mockRejectedValueOnce(
      new Error('Erro de conexão Firestore'),
    );

    const { result } = renderHook(() => useLore('b-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe('Erro de conexão Firestore');

    vi.spyOn(loreService, 'listLoreEntities').mockResolvedValueOnce([]);

    await act(async () => {
      await result.current.refreshEntities();
    });

    expect(result.current.error).toBeNull();
    expect(result.current.entities).toEqual([]);
  });

  it('filtra entidades por categoria e termo de busca', async () => {
    const mockEntities: LoreEntity[] = [
      {
        id: 'e-1',
        bookId: 'b-1',
        name: 'Rei Arthur',
        aliases: ['Pendragon'],
        category: 'character',
        summary: 'Monarca britânico',
        details: '',
        relations: [],
        isPublic: true,
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: 'e-2',
        bookId: 'b-1',
        name: 'Camelot',
        aliases: ['Cidadela'],
        category: 'location',
        summary: 'A capital dourada',
        details: '',
        relations: [],
        isPublic: true,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];

    vi.spyOn(loreService, 'listLoreEntities').mockResolvedValue(mockEntities);

    const { result } = renderHook(() => useLore('b-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.filteredEntities).toHaveLength(2);

    // Filtro por categoria
    act(() => {
      result.current.setCategoryFilter('location');
    });
    expect(result.current.filteredEntities).toHaveLength(1);
    expect(result.current.filteredEntities[0]?.name).toBe('Camelot');

    // Filtro por busca
    act(() => {
      result.current.setCategoryFilter('all');
      result.current.setSearchQuery('pendragon');
    });
    expect(result.current.filteredEntities).toHaveLength(1);
    expect(result.current.filteredEntities[0]?.name).toBe('Rei Arthur');
  });

  it('permite criar, atualizar e excluir entidade', async () => {
    const newEntity: LoreEntity = {
      id: 'e-new',
      bookId: 'b-1',
      name: 'Merlin',
      aliases: ['O Mago'],
      category: 'character',
      summary: 'Feiticeiro conselheiro',
      details: '',
      relations: [],
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1000,
    };

    vi.spyOn(loreService, 'listLoreEntities').mockResolvedValue([]);
    vi.spyOn(loreService, 'createLoreEntity').mockResolvedValue(newEntity);
    vi.spyOn(loreService, 'updateLoreEntity').mockResolvedValue();
    vi.spyOn(loreService, 'deleteLoreEntity').mockResolvedValue();

    const { result } = renderHook(() => useLore('b-1'));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.createEntity({
        name: 'Merlin',
        category: 'character',
        summary: 'Feiticeiro conselheiro',
      });
    });

    expect(result.current.entities).toHaveLength(1);

    await act(async () => {
      await result.current.updateEntity('e-new', { name: 'Merlin Ambrosius' });
    });

    expect(result.current.entities[0]?.name).toBe('Merlin Ambrosius');

    await act(async () => {
      await result.current.deleteEntity('e-new');
    });

    expect(result.current.entities).toHaveLength(0);
  });
});
