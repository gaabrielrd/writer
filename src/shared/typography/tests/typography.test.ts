import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultTypography, parseTypography, typographyFonts } from '../typography';
import { readTypography, saveTypography } from '../../services/typographyStorage';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('preferências de tipografia', () => {
  it('usa Clássico editorial como padrão para contas novas e dados inválidos', () => {
    expect(typographyFonts(readTypography('new'))).toEqual({
      titles: 'Libre Baskerville',
      interface: 'Source Sans 3',
      editor: 'Source Serif 4',
    });
    localStorage.setItem('writer:typography:v1:user:broken', '{');
    expect(readTypography('broken').preset).toBe('classic');
  });
  it.each([
    { ...defaultTypography(), version: 2 },
    { ...defaultTypography(), preset: 'unknown' },
    { ...defaultTypography(), customFonts: null },
    {
      ...defaultTypography(),
      customFonts: { titles: 'url(https://example.test)', interface: 'Lora', editor: 'Lora' },
    },
    null,
    [],
  ])('recusa configuração sem versão ou famílias reconhecidas: %j', (value) => {
    expect(parseTypography(value)).toBeNull();
  });
  it('isola contas e sessão anônima e preserva a combinação personalizada', () => {
    const custom = {
      ...defaultTypography(),
      preset: 'custom' as const,
      customFonts: {
        titles: 'Cormorant Garamond' as const,
        interface: 'Nunito Sans' as const,
        editor: 'Crimson Pro' as const,
      },
    };
    saveTypography('a', custom);
    saveTypography('anonymous', { ...defaultTypography(), preset: 'poetic' });
    expect(readTypography('a')).toEqual(custom);
    expect(readTypography('b').preset).toBe('classic');
    expect(readTypography(null).preset).toBe('classic');
    expect(readTypography('anonymous').preset).toBe('poetic');
  });
  it('aceita fontes somente da lista também no salvamento e tolera falha de leitura', () => {
    expect(() =>
      saveTypography('a', {
        ...defaultTypography(),
        customFonts: { ...defaultTypography().customFonts, editor: 'bad' as never },
      }),
    ).toThrow('inválida');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    expect(readTypography('a').preset).toBe('classic');
  });
});
