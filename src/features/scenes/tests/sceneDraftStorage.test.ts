import { afterEach, expect, it, vi } from 'vitest';
import {
  clearSceneDraft,
  readSceneDraft,
  sceneDraftKey,
  writeSceneDraft,
} from '../services/sceneDraftStorage';
import {
  isSceneConflict,
  isSceneFailureDefinitive,
  sceneErrorMessage,
  sceneErrorReason,
} from '../model/sceneError';
import { sceneRoute } from '../model/scene';
import { target, conflict } from './sceneFixtures';
afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
it('isola conta, tipo, projeto e cena sem colisões em separadores', () => {
  const keys = [
    sceneDraftKey('a', target, 's'),
    sceneDraftKey('b', target, 's'),
    sceneDraftKey('a', { kind: 'adventure', id: 'book' }, 's'),
    sceneDraftKey('a', { kind: 'book', id: 'b:ook' }, 's'),
    sceneDraftKey('a', target, 's:2'),
  ];
  expect(new Set(keys).size).toBe(5);
  expect(sceneRoute({ kind: 'adventure', id: 'á/1' }, 'c/2')).toBe(
    '/adventures/%C3%A1%2F1/scenes/c%2F2',
  );
  expect(sceneRoute(target, 's')).toBe('/books/book/scenes/s');
});
it('recupera somente rascunho válido e remove sem atingir outro alvo', () => {
  const key = sceneDraftKey('a', target, 's');
  expect(readSceneDraft(key)).toBeNull();
  expect(writeSceneDraft(key, { content: '<p>Próprio</p>', revision: 1, savedAt: 100 })).toBe(true);
  expect(readSceneDraft(key)).toEqual({ content: '<p>Próprio</p>', revision: 1, savedAt: 100 });
  clearSceneDraft(key, '<p>Próprio</p>');
  expect(readSceneDraft(key)).toBeNull();
  for (const raw of ['{', 'null', '{}', '{"content":3,"revision":1,"savedAt":1}']) {
    localStorage.setItem(key, raw);
    expect(readSceneDraft(key)).toBeNull();
  }
});
it('expõe falha ao gravar sem quebrar leitura ou limpeza', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  expect(writeSceneDraft('key', { content: 'x', revision: 1, savedAt: 1 })).toBe(false);
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('denied');
  });
  expect(readSceneDraft('key')).toBeNull();
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new Error('denied');
  });
  expect(() => clearSceneDraft('key', 'x')).not.toThrow();
});
it('distingue conflito, validação definitiva e transporte incerto', () => {
  expect(isSceneConflict(conflict())).toBe(true);
  expect(isSceneFailureDefinitive(conflict())).toBe(true);
  expect(isSceneFailureDefinitive(new Error('timeout'))).toBe(false);
  expect(isSceneFailureDefinitive({ code: 'functions/unavailable' })).toBe(false);
  expect(sceneErrorReason({ details: null })).toBe('');
  expect(sceneErrorReason(null)).toBe('');
  expect(sceneErrorMessage(null)).toContain('Tente novamente');
  expect(sceneErrorMessage(new Error('observable'))).toBe('observable');
});

it('não remove texto novo de outra aba e recusa versões ou datas inválidas', () => {
  writeSceneDraft('same', { content: 'A', revision: 1, savedAt: 1 });
  writeSceneDraft('same', { content: 'B', revision: 2, savedAt: 2 });
  clearSceneDraft('same', 'A');
  expect(readSceneDraft('same')?.content).toBe('B');
  for (const value of [
    { content: 'x', revision: 0, savedAt: 1 },
    { content: 'x', revision: 1.5, savedAt: 1 },
    { content: 'x', revision: Number.MAX_SAFE_INTEGER + 1, savedAt: 1 },
    { content: 'x', revision: 1, savedAt: -1 },
    { content: 'x', revision: 1, savedAt: 9e15 },
  ]) {
    localStorage.setItem('invalid', JSON.stringify(value));
    expect(readSceneDraft('invalid')).toBeNull();
  }
});
