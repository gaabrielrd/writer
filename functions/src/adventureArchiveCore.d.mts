export type AdventureCoreSection = 'structure' | 'resources' | 'lore' | 'personas' | 'universe';
export const ADVENTURE_CORE_SECTIONS: readonly AdventureCoreSection[];
export interface AdventureCoreIdentityScope {
  family: string;
  kind?: string;
  parentId?: string | null;
  scope?: string;
}
export function adventureCoreRecordIdentity(
  scope: AdventureCoreIdentityScope,
  id: string,
): Promise<{ kind: string; id: string }>;
export function adventureCoreCounts(section: AdventureCoreSection): Record<string, number>;
export function adventureCoreManifest(
  section: AdventureCoreSection,
  units: number,
  digest: string,
  counts: Record<string, number>,
): {
  schemaVersion: 1;
  section: AdventureCoreSection;
  units: number;
  counts: Record<string, number>;
  digest: string;
};
export function adventureNullPersona(
  scope: string,
  bindingId: string,
): {
  schemaVersion: 1;
  kind: 'persona';
  scope: string;
  bindingId: string;
  personaId: null;
  profile: null;
};

export function adventureCoreDigestSeed(section: AdventureCoreSection): string;
export function adventureCoreDigestLine(
  identity: { kind: string; id: string },
  manifest: { byteLength: number; chunkCount: number; contentHash: string },
): string;
