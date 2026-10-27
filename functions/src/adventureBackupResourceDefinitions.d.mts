export type AdventureResourceKind =
  | 'progress'
  | 'checklist'
  | 'arc'
  | 'event'
  | 'milestone'
  | 'arc-order'
  | 'event-order'
  | 'milestone-order'
  | 'narrative-link'
  | 'part-control'
  | 'scene-control'
  | 'scene'
  | 'scene-body'
  | 'scene-planning'
  | 'scene-reference'
  | 'block'
  | 'block-body';
export interface AdventureResourceDefinition {
  readonly path: string;
  readonly parent?: string;
  readonly singleton?: string | boolean;
  readonly sequence?: string;
  readonly rootCollection?: boolean;
  readonly control?: boolean;
  readonly optional?: boolean;
  readonly owner?: boolean;
  readonly body?: boolean;
  readonly scene?: boolean;
  readonly nativeKind?: string;
  readonly narrativeSource?: boolean;
}
export const ADVENTURE_RESOURCE_DEFINITIONS: Readonly<
  Record<AdventureResourceKind, Readonly<AdventureResourceDefinition>>
>;
export const ADVENTURE_RESOURCE_KINDS: readonly AdventureResourceKind[];

export const ADVENTURE_RESOURCE_FIELDS: Readonly<Record<AdventureResourceKind, readonly string[]>>;
