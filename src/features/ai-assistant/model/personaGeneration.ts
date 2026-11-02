import type { AIPersona } from './persona';
import type { ChatGeneration } from './chatGeneration';
export interface PersonaGenerationContext {
  universe: { id: string; name: string; description: string };
  entities: {
    id: string;
    name: string;
    category: string;
    aliases: string[];
    summary: string;
    details: string;
    structuredDetails: Record<string, string> | null;
    relations: unknown[];
  }[];
  bytes: number;
  contextToken: string;
}
export interface PersonaGenerationResult {
  requestId: string;
  state: 'generating' | 'ready' | 'failed' | 'discarded' | 'accepted';
  generation: ChatGeneration;
  persona?: AIPersona;
  rationale?: string;
  personaId?: string;
}
export type PersonaGenerationEditable = Pick<
  AIPersona,
  'name' | 'description' | 'instructions' | 'traits'
>;
