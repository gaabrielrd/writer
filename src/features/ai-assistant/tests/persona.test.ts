import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PERSONAS,
  resolveWritingPersona,
  validatePersona,
  validateComplement,
} from '../model/persona';
import { buildActionPrompt, buildAutocompletePrompt } from '../model/aiPrompt';

describe('personas de escrita', () => {
  it('oferece os seis perfis completos com instruções e oito atributos válidos', () => {
    expect(DEFAULT_PERSONAS.map((item) => item.name)).toEqual([
      'O Atmosférico',
      'O Incisivo',
      'O Íntimo',
      'O Irônico',
      'O Épico',
      'O Inquietante',
    ]);
    DEFAULT_PERSONAS.forEach((persona) => {
      expect(validatePersona(persona).traits).toHaveLength(8);
      expect(persona.instructions.length).toBeGreaterThan(60);
    });
    expect(resolveWritingPersona(DEFAULT_PERSONAS)).toEqual({ instruction: '', version: '' });
  });

  it('mantém atributos do livro e aplica somente substituições explícitas do capítulo, inclusive zero', () => {
    const resolved = resolveWritingPersona(DEFAULT_PERSONAS, 'preset-atmospheric', {
      personaId: 'preset-unsettling',
      overrides: [
        { traitId: 'tension', value: 100 },
        { traitId: 'humor', value: 0 },
      ],
    });
    expect(resolved.instruction).toContain('Sensorialidade: 90/100');
    expect(resolved.instruction).toContain('Tensão: 100/100');
    expect(resolved.instruction).toContain('Humor e ironia: 0/100');
    expect(resolved.instruction).toContain('ambígua e tensa');
    expect(resolved.instruction).toContain('complemento do capítulo prevalece');
    expect(resolved.instruction).toContain('pedido pontual');
  });

  it('usa a complementar sem uma base e aceita personas arquivadas ainda vinculadas', () => {
    const personas = DEFAULT_PERSONAS.map((item) => ({ ...item, archived: true }));
    expect(
      resolveWritingPersona(personas, null, { personaId: 'preset-incisive', overrides: [] })
        .instruction,
    ).toContain('Concisão: 95/100');
  });

  it('envia instruções e sliders personalizados em todos os prompts de escrita', () => {
    const persona = validatePersona({
      ...DEFAULT_PERSONAS[0],
      id: 'custom-test',
      name: 'Minha voz',
      instructions: 'Evite metáforas marinhas.',
      traits: [
        ...DEFAULT_PERSONAS[0]!.traits,
        {
          id: 'custom-dialogue',
          name: 'Formalidade',
          description: 'Forma de tratar outras pessoas.',
          low: 'Tratamento coloquial',
          high: 'Tratamento cerimonial',
          value: 72,
        },
      ],
    });
    const writingPersona = resolveWritingPersona([persona], persona.id);
    const prompts = [
      buildAutocompletePrompt({ textBeforeCursor: 'A personagem entrou.', writingPersona }),
      ...(['continue', 'improve_style', 'check_consistency', 'custom'] as const).map((action) =>
        buildActionPrompt({
          action,
          selectedText: 'A personagem entrou.',
          writingPersona,
          customInstruction: 'Nesta cena, use humor.',
        }),
      ),
    ];
    for (const result of prompts) {
      expect(result.systemInstruction).toContain('Evite metáforas marinhas.');
      expect(result.systemInstruction).toContain('Formalidade: 72/100');
      expect(result.systemInstruction).toContain('Tratamento cerimonial');
    }
    expect(prompts[0]!.systemInstruction).toContain('APENAS');
    expect(prompts[2]!.prompt).not.toContain('aprimorando a riqueza sensorial');
    expect(prompts[4]!.prompt).toContain('Nesta cena, use humor.');
  });

  it('muda a versão efetiva ao editar instruções, revisão ou valores e recusa referências perdidas', () => {
    const initial = resolveWritingPersona(DEFAULT_PERSONAS, 'preset-incisive');
    const changed = resolveWritingPersona(
      DEFAULT_PERSONAS.map((item) => ({ ...item, revision: 2 })),
      'preset-incisive',
    );
    expect(changed.version).not.toBe(initial.version);
    expect(() => resolveWritingPersona(DEFAULT_PERSONAS, 'custom-missing')).toThrow(
      'não está disponível',
    );
    expect(() =>
      resolveWritingPersona(DEFAULT_PERSONAS, null, {
        personaId: 'preset-incisive',
        overrides: [{ traitId: 'custom-removed', value: 10 }],
      }),
    ).toThrow('removido');
  });

  it('valida limites e remove metadados estranhos antes de persistir ou exportar', () => {
    expect(validatePersona({ ...DEFAULT_PERSONAS[0], apiKey: 'secret' })).not.toHaveProperty(
      'apiKey',
    );
    for (const data of [
      null,
      {},
      { ...DEFAULT_PERSONAS[0], instructions: '' },
      { ...DEFAULT_PERSONAS[0], name: 'x'.repeat(81) },
      { ...DEFAULT_PERSONAS[0], traits: [] },
      {
        ...DEFAULT_PERSONAS[0],
        traits: DEFAULT_PERSONAS[0]!.traits.map((item) => ({ ...item, value: 101 })),
      },
      {
        ...DEFAULT_PERSONAS[0],
        traits: [...DEFAULT_PERSONAS[0]!.traits, DEFAULT_PERSONAS[0]!.traits[0]],
      },
    ])
      expect(() => validatePersona(data)).toThrow();
    expect(validateComplement(null)).toBeNull();
    for (const data of [
      {},
      { personaId: '../intruso', overrides: [] },
      { personaId: 'preset-incisive', overrides: [{ traitId: 'pace', value: -1 }] },
      {
        personaId: 'preset-incisive',
        overrides: [
          { traitId: 'pace', value: 20 },
          { traitId: 'pace', value: 30 },
        ],
      },
    ])
      expect(() => validateComplement(data)).toThrow();
  });
});
