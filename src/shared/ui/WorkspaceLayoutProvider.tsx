import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  readContentWidth,
  saveContentWidth,
  type ContentWidth,
} from '../services/workspacePreferencesStorage';
import { WorkspaceLayoutContext } from '../hooks/workspaceLayoutContext';

export function WorkspaceLayoutProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const [contentWidth, setWidth] = useState(readContentWidth);
  const setContentWidth = useCallback((value: ContentWidth) => {
    setWidth(value);
    saveContentWidth(value);
  }, []);
  const state = useMemo(
    () => ({ expanded, setExpanded, contentWidth, setContentWidth }),
    [expanded, contentWidth, setContentWidth],
  );
  return (
    <WorkspaceLayoutContext.Provider value={state}>{children}</WorkspaceLayoutContext.Provider>
  );
}
