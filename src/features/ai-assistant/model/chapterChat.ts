import type { LoreContextItem } from './aiPrompt';
import type { WritingPersonaContext } from './persona';
import type { ChatReasoningLevel } from './chatGeneration';

export type ChatContextSource = 'auto' | 'selection' | 'cursor' | 'viewport' | 'chapter';
export interface ChatTarget {
  hash: string;
  from: number;
  to: number;
}
export interface ChatContext {
  source: Exclude<ChatContextSource, 'auto'>;
  text: string;
  surrounding: string;
  target: ChatTarget | null;
  truncated: boolean;
  title: string;
  bookTitle: string;
  persona: WritingPersonaContext;
  lore: (LoreContextItem & { scope?: 'local' | 'global'; details?: string })[];
}
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  state: 'running' | 'done' | 'stopped' | 'error';
  createdAt: number;
  context: ChatContext;
  suggestion?: string;
  provider?: 'platform' | 'byok';
  paid?: boolean;
  error?: string;
}
export interface ChatConversation {
  id: string;
  title: string;
  updatedAt: number;
  draft: string;
  reasoning?: ChatReasoningLevel;
}
export interface ChatPage {
  conversations: ChatConversation[];
  messages: ChatMessage[];
  conversation: ChatConversation | null;
  before: number | null;
  moreConversations?: boolean;
  platformModel?: string;
}
export interface ChatEditorBridge {
  capture(this: void, source: ChatContextSource): Promise<ChatContext>;
  preview(this: void, source: ChatContextSource): { source: ChatContext['source']; text: string };
  prepare(
    this: void,
    target: ChatTarget,
    text: string,
    replace: boolean,
  ): Promise<{
    before: string;
    after: string;
    commit: () => void;
  }>;
  setBusy(this: void, busy: boolean): void;
  focus(this: void): void;
}
export const CHAT_CONTEXT_LABELS: Record<ChatContextSource, string> = {
  auto: 'Automático',
  selection: 'Seleção',
  cursor: 'Próximo ao cursor',
  viewport: 'Trecho visível',
  chapter: 'Capítulo',
};
export const CHAT_COMMANDS = [
  { name: 'continuar', description: 'Continue a cena com uma sugestão de texto.' },
  { name: 'reescrever', description: 'Reescreva o trecho conforme minhas orientações.' },
  { name: 'estilo', description: 'Aprimore clareza, ritmo e expressão segundo a persona.' },
  { name: 'coerencia', description: 'Verifique a coerência com o lore e cite evidências.' },
  { name: 'revisar', description: 'Revise o trecho e separe explicação de correções.' },
  { name: 'resumir', description: 'Resuma o contexto escolhido.' },
  { name: 'ideias', description: 'Sugira caminhos narrativos como possibilidades.' },
  { name: 'contexto', description: 'Escolha seleção, cursor, viewport ou capítulo.' },
  { name: 'ajuda', description: 'Consulte os comandos disponíveis.' },
] as const;
export function parseChatCommand(input: string) {
  const match = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(input.trim());
  if (!match) return { command: null, instruction: input.trim() };
  const item = CHAT_COMMANDS.find((entry) => entry.name === match[1]);
  if (!item) throw new Error('Comando desconhecido. Digite /ajuda para consultar a lista.');
  return { command: item.name, instruction: match[2]?.trim() ?? '' };
}
export function relevantChatLore(
  entities: (LoreContextItem & { universeId?: string; details?: string })[],
  text: string,
) {
  const normalized = text.normalize('NFKC').toLocaleLowerCase('pt-BR');
  return entities
    .filter((entity) =>
      [entity.name, ...(entity.aliases ?? [])].some(
        (name) =>
          name.trim() && normalized.includes(name.normalize('NFKC').toLocaleLowerCase('pt-BR')),
      ),
    )
    .slice(0, 12)
    .map(({ name, category, summary, aliases, universeId, details }) => ({
      name,
      category,
      summary,
      aliases: aliases ?? [],
      scope: universeId ? ('global' as const) : ('local' as const),
      details: (details ?? '').slice(0, 2000),
    }));
}
export async function chatDocumentHash(html: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(html));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
