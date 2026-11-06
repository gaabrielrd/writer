import { useCallback, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { readTypography, saveTypography as persistTypography } from '../services/typographyStorage';
import { TypographyContext } from './TypographyContext';
import { fontStack, typographyFonts, type TypographyPreferences } from './typography';

export function TypographyProvider({ uid, children }: { uid: string | null; children: ReactNode }) {
  return (
    <TypographySession key={uid === null ? 'anonymous' : 'user:' + uid} uid={uid}>
      {children}
    </TypographySession>
  );
}

function TypographySession({ uid, children }: { uid: string | null; children: ReactNode }) {
  const [preferences, setPreferences] = useState(() => readTypography(uid));
  const [preview, previewTypography] = useState<TypographyPreferences | null>(null);
  const active = preview ?? preferences;
  useLayoutEffect(() => {
    const root = document.documentElement;
    const fonts = typographyFonts(active);
    root.style.setProperty('--font-display', fontStack(fonts.titles));
    root.style.setProperty('--font-sans', fontStack(fonts.interface));
    root.style.setProperty('--font-reading', fontStack(fonts.editor));
    root.setAttribute('data-typography-preset', active.preset);
    return () => {
      for (const token of ['--font-display', '--font-sans', '--font-reading'])
        root.style.removeProperty(token);
      root.removeAttribute('data-typography-preset');
    };
  }, [active]);
  const saveTypography = useCallback(
    (value: TypographyPreferences) => {
      persistTypography(uid, value);
      setPreferences(value);
      previewTypography(null);
    },
    [uid],
  );
  const value = useMemo(
    () => ({ preferences, previewTypography, saveTypography }),
    [preferences, saveTypography],
  );
  return <TypographyContext.Provider value={value}>{children}</TypographyContext.Provider>;
}
