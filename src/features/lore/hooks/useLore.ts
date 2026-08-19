import { useState, useEffect, useCallback, useMemo } from 'react';
import type {
  CreateLoreEntityInput,
  LoreCategory,
  LoreEntity,
  UpdateLoreEntityInput,
} from '../model/loreEntity';
import * as loreService from '../services/loreService';

export interface UseLoreResult {
  entities: LoreEntity[];
  filteredEntities: LoreEntity[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  categoryFilter: LoreCategory | 'all';
  setSearchQuery: (query: string) => void;
  setCategoryFilter: (category: LoreCategory | 'all') => void;
  refreshEntities: () => Promise<void>;
  createEntity: (input: CreateLoreEntityInput) => Promise<LoreEntity>;
  updateEntity: (entityId: string, input: UpdateLoreEntityInput) => Promise<void>;
  deleteEntity: (entityId: string) => Promise<void>;
}

export function useLore(bookId?: string | null): UseLoreResult {
  const [entities, setEntities] = useState<LoreEntity[]>([]);
  const [loading, setLoading] = useState<boolean>(() => Boolean(bookId));
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<LoreCategory | 'all'>('all');

  const fetchEntities = useCallback(async () => {
    if (!bookId) {
      setEntities([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const data = await loreService.listLoreEntities(bookId);
      setEntities(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar compêndio de lore');
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    let active = true;
    if (!bookId) return;

    loreService
      .listLoreEntities(bookId)
      .then((data) => {
        if (active) {
          setEntities(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Falha ao carregar compêndio de lore');
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [bookId]);

  const handleCreateEntity = useCallback(
    async (input: CreateLoreEntityInput) => {
      if (!bookId) throw new Error('Livro não selecionado');
      const newEntity = await loreService.createLoreEntity(bookId, input);
      setEntities((prev) => [...prev, newEntity].sort((a, b) => a.name.localeCompare(b.name)));
      return newEntity;
    },
    [bookId],
  );

  const handleUpdateEntity = useCallback(
    async (entityId: string, input: UpdateLoreEntityInput) => {
      if (!bookId) return;
      await loreService.updateLoreEntity(bookId, entityId, input);
      setEntities((prev) =>
        prev
          .map((e) => (e.id === entityId ? { ...e, ...input, updatedAt: Date.now() } : e))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    },
    [bookId],
  );

  const handleDeleteEntity = useCallback(
    async (entityId: string) => {
      if (!bookId) return;
      await loreService.deleteLoreEntity(bookId, entityId);
      setEntities((prev) => prev.filter((e) => e.id !== entityId));
    },
    [bookId],
  );

  const filteredEntities = useMemo(() => {
    return entities.filter((entity) => {
      const matchesCategory = categoryFilter === 'all' || entity.category === categoryFilter;

      if (!matchesCategory) return false;

      if (!searchQuery.trim()) return true;

      const q = searchQuery.toLowerCase().trim();
      const inName = entity.name.toLowerCase().includes(q);
      const inSummary = entity.summary.toLowerCase().includes(q);
      const inAliases = entity.aliases.some((a) => a.toLowerCase().includes(q));

      return inName || inSummary || inAliases;
    });
  }, [entities, categoryFilter, searchQuery]);

  return {
    entities,
    filteredEntities,
    loading,
    error,
    searchQuery,
    categoryFilter,
    setSearchQuery,
    setCategoryFilter,
    refreshEntities: fetchEntities,
    createEntity: handleCreateEntity,
    updateEntity: handleUpdateEntity,
    deleteEntity: handleDeleteEntity,
  };
}
