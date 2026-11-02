import { useId, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import { Button, Input, FormSection, Alert, Dropdown, Slider } from '@/shared/ui';
import { type ColorToken, type ThemePalette } from '@/shared/theme';
import {
  generatePalette,
  backgroundSettings,
  isHex,
  paletteIssues,
  repairPalette,
  STYLES,
  TOKEN_GROUPS,
  TOKEN_LABELS,
  type CustomTheme,
} from '../model/customTheme';
import styles from './themes.module.css';
const STYLE_LABELS = { neutral: 'Neutra', tonal: 'Tonal', expressive: 'Expressiva' };
const STYLE_DESCRIPTIONS = {
  neutral: 'Superfícies neutras e ações em destaque.',
  tonal: 'Um toque de cor nos fundos e superfícies.',
  expressive: 'Mais cor nas seleções e áreas secundárias.',
};
function ColorField({
  label,
  value,
  onChange,
  modified = false,
  onRestore,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  modified?: boolean;
  onRestore?: () => void;
}) {
  const [text, setText] = useState(value);
  const [previous, setPrevious] = useState(value);
  if (previous !== value) {
    setPrevious(value);
    setText(value);
  }
  return (
    <div className={styles.colorField}>
      <div className={styles.colorControls}>
        <div className={styles.colorPicker}>
          <Input
            type="color"
            aria-label={'Escolher cor: ' + label}
            title={'Escolher cor: ' + label}
            value={value}
            onChange={(event) => {
              const color = event.target.value.toLowerCase();
              setText(color);
              onChange(color);
            }}
          />
        </div>
        <Input
          label={label}
          value={text}
          required
          pattern="#[a-fA-F0-9]{6}"
          maxLength={7}
          error={!isHex(text) ? 'Use # e seis dígitos hexadecimais.' : undefined}
          onChange={(event) => {
            setText(event.target.value);
            if (isHex(event.target.value)) onChange(event.target.value.toLowerCase());
          }}
        />
      </div>
      {onRestore && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={'Restaurar ' + label}
          disabled={!modified}
          onClick={onRestore}
        >
          <RotateCcw className="icon icon-sm" aria-hidden="true" />
        </Button>
      )}
      {modified && <span className={styles.override}>Personalizado</span>}
    </div>
  );
}
export function ThemeEditor({
  draft,
  onChange,
  onSubmit,
  formId,
  onCompare,
  comparing,
}: {
  draft: CustomTheme;
  onChange: (t: CustomTheme) => void;
  onSubmit: () => void;
  formId: string;
  onCompare: () => void;
  comparing: boolean;
}) {
  const id = useId();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const issues = paletteIssues(draft.palette);
  const update = (patch: Partial<CustomTheme>) => {
    const next: CustomTheme = {
      ...draft,
      ...backgroundSettings(draft),
      generatorVersion: 2,
      ...patch,
    };
    next.palette = {
      ...generatePalette(next.base, next.highlight, next.style, backgroundSettings(next)),
      ...next.overrides,
    };
    onChange(next);
  };
  const override = (token: ColorToken, value: string) =>
    update({ overrides: { ...draft.overrides, [token]: value } });
  const restore = (token: ColorToken) => {
    const overrides = { ...draft.overrides };
    delete overrides[token];
    update({ overrides });
  };
  const [confirmReset, setConfirmReset] = useState(false);
  const overrideCount = Object.keys(draft.overrides).length;
  return (
    <form
      id={formId}
      className={styles.editor}
      onInvalidCapture={(event) => {
        const invalidInput = event.target;
        if (invalidInput instanceof HTMLInputElement && invalidInput.closest('[hidden]')) {
          event.preventDefault();
          setAdvancedOpen(true);
          requestAnimationFrame(() => invalidInput.focus());
        }
      }}
      onSubmit={(e) => {
        e.preventDefault();
        if (!issues.length) onSubmit();
      }}
    >
      <p className={styles.description}>
        Navegue pelo Writer para experimentar sua paleta. A prévia só é salva ao confirmar.
      </p>
      <Input
        aria-label="Nome do tema"
        placeholder="Nome"
        maxLength={40}
        required
        value={draft.name}
        onChange={(e) => onChange({ ...draft, name: e.target.value })}
      />
      <Dropdown
        mode="select"
        aria-label="Base do tema"
        value={draft.base}
        onValueChange={(value) => update({ base: value as CustomTheme['base'] })}
        options={[
          { value: 'light', label: 'Claro' },
          { value: 'dark', label: 'Escuro' },
        ]}
      />
      <div className={styles.backgroundControls}>
        <Slider
          label="Intensidade"
          value={backgroundSettings(draft).backgroundIntensity}
          low={draft.base === 'dark' ? 'Preto' : 'Branco'}
          high={draft.base === 'dark' ? 'Cinza-escuro' : 'Cinza-claro'}
          onValueChange={(backgroundIntensity) => {
            const overrides = { ...draft.overrides };
            delete overrides.background;
            update({ backgroundIntensity, overrides });
          }}
        />
        <div className={styles.backgroundHue}>
          <Input
            type="color"
            aria-label="Matiz do fundo"
            title="Escolher matiz do fundo"
            value={backgroundSettings(draft).backgroundHue}
            onChange={(event) => {
              const overrides = { ...draft.overrides };
              delete overrides.background;
              update({ backgroundHue: event.target.value.toLowerCase(), overrides });
            }}
          />
        </div>
      </div>
      <ColorField
        label="Cor de destaque"
        value={draft.highlight}
        onChange={(highlight) => update({ highlight })}
      />
      <div className={styles.swatches} aria-label="Cores de destaque sugeridas">
        {['#8a5830', '#28795a', '#3567b7', '#9252a1', '#b74356', '#967000'].map((color) => (
          <Button
            type="button"
            key={color}
            variant="ghost"
            size="icon"
            aria-label={'Usar destaque ' + color}
            onClick={() => update({ highlight: color })}
          >
            <span className={styles.swatch} style={{ backgroundColor: color }} />
          </Button>
        ))}
      </div>
      <fieldset className={styles.suggestions}>
        <legend>Compare as sugestões</legend>
        {STYLES.map((style) => {
          const palette = {
            ...generatePalette(draft.base, draft.highlight, style, backgroundSettings(draft)),
            ...draft.overrides,
          };
          return (
            <Button
              type="button"
              key={style}
              variant="ghost"
              className={styles.suggestion}
              aria-pressed={draft.style === style}
              aria-describedby={id + style}
              onClick={() => update({ style })}
            >
              <span
                className={styles.mini}
                style={{ backgroundColor: palette.background, color: palette.foreground }}
              >
                <span style={{ backgroundColor: palette.card, color: palette['card-foreground'] }}>
                  Aa{' '}
                  <span
                    style={{
                      backgroundColor: palette.primary,
                      color: palette['primary-foreground'],
                    }}
                  >
                    Ação
                  </span>
                </span>
                <span style={{ borderColor: palette.input }}>Campo</span>
                <span
                  style={{ backgroundColor: palette.accent, color: palette['accent-foreground'] }}
                >
                  Seleção
                </span>
              </span>
              <span>
                <strong>
                  {STYLE_LABELS[style]}{' '}
                  {draft.style === style && <Check className="icon icon-sm" aria-hidden="true" />}
                </strong>
                <span id={id + style}>{STYLE_DESCRIPTIONS[style]}</span>
              </span>
            </Button>
          );
        })}
      </fieldset>
      <Button type="button" variant="outline" aria-pressed={comparing} onClick={onCompare}>
        {comparing ? 'Voltar à prévia' : 'Comparar com o tema anterior'}
      </Button>
      {overrideCount > 0 && (
        <p role="status">{overrideCount} ajustes manuais preservados ao trocar a sugestão.</p>
      )}
      <FormSection
        title="Modo avançado"
        description="Ajuste fino das 24 cores"
        open={advancedOpen}
        onOpenChange={setAdvancedOpen}
      >
        <div className={styles.editor}>
          {TOKEN_GROUPS.map((group) => (
            <fieldset className={styles.tokenGroup} key={group.title}>
              <legend>{group.title}</legend>
              {group.tokens.map((token) => (
                <div key={token}>
                  <ColorField
                    label={TOKEN_LABELS[token]}
                    value={draft.palette[token]}
                    onChange={(value) => override(token, value)}
                    modified={token in draft.overrides}
                    onRestore={() => restore(token)}
                  />
                  <code className={styles.tokenName}>--{token}</code>
                </div>
              ))}
            </fieldset>
          ))}
          {confirmReset ? (
            <Alert>
              <p>Restaurar todos os ajustes manuais?</p>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  update({ overrides: {} });
                  setConfirmReset(false);
                }}
              >
                Restaurar ajustes
              </Button>
              <Button type="button" variant="ghost" onClick={() => setConfirmReset(false)}>
                Manter ajustes
              </Button>
            </Alert>
          ) : (
            <Button
              type="button"
              variant="outline"
              disabled={!overrideCount}
              onClick={() => setConfirmReset(true)}
            >
              Restaurar todos os ajustes
            </Button>
          )}
        </div>
      </FormSection>
      {issues.length > 0 && (
        <Alert variant="warning">
          <div>
            <p>Algumas cores precisam de mais contraste para salvar.</p>
            <ul>
              {issues.map((issue) => (
                <li key={issue.a + issue.b}>
                  {TOKEN_LABELS[issue.a]} / {TOKEN_LABELS[issue.b]}
                </li>
              ))}
            </ul>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const palette = repairPalette(draft.palette);
                const overrides: Partial<ThemePalette> = { ...draft.overrides };
                for (const token of Object.keys(palette) as ColorToken[])
                  if (palette[token] !== draft.palette[token]) overrides[token] = palette[token];
                onChange({ ...draft, palette, overrides });
              }}
            >
              Corrigir automaticamente
            </Button>
          </div>
        </Alert>
      )}
    </form>
  );
}
