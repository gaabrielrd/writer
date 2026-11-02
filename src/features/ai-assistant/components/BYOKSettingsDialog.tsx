import { useId, useState, type FormEvent } from 'react';
import { Sparkles, CheckCircle2, Trash2 } from 'lucide-react';
import { Alert, Button, Dialog, Input, Dropdown } from '@/shared/ui';
import {
  PLATFORM_TEXT_MODELS,
  DEFAULT_PLATFORM_MODEL,
  DEFAULT_PLATFORM_REASONING,
} from '../model/chatGeneration';
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
      ...(prev.provider === 'gemini_byok' ? { geminiModel: prev.customModel } : {}),
      ...(prev.provider === 'openai_byok' ? { openaiModel: prev.customModel } : {}),
      customModel:
        newProvider === prev.provider
          ? prev.customModel
          : newProvider === 'gemini_byok'
            ? prev.geminiModel
            : newProvider === 'openai_byok'
              ? prev.openaiModel
              : undefined,
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
    <form
      id={formId}
      onChange={() => setSuccess(false)}
      onSubmit={handleSubmit}
      className={styles.form}
    >
      <p className={styles.description}>
        Use os modelos da plataforma ou conecte sua própria chave de API. As preferências são salvas
        neste navegador. Salvar não gera conteúdo nem consome créditos.
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
        label="Como deseja usar a IA?"
        value={config.provider === 'firebase_ai' ? 'firebase_ai' : 'byok'}
        onValueChange={(value) =>
          handleProviderChange(
            value === 'firebase_ai'
              ? 'firebase_ai'
              : config.geminiApiKey
                ? 'gemini_byok'
                : config.openaiApiKey
                  ? 'openai_byok'
                  : 'gemini_byok',
          )
        }
        options={[
          { value: 'firebase_ai', label: 'Firebase AI Logic' },
          { value: 'byok', label: 'Chave própria — BYOK' },
        ]}
      />
      {config.provider === 'firebase_ai' ? (
        <div className={styles.byokFields}>
          <Dropdown
            mode="select"
            label="Modelo da plataforma"
            value={config.platformModel ?? DEFAULT_PLATFORM_MODEL}
            onValueChange={(platformModel) => {
              setConfig((prev) => ({ ...prev, platformModel }));
              setSuccess(false);
              setError(null);
            }}
            options={PLATFORM_TEXT_MODELS.map((model) => ({ value: model.id, label: model.label }))}
          />
          <p className={styles.description}>
            {
              PLATFORM_TEXT_MODELS.find(
                (model) => model.id === (config.platformModel ?? DEFAULT_PLATFORM_MODEL),
              )?.description
            }
            . O uso da plataforma segue as regras de créditos do Writer.
          </p>
          <Dropdown
            mode="select"
            label="Raciocínio padrão"
            value={config.platformReasoning ?? DEFAULT_PLATFORM_REASONING}
            onValueChange={(value) => {
              setConfig((prev) => ({ ...prev, platformReasoning: value as 'medium' | 'high' }));
              setSuccess(false);
              setError(null);
            }}
            options={[
              { value: 'medium', label: 'Médio' },
              { value: 'high', label: 'Alto' },
            ]}
          />
          <p className={styles.description}>
            Alto permite mais raciocínio antes da resposta e pode aumentar o tempo de espera e o
            custo do provedor. Conversas com uma escolha própria de raciocínio preservam essa
            escolha.
          </p>
        </div>
      ) : (
        <Dropdown
          mode="select"
          label="Provedor BYOK"
          value={config.provider}
          onValueChange={(value) => handleProviderChange(value as AIProvider)}
          options={[
            { value: 'gemini_byok', label: 'Google Gemini API' },
            { value: 'openai_byok', label: 'OpenAI API' },
          ]}
        />
      )}

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
      <Button type="button" variant="secondary" onClick={handleResetToDefault}>
        <Trash2 className="icon icon-sm" aria-hidden="true" />
        Restaurar Padrão
      </Button>
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
