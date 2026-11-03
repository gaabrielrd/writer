import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '@/features/auth';
import { Alert, Button, Textarea } from '@/shared/ui';
import { AssistantDock } from './AssistantDock';
import { PageActionProposal } from './PageActionProposal';
import {
  askPageAssistant,
  inspectPageAssistantContext,
  loadProjectConception,
} from '../services/pageAssistantService';
import {
  capturePageCapabilities,
  type PageCapabilitySnapshot,
} from '../services/pageCapabilityBridge';
import {
  pageContextLabel,
  pageAssistantTarget,
  type PageAssistantReply,
} from '../model/pageAssistant';
import styles from './PageAssistant.module.css';
interface Message {
  scope: string;
  role: 'user' | 'assistant';
  text: string;
  context: string;
  proof?: string | null;
}
function scopeFor(page: string) {
  const target = pageAssistantTarget(page);
  return target ? `${target.kind}:${target.id}` : page;
}
export function PageAssistant() {
  const { user } = useAuth();
  const location = useLocation();
  const state: unknown = location.state;
  const fromConception = Boolean(
    state &&
    typeof state === 'object' &&
    'conception' in state &&
    typeof state.conception === 'string',
  );
  if (user)
    return (
      <AssistantSession
        key={user.uid}
        page={location.pathname}
        initialOpen={fromConception}
        visible={location.pathname !== '/' && location.pathname !== '/login'}
      />
    );
  return location.pathname.startsWith('/read/') ? (
    <AssistantDock context="Leitura · Ajuda geral">
      {() => (
        <p>
          Entre na sua conta para conversar com o assistente.{' '}
          <Link to="/login">Entrar no Writer</Link>
        </p>
      )}
    </AssistantDock>
  ) : null;
}
function AssistantSession({
  page,
  initialOpen,
  visible: surfaceVisible,
}: {
  page: string;
  initialOpen: boolean;
  visible: boolean;
}) {
  const scope = scopeFor(page);
  const context = pageContextLabel(page);
  const [conception, setConception] = useState<{ id: string; page: string } | null>(() => {
    const target = pageAssistantTarget(page);
    return initialOpen && target ? { id: target.id, page } : null;
  });
  const target = pageAssistantTarget(page);
  if (initialOpen && target && (!conception || scopeFor(conception.page) !== scope))
    setConception({ id: target.id, page });
  const [prompt, setPrompt] = useState('');
  const [draftContext, setDraftContext] = useState(context);
  const [messages, setMessages] = useState<Message[]>([]);
  const [plan, setPlan] = useState<{
    nonce: number;
    result: PageAssistantReply;
    snapshot: PageCapabilitySnapshot;
  } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState<{ scope: string; proof: string | null } | null>(null);
  const [checking, setChecking] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const alive = useRef(true);
  const busyRef = useRef(false);
  const requestEpoch = useRef(0);
  const routeEpoch = useRef(0);
  const [observedPage, setObservedPage] = useState(page);
  const [routeVersion, setRouteVersion] = useState(0);
  if (observedPage !== page) {
    setRouteVersion((n) => n + 1);
    setObservedPage(page);
    setPlan(null);
    setVerified(null);
    setError('');
  }
  useLayoutEffect(() => {
    routeEpoch.current = routeVersion;
  }, [routeVersion]);
  useEffect(() => {
    const epoch = requestEpoch;
    alive.current = true;
    return () => {
      alive.current = false;
      epoch.current++;
    };
  }, []);
  useEffect(() => {
    let current = true;
    let sequence = 0;
    const inspect = async () => {
      const check = ++sequence;
      setVerified(null);
      setPlan(null);
      setChecking(true);
      try {
        const proof = await inspectPageAssistantContext(pageAssistantTarget(page));
        if (current && sequence === check)
          setVerified({ scope: scopeFor(page), proof: proof.contextProof });
      } catch {
        if (current && sequence === check)
          setError(
            'Não foi possível reautorizar o contexto. Suas perguntas foram preservadas; confira o acesso e tente novamente.',
          );
      } finally {
        if (current && sequence === check) setChecking(false);
      }
    };
    void inspect();
    const focus = () => {
      void inspect();
    };
    window.addEventListener('focus', focus);
    return () => {
      current = false;
      window.removeEventListener('focus', focus);
    };
  }, [page, attempt]);
  useEffect(() => {
    if (!conception) return;
    let current = true;
    void loadProjectConception(conception.id)
      .then((session) => {
        if (!current || !session) return;
        // Own conception prompts are safe to carry. Derived replies require a proof
        // from this assistant's source protocol and are never promoted from another one.
        const own: Message[] = session.messages
          .filter((m) => m.role === 'user')
          .map((m) => ({
            scope: scopeFor(conception.page),
            role: 'user',
            text: m.text,
            context: pageContextLabel(conception.page),
          }));
        setMessages((old) => [...own, ...old].slice(-100));
        if (session.contextUnavailable)
          setError('O contexto da concepção mudou. Suas perguntas foram preservadas.');
      })
      .catch(() => {
        if (current)
          setError('Não foi possível retomar a concepção. Você pode pedir ajuda nesta página.');
      });
    return () => {
      current = false;
    };
  }, [conception]);
  async function send(event: FormEvent, expand: () => void) {
    event.preventDefault();
    if (busyRef.current || !prompt.trim()) return;
    const ownPrompt = prompt.trim();
    const originEpoch = routeEpoch.current;
    const current = ++requestEpoch.current;
    const snapshot = capturePageCapabilities(
      page,
      () => alive.current && routeEpoch.current === originEpoch,
    );
    const history = messages
      .filter((m) => m.scope === scope && m.role === 'user')
      .slice(-3)
      .map((m) => m.text);
    busyRef.current = true;
    setBusy(context);
    setError('');
    setPlan(null);
    setMessages((old) =>
      [...old, { scope, role: 'user' as const, text: ownPrompt, context }].slice(-100),
    );
    setPrompt('');
    expand();
    try {
      const result = await askPageAssistant({
        prompt: [...history, ownPrompt].join('\n').slice(-4000),
        page,
        target: pageAssistantTarget(page),
        capabilities: snapshot.capabilities,
      });
      if (!alive.current || requestEpoch.current !== current) return;
      setMessages((old) =>
        [
          ...old,
          {
            scope,
            role: 'assistant' as const,
            text: result.reply,
            context,
            proof: result.contextProof,
          },
        ].slice(-100),
      );
      if (routeEpoch.current === originEpoch) {
        setVerified({ scope, proof: result.contextProof });
        if (result.action) setPlan({ result, snapshot, nonce: current });
      }
      // On another page the reply remains in RAM under its original scope. Returning
      // reauthorizes its source before display; old action proposals are never restored.
    } catch (cause) {
      if (alive.current && requestEpoch.current === current) {
        setMessages((old) => old.filter((m) => m.scope !== scope || m.role === 'user'));
        setError(
          `Pedido em ${context}: ${cause instanceof Error ? cause.message : 'Não foi possível responder.'}`,
        );
      }
    } finally {
      if (requestEpoch.current === current) {
        busyRef.current = false;
        if (alive.current) setBusy(null);
      }
    }
  }
  const visible = messages.filter(
    (m) =>
      m.scope === scope &&
      (m.role === 'user' || (verified?.scope === scope && m.proof === verified.proof)),
  );
  const capability =
    verified?.scope === scope && verified.proof === plan?.result.contextProof
      ? plan?.snapshot.capabilities.find((c) => c.id === plan.result.action?.id)
      : undefined;
  return (
    <AssistantDock context={context} initialOpen={initialOpen} visible={surfaceVisible}>
      {(expanded, expand, compact) => (
        <>
          {expanded && (
            <div className={styles.messages} aria-live="polite">
              {!visible.length && (
                <p>
                  O que você deseja fazer nesta página? A escrita e as decisões continuam com você.
                </p>
              )}
              {checking && <p role="status">Conferindo acesso ao contexto…</p>}
              {visible.map((item, index) => (
                <div key={index} className={styles.message}>
                  <strong>{item.role === 'user' ? 'Você' : 'Assistente'}</strong>
                  <small className={styles.meta}> · {item.context}</small>
                  <p>{item.text}</p>
                </div>
              ))}
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
                      compact();
                    } catch (cause) {
                      setError(cause instanceof Error ? cause.message : 'Ação indisponível.');
                      setPlan(null);
                    }
                  }}
                />
              )}
            </div>
          )}
          {busy && <p role="status">Preparando resposta · {busy}</p>}
          {error && (
            <Alert variant="destructive">
              {error}
              <Button
                variant="outline"
                onClick={() => {
                  setError('');
                  setAttempt((n) => n + 1);
                }}
              >
                Conferir contexto novamente
              </Button>
            </Alert>
          )}
          {prompt && draftContext !== context && (
            <p className={styles.meta}>
              Rascunho iniciado em {draftContext}. Ao enviar, será usado o contexto atual: {context}
              .
            </p>
          )}
          <form onSubmit={(event) => void send(event, expand)} className={styles.form}>
            <Textarea
              label="Pedido ao assistente da página"
              value={prompt}
              onChange={(e) => {
                if (!prompt) setDraftContext(context);
                setPrompt(e.target.value);
              }}
              maxLength={4000}
              rows={expanded ? 3 : 1}
            />
            <Button type="submit" disabled={Boolean(busy) || !prompt.trim()}>
              Enviar pedido
            </Button>
          </form>
        </>
      )}
    </AssistantDock>
  );
}
