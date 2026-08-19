import type { LoreCategory } from '@/features/lore';

export type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

export interface EditorContent {
  content: string;
  wordCount: number;
  updatedAt: number;
}

export interface MentionOption {
  id: string;
  name: string;
  category: LoreCategory;
  summary: string;
}
