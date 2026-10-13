import { MAX_PANEL_PERCENT, MIN_PANEL_PERCENT } from './workspacePreferences';

export const WORKSPACE_HANDLE_WIDTH = 8;
export const MIN_MANUSCRIPT_WIDTH = 400;
export const MIN_SIDE_PANEL_WIDTH = 280;

export function workspaceGeometry(width: number, viewport: number) {
  const available = Math.max(0, Number.isFinite(width) ? width - WORKSPACE_HANDLE_WIDTH : 0);
  const min = Math.max(
    MIN_PANEL_PERCENT,
    Math.ceil((MIN_SIDE_PANEL_WIDTH / available) * 1000) / 10,
  );
  const max = Math.min(
    MAX_PANEL_PERCENT,
    Math.floor(((available - MIN_MANUSCRIPT_WIDTH) / available) * 1000) / 10,
  );
  const stacked =
    viewport <= 760 || available < MIN_MANUSCRIPT_WIDTH + MIN_SIDE_PANEL_WIDTH || min > max;
  return {
    stacked,
    available,
    min: stacked ? MIN_PANEL_PERCENT : min,
    max: stacked ? MAX_PANEL_PERCENT : max,
  };
}
