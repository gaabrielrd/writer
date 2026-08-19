import { useState, type FormEvent } from 'react';
import { Sparkles, CheckCircle2, Trash2 } from 'lucide-react';
import { Alert, Button, Dialog, Input, Select } from '@vitru/styleguide';
import type { AIProvider, BYOKConfig } from '../model/byokConfig';
import { validateBYOKConfig } from '../model/byokConfig';
import { getBYOKConfig, saveBYOKConfig, clearBYOKConfig } from '../services/byokStorage';
import styles from './BYOKSettingsDialog.module.css';

export interface BYOKSettingsDialogProps {
  open: boolean;
  onClose: () => void;
  onConfigChanged?: (config: BYOKConfig) => void;
}

export function BYOKSettingsDialog({ open, onClose, onConfigChanged }: BYOKSettingsDialogProps) {
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

    saveBYOKConfig(config);
    setSuccess(true);
    setError(null);
    onConfigChanged?.(config);
  };

  const handleResetToDefault = () => {
    clearBYOKConfig();
    const defaultConfig: BYOKConfig = { provider: 'firebase_ai' };
    setConfig(defaultConfig);
    setSuccess(true);
    setError(null);
    onConfigChanged?.(defaultConfig);
  };

  return (
    <Dialog open={open} title="Configurações de Inteligência Artificial" onClose={onClose}>
      <form onSubmit={handleSubmit} className={styles.form}>
        <p className={styles.description}>
          Escolha se deseja usar a cota padrão da plataforma com Gemini 3.7 Flash ou conectar sua
          própria chave de API (BYOK) para chamadas ilimitadas.
        </p>

        {error && <Alert variant="danger">{error}</Alert>}
        {success && (
          <Alert variant="success">
            <CheckCircle2 className="icon icon-sm" aria-hidden="true" />
            Configurações salvas com sucesso!
          </Alert>
        )}

        <Select
          label="Provedor de IA"
          value={config.provider}
          onChange={(e) => handleProviderChange(e.target.value as AIProvider)}
          options={[
            {
              value: 'firebase_ai',
              label: 'Firebase AI Logic (Gemini 3.7 Flash — Consome Créditos)',
            },
            {
              value: 'gemini_byok',
              label: 'Google Gemini API (Chave Própria — BYOK Ilimitado)',
            },
            {
              value: 'openai_byok',
              label: 'OpenAI API (Chave Própria — BYOK Ilimitado)',
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
              placeholder="gemini-2.5-flash ou gemini-3.7-flash"
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

        <div className={styles.actions}>
          {config.provider !== 'firebase_ai' && (
            <Button
              type="button"
              variant="secondary"
              onClick={handleResetToDefault}
              title="Voltar a usar a cota de créditos do sistema"
            >
              <Trash2 className="icon icon-sm" aria-hidden="true" />
              Restaurar Padrão
            </Button>
          )}
          <div className={styles.rightActions}>
            <Button type="button" variant="secondary" onClick={onClose}>
              Fechar
            </Button>
            <Button type="submit" variant="primary">
              <Sparkles className="icon icon-sm" aria-hidden="true" />
              Salvar Preferências
            </Button>
          </div>
        </div>
      </form>
    </Dialog>
  );
}
