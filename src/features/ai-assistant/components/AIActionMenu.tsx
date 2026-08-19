import { useState } from 'react';
import {
  Sparkles,
  Feather,
  Search,
  Wand2,
  Copy,
  Plus,
  Replace,
  Settings,
  Check,
} from 'lucide-react';
import { Alert, Button, Dialog, Input, LoadingState } from '@vitru/styleguide';
import { buildActionPrompt, type AIActionType, type LoreContextItem } from '../model/aiPrompt';
import { getBYOKConfig } from '../services/byokStorage';
import { generateAIResponse } from '../services/aiClient';
import { deductCredit } from '../services/creditsService';
import styles from './AIActionMenu.module.css';

export interface AIActionMenuProps {
  selectedText?: string;
  onGetSelectedText?: () => string;
  loreEntities?: LoreContextItem[];
  userId?: string | null;
  userCredits?: number;
  onCreditDeducted?: (newCredits: number) => void;
  onShowOutOfCredits?: () => void;
  onInsertText: (text: string) => void;
  onReplaceSelection: (text: string) => void;
  onOpenBYOKSettings: () => void;
}

export function AIActionMenu({
  selectedText = '',
  onGetSelectedText,
  loreEntities = [],
  userId,
  userCredits = 0,
  onCreditDeducted,
  onShowOutOfCredits,
  onInsertText,
  onReplaceSelection,
  onOpenBYOKSettings,
}: AIActionMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeAction, setActiveAction] = useState<AIActionType>('continue');
  const [customInstruction, setCustomInstruction] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [capturedSelection, setCapturedSelection] = useState(selectedText);

  const handleOpen = () => {
    const currentSel = onGetSelectedText ? onGetSelectedText() : selectedText;
    setCapturedSelection(currentSel);
    setIsOpen(true);
  };

  const handleExecuteAction = async (actionType: AIActionType) => {
    const byok = getBYOKConfig();
    const isUsingBYOK = byok.provider !== 'firebase_ai';

    if (!isUsingBYOK && userCredits <= 0) {
      setIsOpen(false);
      onShowOutOfCredits?.();
      return;
    }

    setActiveAction(actionType);
    setIsLoading(true);
    setError(null);
    setResultText(null);
    setCopied(false);

    try {
      const textToUse =
        capturedSelection ||
        (onGetSelectedText ? onGetSelectedText() : selectedText) ||
        'Contexto da cena atual';

      const { prompt, systemInstruction } = buildActionPrompt({
        action: actionType,
        selectedText: textToUse,
        loreEntities,
        customInstruction,
      });

      const response = await generateAIResponse({
        prompt,
        systemInstruction,
        byokConfig: byok,
      });

      setResultText(response);

      // Debita 1 crédito se não BYOK
      if (!isUsingBYOK && userId) {
        try {
          const newTotal = await deductCredit(userId, 1);
          onCreditDeducted?.(newTotal);
        } catch {
          // Erro no débito
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao executar ação de IA');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!resultText) return;
    try {
      await navigator.clipboard.writeText(resultText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Falha no clipboard
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        onClick={handleOpen}
        title="Assistente Criativo de IA (Gemini 3.7 Flash)"
        aria-label="Abrir Assistente Criativo de IA"
      >
        <Sparkles className="icon icon-sm" aria-hidden="true" />
        <span>Assistente IA</span>
      </Button>

      <Dialog open={isOpen} title="Assistente Criativo de IA" onClose={() => setIsOpen(false)}>
        <div className={styles.container}>
          <div className={styles.actionButtons}>
            <button
              type="button"
              className={`${styles.actionCard} ${activeAction === 'continue' ? styles.actionCardActive : ''}`}
              onClick={() => void handleExecuteAction('continue')}
              disabled={isLoading}
            >
              <Wand2 className="icon icon-sm" aria-hidden="true" />
              <div className={styles.actionCardInfo}>
                <strong>Continuar Cena</strong>
                <span>Expande a narrativa mantendo tom e personagens</span>
              </div>
            </button>

            <button
              type="button"
              className={`${styles.actionCard} ${activeAction === 'improve_style' ? styles.actionCardActive : ''}`}
              onClick={() => void handleExecuteAction('improve_style')}
              disabled={isLoading}
            >
              <Feather className="icon icon-sm" aria-hidden="true" />
              <div className={styles.actionCardInfo}>
                <strong>Aprimorar Estilo</strong>
                <span>Enriquece sensorialidade e ritmo da prosa</span>
              </div>
            </button>

            <button
              type="button"
              className={`${styles.actionCard} ${activeAction === 'check_consistency' ? styles.actionCardActive : ''}`}
              onClick={() => void handleExecuteAction('check_consistency')}
              disabled={isLoading}
            >
              <Search className="icon icon-sm" aria-hidden="true" />
              <div className={styles.actionCardInfo}>
                <strong>Coerência com Lore</strong>
                <span>Verifica compatibilidade com o compêndio</span>
              </div>
            </button>
          </div>

          <div className={styles.customPromptRow}>
            <Input
              label="Ou dê uma instrução personalizada à IA"
              placeholder="Ex: Torne o diálogo mais irônico, descreva a iluminação..."
              value={customInstruction}
              onChange={(e) => setCustomInstruction(e.target.value)}
              disabled={isLoading}
            />
            <Button
              variant="primary"
              onClick={() => void handleExecuteAction('custom')}
              disabled={isLoading || !customInstruction.trim()}
            >
              Executar
            </Button>
          </div>

          {isLoading && (
            <div className={styles.loadingWrapper}>
              <LoadingState label="Consultando inteligência artificial..." />
            </div>
          )}

          {error && <Alert variant="danger">{error}</Alert>}

          {resultText && !isLoading && (
            <div className={styles.resultBox}>
              <div className={styles.resultHeader}>
                <strong className={styles.resultTitle}>Sugestão da IA</strong>
                <span className={styles.resultSubtitle}>Revise antes de aplicar</span>
              </div>
              <p className={styles.resultContent}>{resultText}</p>

              <div className={styles.resultActions}>
                <Button
                  variant="primary"
                  onClick={() => {
                    if (capturedSelection.trim()) {
                      onReplaceSelection(resultText);
                    } else {
                      onInsertText(resultText);
                    }
                    setIsOpen(false);
                  }}
                >
                  {capturedSelection.trim() ? (
                    <>
                      <Replace className="icon icon-sm" aria-hidden="true" />
                      Substituir Seleção
                    </>
                  ) : (
                    <>
                      <Plus className="icon icon-sm" aria-hidden="true" />
                      Inserir no Texto
                    </>
                  )}
                </Button>

                <Button variant="secondary" onClick={() => void handleCopy()}>
                  {copied ? (
                    <>
                      <Check className="icon icon-sm" aria-hidden="true" />
                      Copiado!
                    </>
                  ) : (
                    <>
                      <Copy className="icon icon-sm" aria-hidden="true" />
                      Copiar
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          <div className={styles.footer}>
            <Button
              variant="secondary"
              onClick={() => {
                setIsOpen(false);
                onOpenBYOKSettings();
              }}
            >
              <Settings className="icon icon-sm" aria-hidden="true" />
              Configurar Chave Própria (BYOK)
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
