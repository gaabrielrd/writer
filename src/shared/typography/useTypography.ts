import { useContext } from 'react';
import { TypographyContext } from './TypographyContext';

export function useTypography() {
  const context = useContext(TypographyContext);
  if (!context) throw new Error('useTypography exige TypographyProvider.');
  return context;
}
