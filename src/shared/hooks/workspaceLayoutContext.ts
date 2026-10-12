import { createContext } from 'react';

export interface WorkspaceLayoutState {
  expanded: boolean;
  setExpanded: (value: boolean) => void;
}

export const WorkspaceLayoutContext = createContext<WorkspaceLayoutState>({
  expanded: false,
  setExpanded: () => undefined,
});
