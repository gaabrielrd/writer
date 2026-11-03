import { useOnboarding } from '@/features/onboarding';
import {
  capturePageCapabilities,
  PageActionProposal,
  PageAssistantSurface,
  type PageCapabilitySnapshot,
  type PageAction,
} from '@/features/page-assistant';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { BookOpen, Map, PenLine, ScrollText, Sparkles } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { ImageLibraryPicker, type LibraryImage } from '@/features/image-library';
import { UniverseSelect, UniverseForm } from '@/features/universes';
import {
  AssistedBookError,
  loadAssistedBook,
  requestAssistedBook,
  commitAssistedBook,
  usePersonaLibrary,
  PersonaManager,
  type AssistedSession,
  type AssistedRequest,
  type AssistedProposal,
  type AssistedCommit,
  type AssistedCosts,
  type CreationKind,
} from '@/features/ai-assistant';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  Dropdown,
  FormSection,
  Input,
  LoadingState,
  PageHeader,
  Textarea,
} from '@/shared/ui';
import styles from './NewProjectPage.module.css';

type Method = 'manual' | 'assisted';
const kinds = [
  {
    id: 'book',
    title: 'Livro',
    description: 'Uma história para escrever e publicar.',
    icon: BookOpen,
  },
  {
    id: 'adventure',
    title: 'Aventura',
    description: 'Cenas e desafios para jogar uma história.',
    icon: ScrollText,
  },
  {
    id: 'campaign',
    title: 'Campanha',
    description: 'Uma mesa, suas sessões e preparação.',
    icon: Map,
  },
] as const;
const destination = (kind: CreationKind, id: string) =>
  `/${{ book: 'books', adventure: 'adventures', campaign: 'campaigns' }[kind]}/${encodeURIComponent(id)}`;
