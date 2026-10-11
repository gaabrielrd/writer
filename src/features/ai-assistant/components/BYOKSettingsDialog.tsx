import { useId, useState, type FormEvent } from 'react';
import { Sparkles, CheckCircle2, Trash2 } from 'lucide-react';
import { Alert, Button, Dialog, Input, Dropdown } from '@/shared/ui';
import type { AIProvider, BYOKConfig } from '../model/byokConfig';
import { validateBYOKConfig } from '../model/byokConfig';
import { getBYOKConfig, saveBYOKConfig, clearBYOKConfig } from '../services/byokStorage';
import styles from './BYOKSettingsDialog.module.css';

export interface BYOKSettingsDialogProps {
  embedded?: boolean;
  open: boolean;
  onClose: () => void;
  onConfigChanged?: (config: BYOKConfig) => void;
}

export function BYOKSettingsDialog({
  open,
  onClose,
  onConfigChanged,
  embedded = false,
}: BYOKSettingsDialogProps) {
  const formId = useId();
  const [config, setConfig] = useState<BYOKConfig>(() => getBYOKConfig());
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleProviderChange = (newProvider: AIProvider) => {
    setConfig((prev) => ({
      ...prev,
      provider: newProvider,
    }));
    setError(null);
    setSuccess(false);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const validation = validateBYOKConfig(config);
    if (!validation.isValid) {
      setError(validation.error || 'Configuração inválida.');
      return;
    }

    try {
      saveBYOKConfig(config);
      setSuccess(true);
      setError(null);
      onConfigChanged?.(config);
    } catch (error) {
      setSuccess(false);
      setError(error instanceof Error ? error.message : 'Não foi possível salvar as preferências.');
    }
  };

  const handleResetToDefault = () => {
    try {
      clearBYOKConfig();
    } catch (error) {
      setSuccess(false);
      setError(error instanceof Error ? error.message : 'Não foi possível remover a chave.');
      return;
    }
    const defaultConfig: BYOKConfig = { provider: 'firebase_ai' };
    setConfig(defaultConfig);
    setSuccess(true);
    setError(null);
    onConfigChanged?.(defaultConfig);
  };

  const content = (
    <form id={formId} onSubmit={handleSubmit} className={styles.form}>
      <p className={styles.description}>
        Escolha se deseja usar a cota padrão da plataforma com Gemini 3.7 Flash ou conectar sua
        própria chave de API (BYOK), sujeita aos limites e cobranças do provedor.
      </p>

      {error && <Alert variant="danger">{error}</Alert>}
      {success && (
        <Alert variant="success">
          <CheckCircle2 className="icon icon-sm" aria-hidden="true" />
          Configurações salvas com sucesso!
        </Alert>
      )}

      <Dropdown
        mode="select"
        label="Provedor de IA"
        value={config.provider}
        onValueChange={(nextValue) => handleProviderChange(nextValue as AIProvider)}
        options={[
          {
            value: 'firebase_ai',
            label: 'Firebase AI Logic (Gemini 3.7 Flash — Consome Créditos)',
          },
          {
            value: 'gemini_byok',
            label: 'Google Gemini API (Chave Própria — BYOK)',
          },
          {
            value: 'openai_byok',
            label: 'OpenAI API (Chave Própria — BYOK)',
          },
        ]}
      />

      {config.provider === 'gemini_byok' && (
        <div className={styles.byokFields}>
          <Input
            label="Chave de API do Google Gemini (AI Studio)"
            type="password"
            placeholder="AIzaSy..."
            value={config.geminiApiKey || ''}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                geminiApiKey: e.target.value,
              }))
            }
            required
          />
          <Input
            label="Modelo Personalizado (Opcional)"
            placeholder="gemini-3.7-flash"
            value={config.customModel || ''}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                customModel: e.target.value,
              }))
            }
          />
        </div>
      )}

      {config.provider === 'openai_byok' && (
        <div className={styles.byokFields}>
          <Input
            label="Chave de API da OpenAI"
            type="password"
            placeholder="sk-..."
            value={config.openaiApiKey || ''}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                openaiApiKey: e.target.value,
              }))
            }
            required
          />
          <Input
            label="Modelo Personalizado (Opcional)"
            placeholder="gpt-4o-mini ou gpt-4o"
            value={config.customModel || ''}
            onChange={(e) =>
              setConfig((prev) => ({
                ...prev,
                customModel: e.target.value,
              }))
            }
          />
        </div>
      )}
    </form>
  );
  const actions = (
    <div className={styles.actions}>
      {config.provider !== 'firebase_ai' && (
        <Button type="button" variant="secondary" onClick={handleResetToDefault}>
          <Trash2 className="icon icon-sm" aria-hidden="true" />
          Restaurar Padrão
        </Button>
      )}
      <div className={styles.rightActions}>
        {!embedded && (
          <Button type="button" variant="secondary" onClick={onClose}>
            Fechar
          </Button>
        )}
        <Button type="submit" form={formId}>
          <Sparkles className="icon icon-sm" aria-hidden="true" />
          Salvar Preferências
        </Button>
      </div>
    </div>
  );
  if (embedded)
    return (
      <div>
        {content}
        {actions}
      </div>
    );
  return (
    <Dialog
      open={open}
      title="Configurações de Inteligência Artificial"
      onClose={onClose}
      footer={actions}
    >
      {content}
    </Dialog>
  );
}
