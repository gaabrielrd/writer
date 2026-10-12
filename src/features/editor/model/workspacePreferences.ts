export interface WorkspacePreferences {
  panelPercent: number;
}

export const DEFAULT_PANEL_PERCENT = 40;
export const MIN_PANEL_PERCENT = 20;
export const MAX_PANEL_PERCENT = 70;

export function validPanelPercent(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= MIN_PANEL_PERCENT &&
    value <= MAX_PANEL_PERCENT
  );
}

export function parseWorkspacePreferences(value: unknown): WorkspacePreferences {
  if (typeof value === 'object' && value !== null && 'version' in value) {
    if (value.version === 1 && 'panelPercent' in value && validPanelPercent(value.panelPercent))
      return { panelPercent: value.panelPercent };
    if (value.version === 0 && 'widthPercent' in value && validPanelPercent(value.widthPercent))
      return { panelPercent: value.widthPercent };
  }
  return { panelPercent: DEFAULT_PANEL_PERCENT };
}
