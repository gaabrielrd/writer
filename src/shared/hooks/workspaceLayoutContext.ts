import { createContext } from 'react';
import type { ContentWidth } from '../services/workspacePreferencesStorage';

export interface WorkspaceLayoutState {
  contentWidth: ContentWidth;
  setContentWidth: (value: ContentWidth) => void;
  expanded: boolean;
  setExpanded: (value: boolean) => void;
}

export const WorkspaceLayoutContext = createContext<WorkspaceLayoutState>({
  contentWidth: 'medium',
  setContentWidth: () => undefined,
  expanded: false,
  setExpanded: () => undefined,
});
