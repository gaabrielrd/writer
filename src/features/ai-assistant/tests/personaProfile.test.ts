import { describe, expect, it } from 'vitest';
import { DEFAULT_PERSONAS, resolvePersonaProfile, resolveWritingPersona } from '../model/persona';

describe('perfil visual e orientações efetivas', () => {
  it('preserva os atributos próprios da base e do complemento e identifica ajustes explícitos', () => {
    const trait = {
      id: 'custom-base',
      name: 'Formalidade',
      description: 'Tratamento dos personagens',
      low: 'Coloquial',
      high: 'Cerimonial',
      value: 12,
    };
    const base = {
      ...DEFAULT_PERSONAS[0]!,
      id: 'custom-book',
      traits: [...DEFAULT_PERSONAS[0]!.traits, trait],
    };
    const chapter = {
      ...DEFAULT_PERSONAS[5]!,
      id: 'custom-chapter',
      traits: [
        ...DEFAULT_PERSONAS[5]!.traits,
        { ...trait, id: 'custom-chapter-trait', name: 'Distância', value: 65 },
      ],
    };
    const complement = { personaId: chapter.id, overrides: [{ traitId: 'tension', value: 0 }] };
    const profile = resolvePersonaProfile([base, chapter], base.id, complement);
    expect(profile.traits.find((item) => item.id === 'sensory')?.value).toBe(90);
    expect(profile.sources.sensory).toBe('book');
    expect(profile.sources.tension).toBe('override');
    expect(profile.sources['custom-base']).toBe('book');
    expect(profile.sources['custom-chapter-trait']).toBe('chapter');
    const { instruction } = resolveWritingPersona([base, chapter], base.id, complement);
    for (const item of profile.traits)
      expect(instruction).toContain(`${item.name}: ${item.value}/100`);
  });

  it('não apresenta uma configuração incompleta como perfil válido', () => {
    expect(() => resolvePersonaProfile(DEFAULT_PERSONAS, 'missing')).toThrow(/não está disponível/);
    expect(() =>
      resolvePersonaProfile(DEFAULT_PERSONAS, DEFAULT_PERSONAS[0]!.id, {
        personaId: DEFAULT_PERSONAS[5]!.id,
        overrides: [{ traitId: 'removed', value: 50 }],
      }),
    ).toThrow(/foi removido/);
  });
});
