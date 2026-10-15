import { expect, it, vi } from 'vitest';
import {
  parseWordGoal,
  workProjectPath,
  workResumePath,
  workErrorCode,
  workErrorReason,
  isWorkConflict,
  isWorkFailureDefinitive,
  workErrorMessage,
} from '../model/workProgress';
import { availableTimeZones, deviceTimeZone, formatWorkDate } from '../services/workTimeZone';
import { conflict, uncertain } from './workFixtures';
it.each(['0', '-1', '1.5', '1e3', 'abc', '9007199254740992'])(
  'recusa meta inválida %s',
  (value) => {
    expect(() => parseWordGoal(value)).toThrow('inteiro positivo');
  },
);
it('mantém meta total segura e ausência sem arredondar ou inventar quota', () => {
  expect(parseWordGoal('')).toBeNull();
  expect(parseWordGoal(' 50000 ')).toBe(50000);
  expect(parseWordGoal('9007199254740991')).toBe(Number.MAX_SAFE_INTEGER);
});
it('reconstrói somente rotas tipadas com IDs escapados', () => {
  expect(workProjectPath({ kind: 'campaign', id: 'a/b' })).toBe('/campaigns/a%2Fb');
  expect(workResumePath({ kind: 'book', id: 'b' }, { kind: 'chapter', id: 'c/d' })).toBe(
    '/books/b/editor/c%2Fd',
  );
  expect(workResumePath({ kind: 'adventure', id: 'a' }, { kind: 'scene', id: 's' })).toBe(
    '/adventures/a/scenes/s',
  );
  expect(workResumePath({ kind: 'campaign', id: 'c' }, { kind: 'scene', id: 's' })).toBe(
    '/campaigns/c',
  );
  expect(workResumePath({ kind: 'book', id: 'b' }, { kind: 'project' })).toBe('/books/b');
});
it('distingue conflito definitivo de transporte incerto mantendo erro legível', () => {
  expect(isWorkConflict(conflict())).toBe(true);
  expect(isWorkFailureDefinitive(conflict())).toBe(true);
  expect(isWorkFailureDefinitive(uncertain())).toBe(false);
  expect(workErrorCode(null)).toBe('');
  expect(workErrorReason({ details: null })).toBe('');
  expect(workErrorMessage(undefined)).toContain('Tente novamente');
});
it('formata datas defensivamente pelo fuso sem períodos de produção', () => {
  expect(formatWorkDate(0, 'UTC')).toContain('1970');
  expect(formatWorkDate(0, 'America/Sao_Paulo')).not.toBe(formatWorkDate(0, 'UTC'));
  expect(formatWorkDate(NaN, 'UTC')).toBe('Data indisponível');
  expect(formatWorkDate(9e15, 'UTC')).toBe('Data indisponível');
  expect(formatWorkDate(0, 'Invalid/Zone')).toBe('Data indisponível');
  expect(availableTimeZones()).toContain(deviceTimeZone());
  const spy = vi.spyOn(Intl, 'supportedValuesOf').mockImplementation(() => {
    throw new Error('unsupported');
  });
  try {
    expect(availableTimeZones()).toContain('UTC');
  } finally {
    spy.mockRestore();
  }
});
