export interface LoreContextItem {
  name: string;
  category: string;
  summary: string;
}

export function buildLoreContext(loreEntities: LoreContextItem[]): string {
  if (loreEntities.length === 0) return '';

  const entries = loreEntities
    .slice(0, 15) // Limita a 15 entidades para manter o prompt conciso e rápido
    .map((e) => `- ${e.name} (${e.category}): ${e.summary}`)
    .join('\n');

  return `[COMPÊNDIO DE LORE DO LIVRO]\n${entries}\n`;
}

export function buildAutocompletePrompt({
  textBeforeCursor,
  loreEntities = [],
}: {
  textBeforeCursor: string;
  loreEntities?: LoreContextItem[];
}): { systemInstruction: string; prompt: string } {
  // Pega até os últimos 1500 caracteres para ter contexto imediato da cena
  const recentText = textBeforeCursor.slice(-1500);
  const loreBlock = buildLoreContext(loreEntities);

  const systemInstruction =
    'Você é um assistente de escrita de ficção criativa integrado a um editor de romances. ' +
    'Sua missão é sugerir a continuação imediata da frase ou parágrafo atual, mantendo o tom, ' +
    'o estilo narrativo e a consistência estrita com as entidades de lore do universo fornecido. ' +
    'Responda APENAS com o texto de continuação (de 1 a 3 frases curtas e fluidas), sem comentários, ' +
    'sem aspas ao redor e sem repetir o texto já escrito pelo autor.';

  const prompt = `${loreBlock}
[TEXTO RECENTE DO AUTOR]:
${recentText}

[CONTINUAÇÃO]:`;

  return { systemInstruction, prompt };
}

export type AIActionType = 'continue' | 'improve_style' | 'check_consistency' | 'custom';

export function buildActionPrompt({
  action,
  selectedText,
  loreEntities = [],
  customInstruction = '',
}: {
  action: AIActionType;
  selectedText: string;
  loreEntities?: LoreContextItem[];
  customInstruction?: string;
}): { systemInstruction: string; prompt: string } {
  const loreBlock = buildLoreContext(loreEntities);

  const systemInstruction =
    'Você é um coautor e editor literário experiente em ficção narrativa. Responda de forma direta e elegante em língua portuguesa.';

  let actionInstruction = '';

  switch (action) {
    case 'continue':
      actionInstruction =
        'Continue a cena a partir do trecho selecionado, desenvolvendo a ação, os diálogos e a tensão narrativa de forma orgânica (1 a 2 parágrafos).';
      break;
    case 'improve_style':
      actionInstruction =
        'Reescreva o trecho selecionado aprimorando a riqueza sensorial, a musicalidade da prosa e a expressividade descritiva, eliminando clichês sem desvirtuar o sentido original.';
      break;
    case 'check_consistency':
      actionInstruction =
        'Analise o trecho selecionado em comparação com as fichas de lore fornecidas. Aponte se há incongruências ou como enriquecer as menções aos elementos do universo.';
      break;
    case 'custom':
      actionInstruction = customInstruction.trim() || 'Aprimore o texto selecionado.';
      break;
  }

  const prompt = `${loreBlock}
[INSTRUÇÃO]:
${actionInstruction}

[TRECHO SELECIONADO]:
${selectedText}

[RESPOSTA]:`;

  return { systemInstruction, prompt };
}
