import type {
  AdventureBlockAudience,
  AdventureBlockResource,
  AdventureNarrativeType,
} from './adventureBlock';

export interface AdventureBlockImage {
  imageId: string;
  name: string;
  alt: string;
  caption: string;
}
export interface AdventureBlockImageState {
  revision: number;
  image: AdventureBlockImage | null;
}
export interface SetAdventureBlockImageInput {
  adventureId: string;
  resource: AdventureBlockResource;
  operationId: string;
  expectedRevision: number;
  image: Omit<AdventureBlockImage, 'name'> | null;
}
export interface AdventureScenePreviewItem {
  key: string;
  title: string;
  narrativeType: AdventureNarrativeType;
  html: string;
  image: { imageKey: string; alt: string; caption: string } | null;
}
export interface AdventureScenePreviewPage {
  items: AdventureScenePreviewItem[];
  nextCursor: string | null;
  projectionToken: string;
}
export interface ReadAdventureScenePreviewInput {
  adventureId: string;
  sceneId: string;
  audience: AdventureBlockAudience;
  cursor?: string | null;
  limit?: number;
}
export interface ReadAdventurePreviewImageInput {
  adventureId: string;
  sceneId: string;
  audience: AdventureBlockAudience;
  projectionToken: string;
  imageKey: string;
}
