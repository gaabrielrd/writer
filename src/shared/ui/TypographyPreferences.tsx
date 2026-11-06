import { useEffect, useState } from 'react';
import {
  FONT_FAMILIES,
  TYPOGRAPHY_PRESETS,
  fontStack,
  isFontFamily,
  typographyFonts,
  useTypography,
  type TypographyFonts,
} from '../typography';
import { Alert } from './Alert';
import { Button } from './Button';
import { Dropdown } from './Dropdown';
import styles from './TypographyPreferences.module.css';

const roles = [
  { id: 'titles', label: 'Fonte dos títulos' },
  { id: 'interface', label: 'Fonte da interface' },
  { id: 'editor', label: 'Fonte do editor de texto' },
] as const;

export function TypographyPreferences() {
  const { preferences, previewTypography, saveTypography } = useTypography();
  const [draft, setDraft] = useState(preferences);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(preferences);
  const fonts = typographyFonts(draft);
  useEffect(() => {
    previewTypography(dirty ? draft : null);
    return () => previewTypography(null);
  }, [draft, dirty, previewTypography]);
  const updateFont = (role: keyof TypographyFonts, value: string) => {
    if (!isFontFamily(value)) return;
    setDraft({ ...draft, preset: 'custom', customFonts: { ...fonts, [role]: value } });
    setError('');
    setMessage('');
  };
  return (
    <div className={styles.panel}>
      <p className={styles.hint}>
        Escolha uma combinação literária ou personalize títulos, interface e editor. A prévia
        acompanha todo o Writer; salve para manter a escolha nesta conta e neste navegador.
      </p>
      <Dropdown
        mode="select"
        label="Preset de fontes"
        value={draft.preset}
        options={[
          ...TYPOGRAPHY_PRESETS.map((p) => ({ value: p.id, label: p.name })),
          { value: 'custom', label: 'Personalizado' },
        ]}
        onValueChange={(value) => {
          const preset = TYPOGRAPHY_PRESETS.find((p) => p.id === value);
          if (value !== 'custom' && !preset) return;
          setDraft({ ...draft, preset: preset?.id ?? 'custom' });
          setError('');
          setMessage('');
        }}
      />
      <p className={styles.hint}>
        {draft.preset === 'custom'
          ? 'Sua combinação com as dez fontes do estudo literário.'
          : TYPOGRAPHY_PRESETS.find((p) => p.id === draft.preset)?.description}
      </p>
      <div className={styles.fonts}>
        {roles.map((role) => (
          <Dropdown
            key={role.id}
            mode="select"
            label={role.label}
            value={fonts[role.id]}
            options={FONT_FAMILIES.map((family) => ({ value: family, label: family }))}
            onValueChange={(value) => updateFont(role.id, value)}
          />
        ))}
      </div>
      <div className={styles.sample} aria-label="Prévia da tipografia">
        <h3 style={{ fontFamily: fontStack(fonts.titles) }}>A memória das coisas pequenas</h3>
        <p className={styles.prose} style={{ fontFamily: fontStack(fonts.editor) }}>
          Quando Clara voltou à casa, o mar ainda estava no mesmo lugar. Parecia uma gentileza:
          depois de tantos anos, alguma coisa havia decidido esperá-la.
        </p>
        <p className={styles.prose} style={{ fontFamily: fontStack(fonts.editor) }}>
          — Você voltou às 23h? — perguntou João. <em>Talvez amanhã tudo faça sentido</em>, pensou
          Clara. Sobre a mesa, a anotação dizia: <strong>não esquecer a bússola</strong>.
        </p>
        <p className={styles.hint} style={{ fontFamily: fontStack(fonts.interface) }}>
          Capítulo 3 · Manuscrito · Compêndio
        </p>
      </div>
      <div className={styles.actions}>
        <Button
          disabled={!dirty}
          onClick={() => {
            try {
              saveTypography(draft);
              setError('');
              setMessage('Fontes salvas neste navegador.');
            } catch {
              setError(
                'Não foi possível salvar as fontes neste navegador. Seus ajustes continuam na prévia; tente novamente ou cancele.',
              );
            }
          }}
        >
          Salvar fontes
        </Button>
        <Button
          variant="ghost"
          disabled={!dirty}
          onClick={() => {
            setDraft(preferences);
            setError('');
            setMessage('');
          }}
        >
          Cancelar prévia
        </Button>
      </div>
      {dirty && (
        <p className={styles.hint}>
          Prévia em andamento. Sair desta página descarta os ajustes não salvos.
        </p>
      )}
      {error && <Alert variant="destructive">{error}</Alert>}
      {message && <p role="status">{message}</p>}
    </div>
  );
}
