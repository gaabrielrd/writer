import { createContext } from 'react';
import type { TypographyPreferences } from './typography';

export interface TypographyContextValue {
  preferences: TypographyPreferences;
  previewTypography: (value: TypographyPreferences | null) => void;
  saveTypography: (value: TypographyPreferences) => void;
}
export const TypographyContext = createContext<TypographyContextValue | undefined>(undefined);
