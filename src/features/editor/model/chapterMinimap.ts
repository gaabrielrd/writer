import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { findLoreMatches, type LoreCategory, type LoreEntity } from '@/features/lore';

export interface MinimapDestination {
  position: number;
  blockPosition: number;
  kind: 'paragraph' | 'heading' | 'entity' | 'block';
  label: string;
  length: number;
  level: number;
  category?: LoreCategory;
}

const categoryLabels: Record<LoreCategory, string> = {
  character: 'Personagem',
  location: 'Local',
  concept: 'Conceito',
  other: 'Outro',
};

/** Derive navigation from the document, never from saved HTML or ghost suggestions. */
export function buildChapterMinimap(doc: ProseMirrorNode, entities: LoreEntity[]) {
  const destinations: MinimapDestination[] = [];
  if (!doc.textContent.trim()) return destinations;
  doc.descendants((node, position) => {
    if (!node.isTextblock) return;
    const text = node.textBetween(0, node.content.size, '', '\n');
    const kind =
      node.type.name === 'heading'
        ? 'heading'
        : node.type.name === 'paragraph'
          ? 'paragraph'
          : 'block';
    const level = Number(node.attrs.level ?? 0);
    destinations.push({
      position: position + 1,
      blockPosition: position,
      kind,
      label: `${kind === 'heading' ? `Título nível ${level}` : kind === 'paragraph' ? 'Parágrafo' : 'Bloco'}: ${text.trim().slice(0, 100) || 'vazio'}`,
      length: text.length,
      level,
    });
    if (!node.type.spec.code) {
      for (const match of findLoreMatches(text, entities)) {
        destinations.push({
          position: position + 1 + match.startIndex,
          blockPosition: position,
          kind: 'entity',
          label: `${categoryLabels[match.entity.category]}: ${match.entity.name} — ${match.matchedText}`,
          length: match.matchedText.length,
          level: 0,
          category: match.entity.category,
        });
      }
    }
    return false;
  });
  return destinations;
}

export const clampMinimap = (value: number) => Math.max(0, Math.min(1, value));

export function minimapViewport(
  top: number,
  height: number,
  visibleTop: number,
  visibleBottom: number,
) {
  const start = clampMinimap((visibleTop - top) / Math.max(1, height));
  const end = clampMinimap((visibleBottom - top) / Math.max(1, height));
  return { start, end: Math.max(start, end) };
}
