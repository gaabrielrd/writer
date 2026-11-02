import { describe, expect, it } from 'vitest';
import type { LoreMentionEntity } from '@/features/lore';
import { findLoreMatches, preferredLoreTerms } from '@/features/lore';
import { editorChatMatcherId, findEditorChatLoreMatches } from '@/features/ai-assistant';
import {
  editorLoreEntityKey,
  editorLoreMatches,
  editorLoreTerms,
} from '../model/editorLoreMatcher';
import { mentionCandidates, buildLoreDecorations } from '../model/richDocument';
import { buildChapterMinimap } from '../model/chapterMinimap';
import { Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

const local: LoreMentionEntity = {
  id: 'same',
  bookId: 'book',
  name: 'Lia',
  aliases: ['Vigia'],
  summary: 'Local',
  category: 'character',
};
const global: LoreMentionEntity = {
  id: 'same',
  universeId: 'world',
  name: 'Torre',
  aliases: ['Vigia'],
  summary: 'Global',
  category: 'location',
};
const mode = 'editor-chat-v1';

describe('opt-in editor lore matcher', () => {
  it('preserves legacy matching and term ownership by default', () => {
    const entities = [global, local];
    expect(editorLoreMatches('Lia e Torre: Vigia', entities)).toEqual(
      findLoreMatches('Lia e Torre: Vigia', entities),
    );
    expect(editorLoreTerms(entities)).toEqual(preferredLoreTerms(entities));
    expect(editorLoreEntityKey(global)).toBe('same');
  });
  it('qualifies identical raw IDs and maps matches back to their real metadata', () => {
    const matches = editorLoreMatches('Lia e Torre: Vigia', [global, local], mode);
    expect(matches.map((match) => [match.entityId, match.entity, match.matchedText])).toEqual([
      ['["book","book","same"]', local, 'Lia'],
      ['["universe","world","same"]', global, 'Torre'],
      ['["book","book","same"]', local, 'Vigia'],
    ]);
    expect(local.id).toBe('same');
    expect(global.id).toBe('same');
  });
  it('unwraps canonical adventure/global IDs and preserves colons inside legacy book IDs', () => {
    expect(editorLoreEntityKey({ ...local, id: 'old:entity' }, mode)).toBe(
      '["book","book","old:entity"]',
    );
    expect(editorLoreEntityKey({ ...global, id: 'universe:world:same' }, mode)).toBe(
      '["universe","world","same"]',
    );
    expect(
      editorLoreEntityKey(
        { ...local, bookId: undefined, adventureId: 'adventure', id: 'adventure:adventure:entry' },
        mode,
      ),
    ).toBe('["adventure","adventure","entry"]');
  });
  it.each([
    { ...local, bookId: undefined },
    { ...local, universeId: 'world' },
    { ...local, bookId: '' },
    { ...global, id: 'universe:other:wrong' },
  ])('rejects ambiguous/missing/foreign origins without falling back', (entity) => {
    expect(() => editorLoreMatches('Vigia', [entity], mode)).toThrow();
  });
  it('rejects conflicting metadata of the same qualified identity', () => {
    expect(() => editorLoreTerms([local, { ...local, summary: 'Changed' }], mode)).toThrow(
      'inconsistentes',
    );
    expect(editorLoreMatches('Lia', [local, { ...local }], mode)).toHaveLength(1);
  });
  it('uses the same Unicode, overlap and deterministic ties as the server matcher', () => {
    const entities = [
      { ...local, id: 'z', name: 'Rainha', aliases: ['ÁGUIA'] },
      { ...local, id: 'a', name: 'Rainha do Norte', aliases: ['Águia'] },
      { ...global, name: 'Águia', aliases: [] },
    ];
    const text = 'Rainha do Norte, ÁGUIA e préÁGUIAx.';
    const pure = entities.map((entity) => {
      const reference = {
        kind: entity.universeId ? ('universe' as const) : ('book' as const),
        scopeId: entity.universeId ?? entity.bookId!,
        entityId: entity.id,
      };
      return {
        id: editorChatMatcherId(reference),
        reference,
        name: entity.name,
        aliases: entity.aliases,
        global: Boolean(entity.universeId),
      };
    });
    expect(
      editorLoreMatches(text, entities, mode).map((match) => ({
        from: match.startIndex,
        to: match.endIndex,
        id: match.entityId,
        term: match.matchedText.toLocaleLowerCase('pt-BR'),
      })),
    ).toEqual(findEditorChatLoreMatches(text, pure));
    expect(editorLoreTerms(entities, mode).get('águia')?.id).toBe('a');
  });
  it('uses qualified winners for aliases/categories without hiding another entity sharing its raw ID', () => {
    expect(mentionCandidates([global, local], 'Vigia', mode)).toEqual([local]);
    expect(mentionCandidates([global, local], 'local', mode)).toEqual([global]);
    expect(mentionCandidates([global, local], '', mode)).toEqual([global, local]);
  });
  it('forwards the same winners to decorations and minimap without mutating the document', () => {
    const editor = new Editor({ extensions: [StarterKit], content: '<p>Lia, Torre e Vigia.</p>' });
    try {
      const before = editor.getHTML();
      const decorations = buildLoreDecorations(editor.state.doc, [global, local], mode).find();
      expect(
        decorations.map(
          (decoration) =>
            (decoration as unknown as { type: { attrs: Record<string, string> } }).type.attrs[
              'data-lore-id'
            ],
        ),
      ).toEqual([
        '["book","book","same"]',
        '["universe","world","same"]',
        '["book","book","same"]',
      ]);
      expect(
        buildChapterMinimap(editor.state.doc, [global, local], mode)
          .filter((entry) => entry.kind === 'entity')
          .map((entry) => entry.label),
      ).toEqual(['Personagem: Lia — Lia', 'Local: Torre — Torre', 'Personagem: Lia — Vigia']);
      expect(editor.getHTML()).toBe(before);
    } finally {
      editor.destroy();
    }
  });
});
