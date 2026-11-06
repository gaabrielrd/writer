import { LORE_ANALYSIS_INSTRUCTION } from '../../../../functions/src/loreAnalysisInstruction.mjs';
import { generateAIResponse } from './aiClient';
import { usesOwnKey, type BYOKConfig } from '../model/byokConfig';
import {
  parseDetectedLore,
  type DetectedLoreEntity,
  type LoreEntity,
  type LoreAnalysisEditorialContext,
} from '@/features/lore';

export async function analyzeLoreWithBYOK(
  text: string,
  entities: LoreEntity[],
  config: BYOKConfig,
  signal: AbortSignal,
  editorialContext?: LoreAnalysisEditorialContext,
): Promise<DetectedLoreEntity[]> {
  if (!usesOwnKey(config)) throw new Error('Configure uma chave BYOK válida para esta análise.');
  if (text.length > 120000)
    throw new Error('O capítulo ultrapassa 120 mil caracteres. Divida-o antes de analisar.');
  const context = entities.map(({ id, name, aliases, category, summary, details }) => ({
    id,
    name,
    aliases,
    category,
    summary,
    details,
  }));
  if (JSON.stringify(context).length > 200000)
    throw new Error('O compêndio é grande demais para esta análise.');
  if (
    editorialContext &&
    (editorialContext.scope !== 'editorial-contract-only' ||
      editorialContext.wholeBook !== false ||
      editorialContext.instruction.length > 200000)
  )
    throw new Error('O contexto editorial não cabe nesta análise ou tem escopo inválido.');
  const results: DetectedLoreEntity[] = [];
  for (let start = 0; start < text.length; start += 12000) {
    const source = text.slice(Math.max(0, start - 300), start + 12000);
    let found: DetectedLoreEntity[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await generateAIResponse({
        byokConfig: config,
        signal,
        maxOutputTokens: 12000,
        json: true,
        systemInstruction: LORE_ANALYSIS_INSTRUCTION,
        prompt: JSON.stringify({
          text: source,
          lore: context,
          ...(editorialContext ? { editorialContext } : {}),
          alreadyDetected: results,
          ...(attempt
            ? {
                validationFeedback:
                  'A resposta anterior não passou na validação. Confira os limites dos campos e copie evidências literais de text.',
              }
            : {}),
        }),
      });
      try {
        found = parseDetectedLore(response, text);
        break;
      } catch {
        if (attempt === 1)
          throw new Error(
            'A IA retornou sugestões sem evidências válidas ou fora do formato esperado. Nenhuma alteração ou cobrança ocorreu. Tente novamente.',
          );
      }
    }
    for (const item of found) {
      const index = results.findIndex(
        (previous) =>
          previous.name.toLocaleLowerCase('pt-BR') === item.name.toLocaleLowerCase('pt-BR'),
      );
      if (index < 0) results.push(item);
      else results[index] = item;
    }
    if (results.length > 50)
      throw new Error('Mais de 50 entidades encontradas. Divida o capítulo para revisar todas.');
  }
  return results;
}
