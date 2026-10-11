import { useEffect, useRef, useState } from 'react';
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
import { Alert, Button, Dialog, Input, LoadingState } from '@/shared/ui';
import { buildActionPrompt, type AIActionType, type LoreContextItem } from '../model/aiPrompt';
import { getBYOKConfig, subscribeBYOKConfig } from '../services/byokStorage';
import { usesOwnKey, type BYOKConfig } from '../model/byokConfig';
import { generateAIResponse } from '../services/aiClient';
import { deductCredit } from '../services/creditsService';
import styles from './AIActionMenu.module.css';

export interface AIActionMenuProps {
  selectedText?: string;
  onGetSelectedText?: () => string;
  onGetContextText?: () => string;
  onCanApplyResult?: () => boolean;
  onApplyingChange?: (busy: boolean) => void;
  loreEntities?: LoreContextItem[];
  userId?: string | null;
  userCredits?: number;
  onCreditDeducted?: (newCredits: number) => void;
  onShowOutOfCredits?: () => void;
  onInsertText: (text: string) => boolean | void;
  onReplaceSelection: (text: string) => boolean | void;
  onOpenBYOKSettings: () => void;
}

export function AIActionMenu({
  selectedText = '',
  onGetSelectedText,
  onGetContextText,
  onCanApplyResult,
  onApplyingChange,
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
  const [isApplying, setIsApplying] = useState(false);
  const applyingRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const resultConfigRef = useRef<BYOKConfig | null>(null);
  const usedResultRef = useRef(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () =>
      subscribeBYOKConfig(() => {
        controllerRef.current?.abort();
        resultConfigRef.current = null;
        setResultText(null);
        setIsLoading(false);
      }),
    [],
  );

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    },
    [],
  );

  const handleClose = () => {
    if (applyingRef.current) return;
    controllerRef.current?.abort();
    setResultText(null);
    setError(null);
    setIsLoading(false);
    setIsOpen(false);
  };

  const handleOpen = () => {
    const currentSel = onGetSelectedText ? onGetSelectedText() : selectedText;
    setCapturedSelection(currentSel);
    setResultText(null);
    setError(null);
    setIsLoading(false);
    setIsOpen(true);
  };

  const handleExecuteAction = async (actionType: AIActionType) => {
    const byok = getBYOKConfig();
    const isUsingBYOK = usesOwnKey(byok);
    if (applyingRef.current) return;

    if (!isUsingBYOK && userCredits <= 0) {
      setIsOpen(false);
      onShowOutOfCredits?.();
      return;
    }

    if (!isUsingBYOK && !userId) {
      setError('Entre na sua conta para usar os créditos de IA.');
      return;
    }
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    resultConfigRef.current = null;
    usedResultRef.current = false;
    setActiveAction(actionType);
    setIsLoading(true);
    setError(null);
    setResultText(null);
    setCopied(false);

    try {
      const textToUse =
        capturedSelection ||
        (onGetSelectedText ? onGetSelectedText() : selectedText) ||
        onGetContextText?.().slice(-1500) ||
        '';
      if (!textToUse.trim()) {
        throw new Error('Escreva ou selecione um trecho antes de solicitar uma sugestão.');
      }

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
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;
      if (!response.trim()) throw new Error('A IA não retornou uma sugestão. Tente novamente.');
      resultConfigRef.current = byok;
      setResultText(response);
    } catch (err: unknown) {
      if (!controller.signal.aborted) {
        setError(err instanceof Error ? err.message : 'Falha ao executar ação de IA');
      }
    } finally {
      if (!controller.signal.aborted) setIsLoading(false);
    }
  };

  const handleApply = async () => {
    const config = resultConfigRef.current;
    if (!resultText || !config || applyingRef.current || usedResultRef.current) return;
    if (onCanApplyResult && !onCanApplyResult()) {
      setError('O trecho mudou. Solicite uma nova sugestão antes de aplicar.');
      return;
    }
    applyingRef.current = true;
    setIsApplying(true);
    onApplyingChange?.(true);
    setError(null);
    try {
      if (!usesOwnKey(config)) {
        if (!userId) throw new Error('Entre na sua conta para usar os créditos de IA.');
        const newTotal = await deductCredit(userId, 1);
        onCreditDeducted?.(newTotal);
      }
      usedResultRef.current = true;
      if (capturedSelection.trim()) onReplaceSelection(resultText);
      else onInsertText(resultText);
      setResultText(null);
      setIsOpen(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Não foi possível aceitar a sugestão.');
    } finally {
      applyingRef.current = false;
      setIsApplying(false);
      onApplyingChange?.(false);
    }
  };

  const handleCopy = async () => {
    if (!resultText) return;
    try {
      await navigator.clipboard.writeText(resultText);
      setCopied(true);
      copiedTimerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      // Falha no clipboard
    }
  };

  return (
    <>
      <Button
        variant="secondary"
        onClick={handleOpen}
        title="Assistente Criativo de IA"
        aria-label="Abrir Assistente Criativo de IA"
      >
        <Sparkles className="icon icon-sm" aria-hidden="true" />
        <span>Assistente IA</span>
      </Button>

      <Dialog open={isOpen} title="Assistente Criativo de IA" onClose={handleClose}>
        <div className={styles.container}>
          <div className={styles.actionButtons}>
            <button
              type="button"
              className={`${styles.actionCard} ${activeAction === 'continue' ? styles.actionCardActive : ''}`}
              onClick={() => void handleExecuteAction('continue')}
              disabled={isLoading || isApplying}
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
              disabled={isLoading || isApplying}
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
              disabled={isLoading || isApplying}
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
              disabled={isLoading || isApplying}
            />
            <Button
              variant="primary"
              onClick={() => void handleExecuteAction('custom')}
              disabled={isLoading || isApplying || !customInstruction.trim()}
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
                <Button variant="primary" onClick={() => void handleApply()} disabled={isApplying}>
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

                <Button variant="secondary" onClick={() => void handleCopy()} disabled={isApplying}>
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
              disabled={isApplying}
              onClick={() => {
                handleClose();
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
