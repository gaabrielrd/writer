export interface LibraryImage {
  id: string;
  name: string;
  url: string;
  createdAt: number;
  useCount: number;
  state?: 'active' | 'deleting';
}
export interface ImagePage {
  migrationPending?: boolean;
  images: LibraryImage[];
  cursor: string | null;
}
