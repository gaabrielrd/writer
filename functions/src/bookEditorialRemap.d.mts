import type {
  BookEditorialArtifact,
  BookEditorialReference,
  BookEditorialLink,
} from './bookEditorialProtocol.mjs';
export interface BookRestoredEditorialArtifact {
  schemaVersion: 1;
  record: BookEditorialArtifact;
  restoration: {
    execution: 'disabled';
    publication: 'private';
    review: 'required';
    historical: true;
  };
}
export function createBookEditorialRemapper(input: {
  sourceBookId: string;
  bookId: string;
  hashBytes: (bytes: Uint8Array) => string;
  mapResource: (
    kind:
      | 'act'
      | 'chapter'
      | 'scene'
      | 'arc'
      | 'milestone'
      | 'event'
      | 'lore'
      | 'version'
      | 'persona'
      | 'image',
    id: string,
    parentId: string | null,
  ) => string | null;
}): Readonly<{
  artifact: (raw: unknown) => BookRestoredEditorialArtifact;
  link: (raw: unknown) => BookEditorialLink;
  reference: (raw: unknown) => BookEditorialReference;
  identity: (kind: 'artifact' | 'link', original: string) => string;
}>;
