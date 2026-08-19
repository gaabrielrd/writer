import type { LoreEntity } from './loreEntity';

export interface LoreMatch {
  entityId: string;
  entityName: string;
  matchedText: string;
  startIndex: number;
  endIndex: number;
  entity: LoreEntity;
}

function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Identifica e mapeia menções a entidades de lore e seus apelidos em um texto.
 * Garante correspondência por fronteira de palavra e prioriza termos mais longos para evitar sobreposições.
 */
export function findLoreMatches(text: string, entities: LoreEntity[]): LoreMatch[] {
  if (!text || entities.length === 0) {
    return [];
  }

  const termMap: { term: string; entity: LoreEntity }[] = [];

  for (const entity of entities) {
    if (entity.name && entity.name.trim()) {
      termMap.push({ term: entity.name.trim(), entity });
    }
    for (const alias of entity.aliases || []) {
      if (alias && alias.trim()) {
        termMap.push({ term: alias.trim(), entity });
      }
    }
  }

  if (termMap.length === 0) {
    return [];
  }

  // Ordena por tamanho decrescente do termo
  termMap.sort((a, b) => b.term.length - a.term.length);

  const rawMatches: LoreMatch[] = [];

  for (const item of termMap) {
    const escaped = escapeRegExp(item.term);
    const pattern = new RegExp(`(?<=^|[^\\p{L}\\p{N}_])${escaped}(?=[^\\p{L}\\p{N}_]|$)`, 'giu');

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const startIndex = match.index;
      const matchedText = match[0];
      const endIndex = startIndex + matchedText.length;

      rawMatches.push({
        entityId: item.entity.id,
        entityName: item.entity.name,
        matchedText,
        startIndex,
        endIndex,
        entity: item.entity,
      });
    }
  }

  if (rawMatches.length === 0) {
    return [];
  }

  // Ordena os intervalos por ponto final
  rawMatches.sort((a, b) => a.endIndex - b.endIndex);

  // Programação Dinâmica: Weighted Interval Scheduling com peso quadrático (favorece termos longos)
  const n = rawMatches.length;
  const weights = rawMatches.map((m) => Math.pow(m.endIndex - m.startIndex, 2));

  // Encontra o último intervalo incompatível antes de i
  const p: number[] = new Array<number>(n).fill(-1);
  for (let i = 0; i < n; i++) {
    for (let j = i - 1; j >= 0; j--) {
      const prev = rawMatches[j];
      const curr = rawMatches[i];
      if (prev && curr && prev.endIndex <= curr.startIndex) {
        p[i] = j;
        break;
      }
    }
  }

  const opt: number[] = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    const prevIdx = p[i - 1];
    const inclWeight =
      (weights[i - 1] ?? 0) + (prevIdx !== undefined && prevIdx >= 0 ? (opt[prevIdx + 1] ?? 0) : 0);
    const exclWeight = opt[i - 1] ?? 0;
    opt[i] = Math.max(inclWeight, exclWeight);
  }

  // Reconstrói a solução ótima
  const result: LoreMatch[] = [];
  let curr = n;
  while (curr > 0) {
    const prevIdx = p[curr - 1];
    const inclWeight =
      (weights[curr - 1] ?? 0) +
      (prevIdx !== undefined && prevIdx >= 0 ? (opt[prevIdx + 1] ?? 0) : 0);
    const exclWeight = opt[curr - 1] ?? 0;

    if (inclWeight >= exclWeight) {
      const match = rawMatches[curr - 1];
      if (match) {
        result.push(match);
      }
      curr = prevIdx !== undefined && prevIdx >= 0 ? prevIdx + 1 : 0;
    } else {
      curr--;
    }
  }

  result.reverse();
  return result;
}
