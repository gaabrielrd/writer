import { Extension } from '@tiptap/react';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import {
  findLoreMatches,
  preferredLoreTerms,
  type LoreCategory,
  type LoreEntity,
  type LoreMentionEntity,
} from '@/features/lore';

export const loreDecorationKey = new PluginKey<DecorationSet>('writerLore');

/** Decorations never enter the document, history, clipboard or saved HTML. */
export function buildLoreDecorations(
  doc: ProseMirrorNode,
  entities: LoreMentionEntity[],
): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, position) => {
    if (!node.isTextblock || node.type.spec.code) return;
    const text = node.textBetween(0, node.content.size, '', '\n');
    for (const match of findLoreMatches(text, entities)) {
      decorations.push(
        Decoration.inline(position + 1 + match.startIndex, position + 1 + match.endIndex, {
          'data-lore-id': match.entityId,
          class: 'writer-lore-term',
          role: 'button',
          tabindex: '0',
          'aria-label': `Ver ficha de ${match.entity.name}`,
        }),
      );
    }
    return false;
  });
  return DecorationSet.create(doc, decorations);
}

export interface LoreDecorationOptions<T extends LoreMentionEntity = LoreEntity> {
  getEntities: () => T[];
  onHover: (entity: T | null, element?: HTMLElement) => void;
  onSelect: (entity: T) => void;
}

export function createLoreExtension<T extends LoreMentionEntity>(
  options: LoreDecorationOptions<T>,
) {
  const entityForTarget = (target: EventTarget | null) => {
    const element =
      target instanceof Element ? target.closest<HTMLElement>('[data-lore-id]') : null;
    const entity = options.getEntities().find((item) => item.id === element?.dataset.loreId);
    return { element, entity };
  };
  const extension = Extension.create({
    name: 'writerLore',
    addProseMirrorPlugins() {
      return [
        new Plugin<DecorationSet>({
          key: loreDecorationKey,
          state: {
            init: (_, state) => buildLoreDecorations(state.doc, options.getEntities()),
            apply: (transaction, previous) =>
              transaction.docChanged || transaction.getMeta(loreDecorationKey)
                ? buildLoreDecorations(transaction.doc, options.getEntities())
                : previous,
          },
          props: {
            decorations: (state) => loreDecorationKey.getState(state),
            handleClick: (_view, _position, event) => {
              const { entity } = entityForTarget(event.target);
              if (!entity) return false;
              options.onSelect(entity);
              return false;
            },
            handleDOMEvents: {
              mouseover: (_view, event) => {
                const { entity, element } = entityForTarget(event.target);
                options.onHover(entity ?? null, element ?? undefined);
                return false;
              },
              mouseout: (_view, event) => {
                const { element } = entityForTarget(event.target);
                if (
                  !(event.relatedTarget instanceof Node) ||
                  !element?.contains(event.relatedTarget)
                )
                  options.onHover(null);
                return false;
              },
              focusin: (_view, event) => {
                const { entity, element } = entityForTarget(event.target);
                options.onHover(entity ?? null, element ?? undefined);
                return false;
              },
              focusout: () => {
                options.onHover(null);
                return false;
              },
              keydown: (_view, event) => {
                const { entity, element } = entityForTarget(event.target);
                if (
                  entity &&
                  element === document.activeElement &&
                  (event.key === 'Enter' || event.key === ' ')
                ) {
                  event.preventDefault();
                  options.onSelect(entity);
                  return true;
                }
                return false;
              },
            },
          },
        }),
      ];
    },
  });
  return {
    extension,
    update: (next: Partial<LoreDecorationOptions<T>>) => {
      options = { ...options, ...next };
    },
  };
}

export interface MentionRange {
  from: number;
  to: number;
  query: string;
}

export function getMentionRange(state: EditorState): MentionRange | null {
  const { $from, empty, from } = state.selection;
  if (!empty || !$from.parent.isTextblock || $from.parent.type.spec.code) return null;
  const before = $from.parent.textBetween(0, $from.parentOffset, '', '\n');
  const match = /(?:^|\s)@([^@\n]{0,50})$/.exec(before);
  if (!match) return null;
  const query = match[1] ?? '';
  return { from: from - query.length - 1, to: from, query };
}

const CATEGORY_SEARCH_TERMS: Record<LoreCategory, string[]> = {
  character: ['personagem', 'personagens'],
  location: ['local', 'locais'],
  concept: ['conceito', 'conceitos', 'item', 'itens'],
  other: ['outro', 'outros'],
};

export function mentionCandidates<T extends LoreMentionEntity>(entities: T[], query: string): T[] {
  const normalized = query.trim().toLocaleLowerCase();
  const owners = preferredLoreTerms(entities);
  return entities.filter((entity) => {
    const terms = [entity.name, ...entity.aliases].filter(
      (term) => owners.get(term.trim().toLocaleLowerCase())?.id === entity.id,
    );
    return (
      terms.some((term) => term.toLocaleLowerCase().includes(normalized)) ||
      (terms.length > 0 &&
        [entity.category, ...CATEGORY_SEARCH_TERMS[entity.category]].some((term) =>
          term.toLocaleLowerCase().includes(normalized),
        ))
    );
  });
}

/** AI output is text, never HTML. */
export function plainTextContent(text: string) {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => ({
      type: 'paragraph',
      content: line ? [{ type: 'text', text: line }] : [],
    }));
}

interface GhostText {
  position: number;
  text: string;
}
export const ghostSuggestionKey = new PluginKey<GhostText | null>('writerGhostSuggestion');

/** A predictive suggestion is a view-only widget, never manuscript text until accepted. */
export const GhostTextExtension = Extension.create({
  name: 'writerGhostSuggestion',
  addProseMirrorPlugins() {
    return [
      new Plugin<GhostText | null>({
        key: ghostSuggestionKey,
        state: {
          init: () => null,
          apply: (transaction, previous) => {
            const next = transaction.getMeta(ghostSuggestionKey) as GhostText | null | undefined;
            if (next !== undefined) return next;
            return transaction.docChanged || transaction.selectionSet ? null : previous;
          },
        },
        props: {
          decorations: (state) => {
            const ghost = ghostSuggestionKey.getState(state);
            if (!ghost) return null;
            return DecorationSet.create(state.doc, [
              Decoration.widget(
                ghost.position,
                () => {
                  const element = document.createElement('span');
                  element.className = 'writer-ai-ghost';
                  element.textContent = ghost.text;
                  element.setAttribute('aria-hidden', 'true');
                  element.setAttribute('contenteditable', 'false');
                  return element;
                },
                { side: 1, key: ghost.text },
              ),
            ]);
          },
        },
      }),
    ];
  },
});
