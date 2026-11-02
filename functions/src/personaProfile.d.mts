export interface PersonaTrait {
  id: string;
  name: string;
  description: string;
  low: string;
  high: string;
  value: number;
}
export interface AIPersona {
  id: string;
  schemaVersion: 1;
  name: string;
  description: string;
  instructions: string;
  traits: PersonaTrait[];
  revision: number;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}
export interface TraitOverride {
  traitId: string;
  value: number;
}
export interface PersonaComplement {
  personaId: string;
  overrides: TraitOverride[];
}
export interface WritingPersonaContext {
  instruction: string;
  version: string;
}
export declare const STANDARD_TRAITS: Omit<PersonaTrait, 'value'>[];
export declare const DEFAULT_PERSONAS: AIPersona[];
export declare function isDefaultPersona(id: string): boolean;
export declare function isTraitValue(value: unknown): value is number;
export declare function validatePersona(value: unknown): AIPersona;
export declare function validateComplement(value: unknown): PersonaComplement | null;
export interface ResolvedPersonaProfile {
  base: AIPersona | null;
  chapter: AIPersona | null;
  traits: PersonaTrait[];
  sources: Record<string, 'book' | 'chapter' | 'override'>;
}
export declare function resolvePersonaProfile(
  personas: AIPersona[],
  bookPersonaId?: string | null,
  chapterComplement?: PersonaComplement | null,
): ResolvedPersonaProfile;
export declare function resolveWritingPersona(
  personas: AIPersona[],
  bookPersonaId?: string | null,
  chapterComplement?: PersonaComplement | null,
  scope?: 'book' | 'adventure',
): WritingPersonaContext;
