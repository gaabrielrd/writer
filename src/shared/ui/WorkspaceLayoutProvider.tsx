import { useMemo, useState, type ReactNode } from 'react';
import { WorkspaceLayoutContext } from '../hooks/workspaceLayoutContext';

export function WorkspaceLayoutProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const state = useMemo(() => ({ expanded, setExpanded }), [expanded]);
  return (
    <WorkspaceLayoutContext.Provider value={state}>{children}</WorkspaceLayoutContext.Provider>
  );
}