export function NewProjectPage() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState label="Carregando sessão..." />;
  if (!user) return <Navigate to="/login" replace />;
  return <ProjectCreationSession key={user.uid} />;
}
function ProjectCreationSession() {
  const { user, loading, updateUserCreditsState } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const onboarding = useOnboarding();
  const library = usePersonaLibrary(user?.uid);
  const [method, setMethod] = useState<Method | null>(null);
  const [kind, setKind] = useState<CreationKind | null>(
    () => kinds.find((item) => item.id === params.get('kind'))?.id ?? null,
  );
  const [universeId, setUniverseId] = useState<string | null>(null);
  const [personaId, setPersonaId] = useState<string | null>(null);
  const [universeForm, setUniverseForm] = useState(false);
  const [personaManager, setPersonaManager] = useState(false);
  const [universeEpoch, setUniverseEpoch] = useState(0);
  const [started, setStarted] = useState(false);
  const [idea, setIdea] = useState('');
  const [message, setMessage] = useState('');
  const [session, setSession] = useState<AssistedSession | null>(null);
  const [resume, setResume] = useState<AssistedSession | null>(null);
  const [lastCreated, setLastCreated] = useState<{ kind: CreationKind; id: string } | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const [costs, setCosts] = useState<AssistedCosts | null>(null);
  const [proposal, setProposal] = useState<AssistedProposal>({
    title: '',
    genre: '',
    synopsis: '',
    coverDirection: '',
    entities: [],
  });
  const [picker, setPicker] = useState(false);
  const [selectedImage, setSelectedImage] = useState<LibraryImage | null>(null);
  const [useGenerated, setUseGenerated] = useState(false);
  const [review, setReview] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggestedPlan, setSuggestedPlan] = useState<{
    snapshot: PageCapabilitySnapshot;
    action: PageAction;
    requestId: string;
  } | null>(null);
  const pendingSnapshot = useRef<PageCapabilitySnapshot | null>(null);
  const [pending, setPending] = useState<AssistedRequest | AssistedCommit | null>(null);
  const lock = useRef(false);
  const epoch = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const [attempt, setAttempt] = useState(0);
  const ownerId = user?.uid;
  useEffect(() => {
    const runtime = epoch;
    const current = ++runtime.current;
    if (ownerId)
      void loadAssistedBook()
        .then((result) => {
          if (epoch.current !== current) return;
          setCosts(result.costs);
          setLastCreated(result.project ?? null);
          if (result.session?.flowVersion === 2) setResume(result.session);
        })
        .catch((cause: unknown) => {
          if (epoch.current === current)
            setError(cause instanceof Error ? cause.message : 'Não foi possível carregar.');
        });
    return () => {
      runtime.current++;
    };
  }, [ownerId, attempt]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  const step = !method ? 0 : !kind ? 1 : !started ? 2 : 3;
  useEffect(() => {
    heading.current?.focus();
  }, [step, review]);
  if (loading) return <LoadingState label="Carregando sessão..." />;
  if (!user) return <Navigate to="/login" replace />;
  const label = kinds.find((item) => item.id === kind)?.title ?? 'projeto';
  const suggestedCapability = suggestedPlan?.snapshot.capabilities.find(
    (c) => c.id === suggestedPlan.action.id,
  );
  function executeSuggestion(value?: string) {
    if (!suggestedPlan || !suggestedCapability) return;
    try {
      suggestedPlan.snapshot.execute(suggestedCapability.id, value);
      setSuggestedPlan(null);
    } catch (cause) {
      setSuggestedPlan(null);
      setError(cause instanceof Error ? cause.message : 'Ação indisponível.');
    }
  }
  const locked = busy || pending !== null;
  const accept = (value: AssistedSession) => {
    setSession(value);
    setProposal(
      value.proposal ?? { title: '', genre: '', synopsis: '', coverDirection: '', entities: [] },
    );
    setCosts(value.costs);
  };
  async function execute(request: AssistedRequest | AssistedCommit) {
    if (lock.current) return;
    const current = epoch.current;
    let snapshot: PageCapabilitySnapshot | null = null;
    if ('action' in request && request.action === 'interview') {
      snapshot = request.capabilities
        ? pendingSnapshot.current
        : capturePageCapabilities(window.location.pathname, () => epoch.current === current);
      if (!request.capabilities && snapshot) request.capabilities = snapshot.capabilities;
      pendingSnapshot.current = snapshot;
      if (!request.proposal && session?.proposal) request.proposal = structuredClone(proposal);
    }
    lock.current = true;
    setBusy(true);
    setSuggestedPlan(null);
    setError('');
    setPending(request);
    try {
      if ('expectedCost' in request) {
        const result = await commitAssistedBook(request);
        if (epoch.current !== current) return;
        updateUserCreditsState(result.credits);
        const target = result.project ?? { kind: 'book' as const, id: result.book.id };
        setPending(null);
        void navigate(destination(target.kind, target.id), { state: { conception: target.id } });
      } else {
        let result = await requestAssistedBook(request);
        if (epoch.current !== current) return;
        if (request.action === 'interview') {
          setSession(result);
          setCosts(result.costs);
          if (
            result.suggestedAction &&
            result.suggestedActionRequestId === request.requestId &&
            snapshot
          )
            setSuggestedPlan({
              snapshot,
              action: result.suggestedAction,
              requestId: request.requestId,
            });
        } else accept(result);
        setPending(null);
        if (request.action === 'start' && result.method === 'manual')
          setProposal((previous) => ({ ...previous, title: result.idea.slice(0, 300) }));
        if (request.action === 'start' && result.method === 'assisted') {
          const next: AssistedRequest = {
            action: 'interview',
            sessionId: result.id,
            revision: result.revision,
            requestId: crypto.randomUUID(),
          };
          setPending(next);
          result = await requestAssistedBook(next);
          if (epoch.current !== current) return;
          accept(result);
          setPending(null);
        }
        if (request.action === 'cover') setUseGenerated(true);
        if (request.action === 'interview') setMessage('');
        if (request.action === 'generate' || request.action === 'save') setReview(true);
      }
    } catch (cause) {
      if (epoch.current !== current) return;
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir.');
      if (cause instanceof AssistedBookError && !cause.uncertain) {
        setPending(null);
        if (cause.contextUnavailable) {
          setSession((old) =>
            old
              ? {
                  ...old,
                  contextUnavailable: true,
                  messages: old.messages.filter((m) => m.role === 'user'),
                  proposal: null,
                  cover: null,
                }
              : null,
          );
          setSuggestedPlan(null);
          setReview(false);
        }
      }
    } finally {
      lock.current = false;
      if (epoch.current === current) setBusy(false);
    }
  }
  async function resumeCreation() {
    if (!resume || lock.current) return;
    const expectedId = resume.id,
      current = epoch.current;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await loadAssistedBook();
      if (epoch.current !== current) return;
      setCosts(result.costs);
      setLastCreated(result.project ?? null);
      const fresh = result.session?.flowVersion === 2 ? result.session : null;
      setResume(fresh);
      if (!fresh || fresh.id !== expectedId) {
        setError('A criação oferecida para retomada mudou. Confira o estado atual.');
        return;
      }
      setMethod(fresh.method ?? 'assisted');
      setKind(fresh.kind ?? 'book');
      setUniverseId(fresh.universeId ?? null);
      setPersonaId(fresh.personaId ?? null);
      setIdea(fresh.idea);
      accept(fresh);
      setStarted(true);
      setReview(Boolean(fresh.proposal));
      setSelectedImage(null);
      setUseGenerated(false);
    } catch (cause) {
      if (epoch.current === current)
        setError(cause instanceof Error ? cause.message : 'Não foi possível retomar.');
    } finally {
      lock.current = false;
      if (epoch.current === current) setBusy(false);
    }
  }
  function start() {
    if (!kind || !method || !idea.trim()) return;
    setStarted(true);
    setSelectedImage(null);
    setUseGenerated(false);
    setProposal({ title: '', genre: '', synopsis: '', coverDirection: '', entities: [] });
    void execute({
      action: 'start',
      flowVersion: 2,
      kind,
      method,
      universeId,
      personaId,
      idea,
      sessionId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      revision: 0,
    });
  }
  function action(action: AssistedRequest['action'], extra: Partial<AssistedRequest> = {}) {
    if (!session || locked) return;
    void execute({
      action,
      sessionId: session.id,
      revision: session.revision,
      requestId: crypto.randomUUID(),
      ...extra,
    });
  }
  const cover = session?.cover;
  const coverValid = Boolean(
    cover &&
    cover.expiresAt > Date.now() &&
    cover.context.title === proposal.title &&
    cover.context.genre === proposal.genre &&
    cover.context.synopsis === proposal.synopsis &&
    cover.context.direction === proposal.coverDirection,
  );
  const total =
    (method === 'manual' ? 0 : (costs?.text ?? 0)) +
    (useGenerated && coverValid ? (costs?.cover ?? 0) : 0);
  function commit() {
    if (!session || locked) return;
    void execute({
      flowVersion: 2,
      sessionId: session.id,
      revision: session.revision,
      proposal: {
        ...proposal,
        genre: proposal.genre || 'Livre',
        synopsis: proposal.synopsis || proposal.title,
      },
      expectedCost: total,
      coverId: useGenerated && coverValid ? cover!.id : null,
      imageId: !useGenerated ? (selectedImage?.id ?? null) : null,
    });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (locked) return;
    if (!started) start();
    else if (message.trim()) action('interview', { message });
  }
  const back = () => {
    if (locked) return;
    if (started) setConfirmDiscard(true);
    else if (kind) setKind(null);
    else setMethod(null);
  };
  return (
    <section className={styles.page}>
      <div data-writer-tour="project-start">
        <PageHeader title="Novo projeto" description="Da primeira ideia às primeiras palavras." />
      </div>
      <p className={styles.meta}>
        Etapa {step + 1} de 4 ·{' '}
        {
          [
            'Como começar',
            'Tipo de projeto',
            'Seu ponto de partida',
            review
              ? 'Revise sua proposta'
              : method === 'manual'
                ? 'Seu projeto'
                : 'Conversa criativa',
          ][step]
        }
      </p>
      {error && (
        <Alert ref={errorRef} tabIndex={-1} variant="destructive">
          <p>{error}</p>
          {pending ? (
            <Button disabled={busy} onClick={() => void execute(pending)}>
              Verificar mesma operação
            </Button>
          ) : !costs ? (
            <Button onClick={() => setAttempt((n) => n + 1)}>Tentar carregar novamente</Button>
          ) : null}
        </Alert>
      )}
      {lastCreated && (
        <Alert title="Último projeto confirmado">
          <Link to={destination(lastCreated.kind, lastCreated.id)}>Abrir projeto confirmado</Link>
        </Alert>
      )}
      {!method && (
        <>
          <h2 ref={heading} tabIndex={-1}>
            Como deseja começar?
          </h2>
          <div className={styles.choices}>
            <Button
              className={styles.choice}
              variant="secondary"
              onClick={() => setMethod('assisted')}
            >
              <Sparkles className="icon" aria-hidden="true" />
              Com ajuda da IA<span>Converse, explore ideias e revise uma proposta.</span>
            </Button>
            <Button
              className={styles.choice}
              variant="secondary"
              onClick={() => setMethod('manual')}
            >
              <PenLine className="icon" aria-hidden="true" />
              Manualmente<span>Comece com o que já tem em mente.</span>
            </Button>
          </div>
          {resume && (
            <Card>
              <p>Você tem uma criação em andamento.</p>
              <Button variant="secondary" disabled={busy} onClick={() => void resumeCreation()}>
                Retomar criação
              </Button>
            </Card>
          )}
        </>
      )}
      {method && !kind && (
        <>
          <h2 ref={heading} tabIndex={-1}>
            O que deseja criar?
          </h2>
          <div className={styles.choices}>
            {[...kinds]
              .sort(
                (a, b) =>
                  Number(Boolean(onboarding?.profile?.interests.includes(b.id))) -
                  Number(Boolean(onboarding?.profile?.interests.includes(a.id))),
              )
              .map(({ id, title, description, icon: Icon }) => (
                <Button
                  key={id}
                  className={styles.choice}
                  variant="secondary"
                  onClick={() => setKind(id)}
                >
                  <Icon className="icon" aria-hidden="true" />
                  {title}
                  <span>{description}</span>
                </Button>
              ))}
          </div>
        </>
      )}
      {kind && !started && (
        <form className={styles.form} onSubmit={submit}>
          <h2 ref={heading} tabIndex={-1}>
            Qual é seu ponto de partida?
          </h2>
          <Textarea
            label={method === 'assisted' ? 'Sua ideia' : 'Ideia ou título inicial'}
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            maxLength={4000}
            required
            rows={3}
          />
          <FormSection
            title="Universo e persona"
            description="Opcional · escolha o cenário e a voz desde o início"
          >
            <UniverseSelect
              key={universeEpoch}
              value={universeId}
              onChange={setUniverseId}
              alwaysShow
              hint="O contexto do universo acompanha a concepção do projeto."
            />
            <Dropdown
              mode="select"
              label="Persona de escrita"
              value={personaId ?? ''}
              onValueChange={(value) => setPersonaId(value || null)}
              options={[
                { value: '', label: 'Sem persona' },
                ...library.personas
                  .filter((p) => !p.archived)
                  .map((p) => ({ value: p.id, label: p.name })),
              ]}
              disabled={library.loading}
            />
            <div className={styles.actions}>
              <Button type="button" variant="secondary" onClick={() => setUniverseForm(true)}>
                Criar universo
              </Button>
              <Button type="button" variant="secondary" onClick={() => setPersonaManager(true)}>
                Criar ou editar persona
              </Button>
            </div>
            {library.error && (
              <Alert variant="warning">
                {library.error}
                <Button type="button" variant="secondary" onClick={library.retry}>
                  Recarregar personas
                </Button>
              </Alert>
            )}
          </FormSection>
          <Button disabled={!costs || !idea.trim()} type="submit">
            {method === 'assisted' ? 'Começar conversa' : 'Continuar'}
          </Button>
        </form>
      )}
      {started && (
        <>
          <div className={styles.actions}>
            <Badge>{label}</Badge>
            <Badge>{method === 'assisted' ? 'Com IA' : 'Manual'}</Badge>
            {personaId && (
              <Badge>
                {library.personas.find((p) => p.id === personaId)?.name ?? 'Persona selecionada'}
              </Badge>
            )}
          </div>
          {session?.contextUnavailable && (
            <Alert variant="warning">
              O contexto selecionado mudou ou ficou indisponível. Volte para revisar antes de gerar
              ou criar.
            </Alert>
          )}
          {method === 'assisted' && (
            <>
              <PageAssistantSurface>
                {!review && (
                  <h2 ref={heading} tabIndex={-1}>
                    Vamos dar forma à sua ideia
                  </h2>
                )}
                <FormSection
                  title="Conversa da concepção"
                  description="Ideias e decisões do projeto"
                  open={!review ? true : undefined}
                  defaultOpen={false}
                >
                  <div className={styles.conversation} aria-live="polite">
                    {(session?.messages ?? []).map((item, index) => (
                      <div key={index} className={styles.message} data-role={item.role}>
                        <strong>{item.role === 'user' ? 'Você' : 'Assistente'}</strong>
                        <p>{item.text}</p>
                      </div>
                    ))}
                  </div>
                </FormSection>
                {review &&
                  session?.suggestedActionRequestId &&
                  session.messages.at(-1)?.role === 'assistant' && (
                    <p className={styles.message} aria-live="polite">
                      {session.messages.at(-1)?.text}
                    </p>
                  )}
                {suggestedPlan && suggestedCapability && (
                  <PageActionProposal
                    key={suggestedPlan.requestId}
                    action={suggestedPlan.action}
                    capability={suggestedCapability}
                    onDiscard={() => setSuggestedPlan(null)}
                    onExecute={executeSuggestion}
                  />
                )}
                <form className={styles.form} onSubmit={submit}>
                  <Textarea
                    label="Sua resposta"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    maxLength={4000}
                    disabled={locked || !session || session.contextUnavailable}
                  />
                  <div className={styles.actions}>
                    <Button type="submit" disabled={locked || !message.trim()}>
                      Enviar resposta
                    </Button>
                    <Button
                      variant="secondary"
                      type="button"
                      disabled={locked || !session}
                      onClick={() =>
                        action('interview', { message: 'Sugira uma direção para mim.' })
                      }
                    >
                      Sugira para mim
                    </Button>
                  </div>
                </form>
              </PageAssistantSurface>
              {!review && (
                <Button
                  variant="secondary"
                  disabled={locked || !session || session.contextUnavailable}
                  onClick={() => action('generate', { brief: session?.brief })}
                >
                  Revisar proposta inicial
                </Button>
              )}
            </>
          )}
          {(method === 'manual' || review) && (
            <div className={styles.review}>
              <h2 ref={heading} tabIndex={-1}>
                {method === 'manual' ? 'Dê um nome ao seu projeto' : 'Uma base para começar'}
              </h2>
              <Input
                label="Título do projeto"
                value={proposal.title}
                onChange={(e) => setProposal({ ...proposal, title: e.target.value })}
                maxLength={300}
                disabled={locked}
              />
              <FormSection
                title="Premissa e detalhes"
                description="Você pode ajustar agora ou depois"
              >
                <Input
                  label="Gênero ou estilo"
                  value={proposal.genre}
                  onChange={(e) => setProposal({ ...proposal, genre: e.target.value })}
                  maxLength={120}
                  disabled={locked}
                />
                <Textarea
                  label={kind === 'campaign' ? 'Conceito da campanha' : 'Premissa'}
                  value={proposal.synopsis}
                  onChange={(e) => setProposal({ ...proposal, synopsis: e.target.value })}
                  maxLength={4000}
                  disabled={locked}
                  rows={5}
                />
              </FormSection>
              {kind === 'book' && (
                <FormSection title="Capa opcional" description="Escolha agora ou continue sem capa">
                  <div className={styles.actions}>
                    <Button variant="secondary" disabled={locked} onClick={() => setPicker(true)}>
                      Escolher imagem da biblioteca
                    </Button>
                    {method === 'assisted' && (
                      <Button
                        variant="secondary"
                        disabled={locked || !proposal.title.trim()}
                        onClick={() => action('cover', { proposal })}
                      >
                        Gerar capa · {costs?.cover ?? '…'} créditos
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      disabled={locked}
                      onClick={() => {
                        setSelectedImage(null);
                        setUseGenerated(false);
                      }}
                    >
                      Sem capa
                    </Button>
                  </div>
                  {useGenerated && coverValid && (
                    <img
                      className={styles.cover}
                      src={cover!.previewUrl}
                      alt={`Capa proposta de ${proposal.title}`}
                    />
                  )}
                  {!useGenerated && selectedImage && (
                    <p>Imagem selecionada: {selectedImage.name}</p>
                  )}
                  {useGenerated && !coverValid && (
                    <Alert variant="warning">
                      A capa expirou ou a proposta mudou. Gere outra ou continue sem capa.
                    </Alert>
                  )}
                </FormSection>
              )}
              <p className={styles.meta}>
                {method === 'manual'
                  ? 'Criação manual sem débito.'
                  : `Pacote textual: ${costs?.text ?? '…'} créditos, cobrados somente ao confirmar. Capa gerada é opcional e tem seu próprio custo.`}
              </p>
              <Button
                variant="secondary"
                disabled={locked || !proposal.title.trim()}
                onClick={() =>
                  action('save', {
                    proposal: {
                      ...proposal,
                      genre: proposal.genre || 'Livre',
                      synopsis: proposal.synopsis || proposal.title,
                    },
                  })
                }
              >
                Salvar rascunho
              </Button>
              <Button
                onClick={commit}
                disabled={
                  locked || !proposal.title.trim() || !session || session.contextUnavailable
                }
              >
                Criar {label.toLocaleLowerCase('pt-BR')}
                {method === 'assisted' ? ` · ${total} créditos` : ''}
              </Button>
              {method === 'assisted' && (
                <Button variant="secondary" disabled={locked} onClick={() => setReview(false)}>
                  Continuar conversa
                </Button>
              )}
            </div>
          )}
          {busy && (
            <p role="status">
              {pending && 'expectedCost' in pending
                ? 'Confirmando criação...'
                : 'Preparando sua próxima etapa...'}
            </p>
          )}
        </>
      )}
      {method && (
        <Button variant="ghost" disabled={locked} onClick={back}>
          Voltar
        </Button>
      )}
      <Link to="/studio">Voltar ao Estúdio</Link>
      <ImageLibraryPicker
        open={picker}
        onClose={() => setPicker(false)}
        onSelect={(image) => {
          setSelectedImage(image);
          setUseGenerated(false);
          setPicker(false);
        }}
      />
      {universeForm && (
        <UniverseForm
          onClose={() => setUniverseForm(false)}
          onSaved={() => setUniverseEpoch((n) => n + 1)}
        />
      )}
      {personaManager && (
        <PersonaManager ownerId={user.uid} modal onClose={() => setPersonaManager(false)} />
      )}
      <Dialog
        open={confirmDiscard}
        title="Revisar o ponto de partida?"
        onClose={() => setConfirmDiscard(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmDiscard(false)}>
              Continuar aqui
            </Button>
            <Button
              onClick={() => {
                setConfirmDiscard(false);
                setStarted(false);
                setSession(null);
                setReview(false);
              }}
            >
              Revisar contexto
            </Button>
          </>
        }
      >
        <p>
          Uma nova conversa será iniciada quando você continuar. A criação anterior permanece salva
          até iniciar a próxima.
        </p>
      </Dialog>
    </section>
  );
}
