import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as firestoreModule from 'firebase/firestore';
import {
  listLoreEntities,
  getLoreEntity,
  createLoreEntity,
  updateLoreEntity,
  deleteLoreEntity,
} from '../services/loreService';

vi.mock('firebase/firestore', () => {
  return {
    collection: vi.fn(),
    doc: vi.fn(() => ({ id: 'entity-123' })),
    getDoc: vi.fn(),
    getDocs: vi.fn(),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    deleteDoc: vi.fn(),
    query: vi.fn(),
    orderBy: vi.fn(),
  };
});

vi.mock('@/shared/lib', () => ({
  firestore: {},
}));

describe('loreService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('lista entidades de lore de um livro', async () => {
    vi.mocked(firestoreModule.getDocs).mockResolvedValueOnce({
      docs: [
        {
          id: 'e-1',
          data: () => ({
            name: 'Rei Arthur',
            aliases: ['Pendragon'],
            category: 'character',
            summary: 'Rei de Camelot',
            details: 'História detalhada',
            relations: [{ targetEntityId: 'e-2', relationType: 'Aliado de' }],
            isPublic: true,
            createdAt: 1000,
            updatedAt: 1000,
          }),
        },
      ],
    } as unknown as firestoreModule.QuerySnapshot);

    const result = await listLoreEntities('b-1');

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('e-1');
    expect(result[0]?.name).toBe('Rei Arthur');
    expect(result[0]?.category).toBe('character');
    expect(result[0]?.aliases).toEqual(['Pendragon']);
  });

  it('recupera entidade individual por ID existente', async () => {
    vi.mocked(firestoreModule.getDoc).mockResolvedValueOnce({
      exists: () => true,
      id: 'e-1',
      data: () => ({
        name: 'Camelot',
        aliases: [],
        category: 'location',
        summary: 'Capital',
        details: '',
        relations: [],
        isPublic: true,
        createdAt: 1000,
        updatedAt: 1000,
      }),
    } as unknown as firestoreModule.DocumentSnapshot);

    const result = await getLoreEntity('b-1', 'e-1');

    expect(result).not.toBeNull();
    expect(result?.name).toBe('Camelot');
    expect(result?.category).toBe('location');
  });

  it('retorna null ao buscar entidade inexistente', async () => {
    vi.mocked(firestoreModule.getDoc).mockResolvedValueOnce({
      exists: () => false,
    } as unknown as firestoreModule.DocumentSnapshot);

    const result = await getLoreEntity('b-1', 'e-none');

    expect(result).toBeNull();
  });

  it('cria nova entidade de lore com limite no resumo', async () => {
    const longSummary = 'A'.repeat(200);

    const newEntity = await createLoreEntity('b-1', {
      name: ' Excalibur ',
      aliases: [' Espada Sagrada '],
      category: 'concept',
      summary: longSummary,
      details: ' Detalhes ',
      isPublic: true,
    });

    expect(newEntity.id).toBe('entity-123');
    expect(newEntity.name).toBe('Excalibur');
    expect(newEntity.aliases).toEqual(['Espada Sagrada']);
    expect(newEntity.summary).toHaveLength(140);
    expect(firestoreModule.setDoc).toHaveBeenCalledTimes(1);
  });

  it('atualiza entidade existente no Firestore', async () => {
    await updateLoreEntity('b-1', 'e-1', {
      name: 'Arthur Pendragon',
      aliases: ['Rei Arthur'],
      category: 'character',
      summary: 'Rei coroado',
      details: 'Novos detalhes',
      isPublic: false,
    });

    expect(firestoreModule.updateDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'Arthur Pendragon',
        aliases: ['Rei Arthur'],
        summary: 'Rei coroado',
        isPublic: false,
      }),
    );
  });

  it('exclui entidade de lore', async () => {
    await deleteLoreEntity('b-1', 'e-1');

    expect(firestoreModule.deleteDoc).toHaveBeenCalledTimes(1);
  });
});
