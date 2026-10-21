import { expect, it } from 'vitest';
import { formatProjectDate, isDefinitiveCreationFailure, projectPath } from '../model/project';
it('preserva IDs antigos nas rotas e codifica segmentos novos', () => {
  expect(projectPath({ kind: 'book', id: 'old_id' })).toBe('/books/old_id');
  expect(projectPath({ kind: 'adventure', id: 'a b' })).toBe('/adventures/a%20b');
  expect(projectPath({ kind: 'campaign', id: 'campaign' })).toBe('/campaigns/campaign');
});
it('distingue falha definitiva de resultado incerto sem supor sucesso', () => {
  expect(isDefinitiveCreationFailure({ code: 'functions/invalid-argument' })).toBe(true);
  expect(isDefinitiveCreationFailure({ code: 'permission-denied' })).toBe(true);
  expect(isDefinitiveCreationFailure({ code: 'functions/unavailable' })).toBe(false);
  expect(isDefinitiveCreationFailure(new Error('Offline'))).toBe(false);
  expect(isDefinitiveCreationFailure(null)).toBe(false);
});
it('usa a data persistida, sem substituir pelo instante de abrir a tela', () => {
  expect(formatProjectDate(Date.UTC(2020, 0, 2, 12))).toContain('2020');
});
it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 9e15])(
  'não inventa data nem lança em metadado inválido (%s)',
  (value) => {
    expect(formatProjectDate(value)).toBe('Data indisponível');
  },
);
