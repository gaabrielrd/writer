import { useActiveDialog } from '../hooks/useActiveDialog';
import { PageActionProposal } from './PageActionProposal';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router';
import { Sparkles, X } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { Alert, Button, Textarea } from '@/shared/ui';
import { askPageAssistant, loadProjectConception } from '../services/pageAssistantService';
import {
  capturePageCapabilities,
  type PageCapabilitySnapshot,
} from '../services/pageCapabilityBridge';
import { pageAssistantTarget, type PageAssistantReply } from '../model/pageAssistant';
import styles from './PageAssistant.module.css';

export function PageAssistant() {
  const { user } = useAuth();
  const location = useLocation();
  const { pathname } = location;
  const state: unknown = location.state;
  const fromConception = Boolean(
    state &&
    typeof state === 'object' &&
    'conception' in state &&
    typeof state.conception === 'string',
  );
  // Scope every control and response to the precise actor and page. Navigation remounts the session.
  const target = pageAssistantTarget(pathname);
  const sessionKey = target ? `${target.kind}:${target.id}` : pathname;
  return user && !pathname.startsWith('/studio/new') && !pathname.startsWith('/books/new/') ? (
    <AssistantSession
      key={`${user.uid}:${sessionKey}`}
      page={pathname}
      initialOpen={fromConception}
    />
  ) : null;
}
function AssistantSession({ page, initialOpen }: { page: string; initialOpen: boolean }) {
  const dialog = useActiveDialog();
  const [open, setOpen] = useState(initialOpen);
  const [conceptionId] = useState(() =>
    initialOpen ? (pageAssistantTarget(page)?.id ?? null) : null,
  );
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [plan, setPlan] = useState<{
    nonce: number;
    result: PageAssistantReply;
    snapshot: PageCapabilitySnapshot;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const busyRef = useRef(false);
  const requestEpoch = useRef(0);
  const source = useRef<string | null | undefined>(undefined);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!conceptionId) return;
    let active = true;
    void loadProjectConception(conceptionId)
      .then((session) => {
        if (active && session) {
          setMessages(session.messages.map((m) => ({ role: m.role, text: m.text })));
          if (session.contextUnavailable)
            setError('O contexto da concepção mudou. Suas perguntas foram preservadas.');
        }
      })
      .catch(() => {
        if (active)
          setError('Não foi possível retomar a concepção. Você pode pedir ajuda nesta página.');
      });
    return () => {
      active = false;
    };
  }, [conceptionId]);
  useEffect(() => {
    requestEpoch.current++;
    busyRef.current = false;
    // This runs after navigation, so all old page proposals become unusable.
    void Promise.resolve().then(() => {
      if (alive.current) {
        setPlan(null);
        setBusy(false);
      }
    });
  }, [page]);
  useEffect(() => {
    if (open) heading.current?.focus();
  }, [open]);
  async function send(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current || !prompt.trim()) return;
    const ownPrompt = prompt.trim();
    const snapshot = capturePageCapabilities(page, () => alive.current);
    const current = ++requestEpoch.current;
    busyRef.current = true;
    setBusy(true);
    setError('');
    setPlan(null);
    setMessages((old) => [...old, { role: 'user', text: ownPrompt }]);
    setPrompt('');
    try {
      const result = await askPageAssistant({
        prompt: [
          ...messages
            .filter((m) => m.role === 'user')
            .slice(-3)
            .map((m) => m.text),
          ownPrompt,
        ]
          .join('\n')
          .slice(-4000),
        page,
        target: pageAssistantTarget(page),
        capabilities: snapshot.capabilities,
      });
      if (!alive.current || requestEpoch.current !== current) return;
      setMessages((old) => [
        ...(source.current !== undefined && source.current !== result.contextProof
          ? old.filter((m) => m.role === 'user')
          : old),
        { role: 'assistant', text: result.reply },
      ]);
      source.current = result.contextProof;
      if (result.action) setPlan({ result, snapshot, nonce: current });
    } catch (cause) {
      if (alive.current && requestEpoch.current === current) {
        if (
          cause &&
          typeof cause === 'object' &&
          'code' in cause &&
          [
            'functions/permission-denied',
            'functions/failed-precondition',
            'functions/not-found',
          ].includes(String(cause.code))
        ) {
          setMessages((old) => old.filter((m) => m.role === 'user'));
          source.current = undefined;
        }
        setError(cause instanceof Error ? cause.message : 'Não foi possível responder.');
      }
    } finally {
      if (requestEpoch.current === current) {
        busyRef.current = false;
        if (alive.current) setBusy(false);
      }
    }
  }
  const capability = plan?.snapshot.capabilities.find((c) => c.id === plan.result.action?.id);
  const content = (
    <div data-page-assistant className={dialog ? styles.inDialog : undefined}>
      {!open && (
        <Button className={styles.launcher} onClick={() => setOpen(true)}>
          <Sparkles className="icon icon-sm" aria-hidden="true" />
          Assistente da página
        </Button>
      )}
      {open && (
        <aside className={styles.panel} aria-label="Assistente da página">
          <div className={styles.header}>
            <h2 ref={heading} tabIndex={-1}>
              Assistente da página
            </h2>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Fechar assistente da página"
              onClick={() => setOpen(false)}
            >
              <X className="icon" aria-hidden="true" />
            </Button>
          </div>
          <div className={styles.messages} aria-live="polite">
            {messages.length === 0 && (
              <p>
                {initialOpen
                  ? 'Seu projeto está pronto. Podemos continuar a ideia e começar o primeiro conteúdo.'
                  : 'O que você deseja fazer nesta página?'}
              </p>
            )}
            {messages.map((item, index) => (
              <div key={index} className={styles.message}>
                <strong>{item.role === 'user' ? 'Você' : 'Assistente'}</strong>
                <p>{item.text}</p>
              </div>
            ))}
            {error && <Alert variant="destructive">{error}</Alert>}
            {capability && plan?.result.action && (
              <PageActionProposal
                key={plan.nonce}
                action={plan.result.action}
                capability={capability}
                onDiscard={() => setPlan(null)}
                onExecute={(value) => {
                  try {
                    plan.snapshot.execute(capability.id, value);
                    setPlan(null);
                    setOpen(false);
                  } catch (cause) {
                    setError(cause instanceof Error ? cause.message : 'Ação indisponível.');
                    setPlan(null);
                  }
                }}
              />
            )}
            {busy && <p role="status">Preparando sua próxima etapa...</p>}
          </div>
          <form onSubmit={(event) => void send(event)} className={styles.form}>
            <Textarea
              label="Pedido ao assistente da página"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={4000}
              rows={3}
              disabled={busy}
            />
            <Button type="submit" disabled={busy || !prompt.trim()}>
              Enviar pedido
            </Button>
          </form>
        </aside>
      )}
    </div>
  );
  return dialog ? createPortal(content, dialog) : content;
}
