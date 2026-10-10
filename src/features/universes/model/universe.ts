export interface Universe {
  id: string;
  authorId: string;
  name: string;
  description: string;
  bookCount: number;
  privacyVersion: number;
  loreVersion: number;
  createdAt: number;
  updatedAt: number;
  deleting?: boolean;
}

export interface UniverseInput {
  name: string;
  description: string;
}
