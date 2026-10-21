import type { EditorChatReference } from './editorChatContracts.mjs';
export interface EditorChatMatcherEntity {
  // Real adapter: reference is required and id===editorChatMatcherId(reference).
  // The composed key is not a document ID and is not subject to its 1500-byte cap.
  id: string;
  name: string;
  aliases: string[];
  global: boolean;
  reference?: EditorChatReference | null;
}
export function editorChatMatcherId(reference: EditorChatReference): string;
export type EditorChatLoreMatch = { from: number; to: number; term: string; id: string };
export type EditorChatLoreSelection = {
  ids: string[];
  matchedEntityCount: number;
  includedEntityCount: number;
  omittedEntityCount: number;
};
export type EditorChatLoreAccumulator = {
  schemaVersion: 1;
  terms: { term: string; id: string; global: boolean; reference: EditorChatReference | null }[];
};
export function preferredEditorChatTerms(
  entities: EditorChatMatcherEntity[],
): Map<string, Required<EditorChatMatcherEntity>>;
export function findEditorChatLoreMatches(
  text: string,
  entities: EditorChatMatcherEntity[],
): EditorChatLoreMatch[];
export function selectEditorChatLore(matches: EditorChatLoreMatch[]): EditorChatLoreSelection;
export function createEditorChatLoreAccumulator(): EditorChatLoreAccumulator;
export function advanceEditorChatLoreAccumulator(
  text: string,
  accumulator: EditorChatLoreAccumulator,
  entities: EditorChatMatcherEntity[],
): EditorChatLoreAccumulator;
export function finishEditorChatLoreAccumulator(
  text: string,
  accumulator: EditorChatLoreAccumulator,
): EditorChatLoreSelection & { matches: EditorChatLoreMatch[] };
