import { useContext } from 'react';
import { WorkspaceLayoutContext } from './workspaceLayoutContext';

export function useWorkspaceLayout() {
  return useContext(WorkspaceLayoutContext);
}
