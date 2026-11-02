import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { ArrowLeft, ArrowUp, Check, Sparkles } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { ImageLibraryPicker, type LibraryImage } from '@/features/image-library';
import { LoreEntityForm, type LoreEntity } from '@/features/lore';
import { Alert, Badge, Button, Card, Dialog, Input, LoadingState, Textarea } from '@/shared/ui';
import {
  AssistedBookError,
  commitAssistedBook,
  loadAssistedBook,
  requestAssistedBook,
  type AssistedCommit,
  type AssistedCosts,
  type AssistedEntity,
  type AssistedProposal,
  type AssistedRequest,
  type AssistedSession,
} from '@/features/ai-assistant';
import styles from './AssistedBookPage.module.css';

type Phase = 'idea' | 'interview' | 'brief' | 'review' | 'cover';
const phases: { id: Phase; label: string }[] = [
  { id: 'idea', label: 'Ideia' },
  { id: 'interview', label: 'Conversa' },
  { id: 'brief', label: 'Briefing' },
  { id: 'review', label: 'Livro e lore' },
  { id: 'cover', label: 'Capa e criação' },
];
const date = (time: number) => new Date(time).toLocaleString('pt-BR');

function AgentMessage({ children }: { children: ReactNode }) {
  return (
    <div className={styles.agentMessage}>
      <span className={styles.agentMark}>
        <Sparkles className="icon icon-sm" aria-hidden="true" />
        <span className="sr-only">Assistente</span>
      </span>
      <div className={styles.prose}>{children}</div>
    </div>
  );
}

function AssistedCreation() {
  const { user, updateUserCreditsState } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AssistedSession | null>(null);
  const [costs, setCosts] = useState<AssistedCosts | null>(null);
  const [idea, setIdea] = useState('');
  const [message, setMessage] = useState('');
  const [brief, setBrief] = useState('');
  const [proposal, setProposal] = useState<AssistedProposal | null>(null);
  const [phase, setPhase] = useState<Phase>('idea');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{
    request: AssistedRequest | AssistedCommit;
    phase: Phase;
    commit: boolean;
  } | null>(null);
  const [selectedImage, setSelectedImage] = useState<LibraryImage | null>(null);
  const [useGenerated, setUseGenerated] = useState(true);
  const [picker, setPicker] = useState(false);
  const [editing, setEditing] = useState<AssistedEntity | null>(null);
  const [removing, setRemoving] = useState<AssistedEntity | null>(null);
  const [restart, setRestart] = useState(false);
  const [createdBookId, setCreatedBookId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const heading = useRef<HTMLHeadingElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const conversationEnd = useRef<HTMLDivElement>(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  const disabled = busy || !!pending;
  const accept = useCallback((value: AssistedSession) => {
    setSession(value);
    setBrief(value.brief);
    setProposal(value.proposal);
    setCosts(value.costs);
  }, []);
  const load = useCallback(async () => {
    await Promise.resolve();
    if (!mounted.current) return;
    setLoading(true);
    setError('');
    try {
      const result = await loadAssistedBook();
      if (!mounted.current) return;
      setCosts(result.costs);
      setCreatedBookId(result.bookId ?? null);
      if (result.session) {
        accept(result.session);
        setPhase(result.session.proposal ? 'review' : 'interview');
      }
    } catch (cause) {
      if (mounted.current)
        setError(cause instanceof Error ? cause.message : 'Não foi possível carregar.');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [accept]);
  useEffect(() => {
    mounted.current = true;
    void Promise.resolve().then(load);
    return () => {
      mounted.current = false;
    };
  }, [load]);
  useEffect(() => {
    if (phase !== 'idea' && phase !== 'interview') heading.current?.focus();
  }, [phase, loading]);
  useEffect(() => {
    if (!loading && !busy && (phase === 'idea' || phase === 'interview')) composer.current?.focus();
  }, [phase, loading, busy]);
  useEffect(() => {
    if (phase === 'interview') conversationEnd.current?.scrollIntoView?.({ block: 'nearest' });
  }, [phase, session?.messages.length, busy]);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  async function execute(request: AssistedRequest | AssistedCommit, next: Phase, commit = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setPending({ request, phase: next, commit });
    try {
      if (commit) {
        const result = await commitAssistedBook(request as AssistedCommit);
        if (!mounted.current) return;
        updateUserCreditsState(result.credits);
        setPending(null);
        void navigate(`/books/${result.book.id}`);
      } else {
        let result = await requestAssistedBook(request as AssistedRequest);
        if (!mounted.current) return;
        if ('action' in request && request.action === 'start') {
          accept(result);
          setPhase('interview');
          const first: AssistedRequest = {
            action: 'interview',
            sessionId: result.id,
            revision: 0,
            requestId: request.requestId,
          };
          setPending({ request: first, phase: next, commit: false });
          result = await requestAssistedBook(first);
          if (!mounted.current) return;
        }
        accept(result);
        setPhase(next);
        setMessage('');
        setPending(null);
        if ('action' in request && request.action === 'cover') {
          setSelectedImage(null);
          setUseGenerated(true);
        }
      }
    } catch (cause) {
      if (!mounted.current) return;
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir.');
      if (cause instanceof AssistedBookError && !cause.uncertain) setPending(null);
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function request(
    action: AssistedRequest['action'],
    next: Phase,
    extra: Partial<AssistedRequest> = {},
  ) {
    if (!session || disabled) return;
    void execute(
      {
        action,
        sessionId: session.id,
        requestId: crypto.randomUUID(),
        revision: session.revision,
        ...extra,
      },
      next,
    );
  }
  const contextChanged =
    !!proposal &&
    !!session?.proposal &&
    ['title', 'genre', 'synopsis', 'coverDirection'].some(
      (field) =>
        proposal[field as keyof AssistedProposal] !==
        session.proposal?.[field as keyof AssistedProposal],
    );
  const coverValid =
    !!session?.cover &&
    !!proposal &&
    session.cover.expiresAt > now &&
    session.cover.context.title === proposal.title &&
    session.cover.context.genre === proposal.genre &&
    session.cover.context.synopsis === proposal.synopsis &&
    session.cover.context.direction === proposal.coverDirection;
  const total = costs ? costs.text + (useGenerated && coverValid ? costs.cover : 0) : 0;
  const expired = !!session?.proposalExpiresAt && session.proposalExpiresAt <= now;
  const lore = (proposal?.entities ?? []).map((entity) => ({
    ...entity,
    bookId: session?.id ?? '',
    isPublic: false,
    createdAt: 0,
    updatedAt: 0,
  })) as LoreEntity[];
  const answers = session?.messages.filter((item) => item.role === 'user').length ?? 0;
  function startConversation() {
    if (disabled || !idea.trim() || !costs) return;
    void execute(
      {
        action: 'start',
        sessionId: crypto.randomUUID(),
        requestId: crypto.randomUUID(),
        revision: 0,
        idea,
      },
      'interview',
    );
  }
  if (loading) return <LoadingState label="Carregando planejamento..." />;
  return (
    <section className={styles.page}>
      {createdBookId && (
        <Alert title="Seu último livro foi criado">
          <Link to={`/books/${createdBookId}`}>Abrir livro criado</Link>
        </Alert>
      )}
      <header className={styles.header}>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Voltar aos livros"
          onClick={() => void navigate('/')}
        >
          <ArrowLeft className="icon icon-sm" aria-hidden="true" />
        </Button>
        <h1>Criar livro com IA</h1>
      </header>
      {error && (
        <Alert variant="destructive" title="Não foi possível concluir">
          <p>{error}</p>
          {!costs && (
            <Button variant="secondary" onClick={() => void load()}>
              Tentar carregar novamente
            </Button>
          )}
          {costs && !pending && (
            <Button variant="secondary" onClick={() => void load()}>
              Reabrir planejamento salvo
            </Button>
          )}
          {pending && (
            <>
              <p>
                A resposta ainda não foi confirmada. Seus dados estão preservados; repita a mesma
                operação para recuperar o resultado.
              </p>
              <Button
                disabled={busy}
                onClick={() => void execute(pending.request, pending.phase, pending.commit)}
              >
                Tentar novamente
              </Button>
            </>
          )}
        </Alert>
      )}
      <nav className={styles.steps} aria-label="Etapas da criação">
        <ol>
          {phases.map((item, index) => (
            <li key={item.id} aria-current={phase === item.id ? 'step' : undefined}>
              <span className={styles.stepDot} aria-hidden="true">
                {index < phases.findIndex((value) => value.id === phase) ? (
                  <Check className="icon icon-sm" />
                ) : (
                  index + 1
                )}
              </span>
              <span>{item.label}</span>
            </li>
          ))}
        </ol>
      </nav>
      <h2 ref={heading} tabIndex={-1} className="sr-only">
        {phases.find((item) => item.id === phase)?.label}
      </h2>
      <fieldset disabled={disabled} className={styles.content}>
        <p id="assisted-composer-help" className="sr-only">
          Enter envia a mensagem. Shift+Enter insere uma nova linha.
        </p>
        <AgentMessage>
          {phase === 'idea' || phase === 'interview' ? (
            <>
              <p className={styles.welcome}>Vamos dar vida ao seu próximo livro.</p>
              <p>
                Que história você tem vontade de contar? Pode ser uma ideia solta, um personagem ou
                uma cena. Vamos descobrir o resto juntos.
              </p>
            </>
          ) : phase === 'brief' ? (
            <p>
              Reuni o que conversamos. Confira se esta é a história que você quer contar e ajuste o
              que precisar. Quando estiver do seu jeito, vou preparar uma proposta para o livro. Se
              já houver uma proposta, a nova versão vai substituí-la.
            </p>
          ) : phase === 'review' ? (
            <p>
              Aqui está a proposta para o seu livro e as primeiras fichas do seu mundo. Explore,
              ajuste e deixe tudo com a sua voz antes de escolhermos a capa. As fichas serão
              privadas.
            </p>
          ) : (
            <p>
              Como você imagina a capa? Podemos criar uma juntos, escolher uma da sua biblioteca ou
              deixar para depois. O livro só será criado quando você confirmar.
            </p>
          )}
        </AgentMessage>
        {phase === 'idea' && (
          <form
            className={styles.composer}
            onSubmit={(event) => {
              event.preventDefault();
              startConversation();
            }}
          >
            <Textarea
              ref={composer}
              aria-label="Sua ideia"
              aria-describedby="assisted-composer-help"
              placeholder="Me conte sua ideia…"
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
              maxLength={4000}
              rows={3}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  startConversation();
                }
              }}
            />
            <Button
              disabled={!idea.trim() || !costs}
              type="submit"
              size="icon"
              aria-label="Começar conversa"
            >
              <ArrowUp className="icon icon-sm" aria-hidden="true" />
            </Button>
          </form>
        )}
        {session && phase === 'interview' && (
          <div className={styles.conversation}>
            <div role="log" aria-label="Conversa com a IA" aria-relevant="additions text">
              <ol className={styles.messages}>
                {session.messages.map((item, index) => (
                  <li
                    key={index}
                    className={item.role === 'user' ? styles.userMessage : styles.assistantTurn}
                  >
                    {item.role === 'user' ? (
                      <>
                        <span className="sr-only">Você: </span>
                        <p>{item.text}</p>
                      </>
                    ) : (
                      <AgentMessage>
                        <p>{item.text}</p>
                      </AgentMessage>
                    )}
                  </li>
                ))}
              </ol>
              <div ref={conversationEnd} />
            </div>
            {answers <= 8 && (
              <form
                className={styles.composer}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (message.trim()) request('interview', 'interview', { message });
                }}
              >
                <Textarea
                  ref={composer}
                  aria-label="Sua resposta"
                  aria-describedby="assisted-composer-help"
                  placeholder="Continue a conversa…"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={4000}
                  rows={3}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault();
                      if (message.trim()) request('interview', 'interview', { message });
                    }
                  }}
                />
                <Button
                  type="submit"
                  size="icon"
                  aria-label="Enviar resposta"
                  disabled={!message.trim()}
                >
                  <ArrowUp className="icon icon-sm" aria-hidden="true" />
                </Button>
              </form>
            )}
            <div className={styles.actions}>
              {answers <= 8 && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    request('interview', 'interview', {
                      message:
                        session.messages.length === 1
                          ? ''
                          : 'Sugira para mim as decisões desta pergunta.',
                    })
                  }
                >
                  {session.messages.length === 1 ? 'Fazer primeira pergunta' : 'Sugira para mim'}
                </Button>
              )}
              <Button
                variant={session.ready ? 'primary' : 'ghost'}
                onClick={() => setPhase('brief')}
              >
                Revisar ideia
              </Button>
            </div>
            {session.ready && (
              <AgentMessage>
                <p>Já temos uma boa base. Vamos revisar a ideia e preparar seu livro?</p>
              </AgentMessage>
            )}
            <details className={styles.notes}>
              <summary>Ideias que reunimos</summary>
              <p className={styles.prose}>
                {session.brief || 'Vamos reunir suas primeiras decisões nesta conversa.'}
              </p>
              <p>Sessão disponível até {date(session.expiresAt)}.</p>
              <Button variant="ghost" onClick={() => setRestart(true)}>
                Começar outra ideia
              </Button>
            </details>
          </div>
        )}
        {session && phase === 'brief' && (
          <Card className={styles.panel}>
            <Textarea
              label="Briefing do livro"
              value={brief}
              onChange={(event) => setBrief(event.target.value)}
              maxLength={6000}
              rows={12}
            />
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => setPhase('interview')}>
                Voltar à conversa
              </Button>
              <Button
                variant="secondary"
                disabled={!brief.trim()}
                onClick={() => request('brief', 'brief', { brief })}
              >
                Salvar briefing
              </Button>
              <Button
                disabled={!brief.trim() || !costs || (user?.credits ?? 0) < (costs?.text ?? 0)}
                onClick={() => request('generate', 'review', { brief })}
              >
                Gerar proposta do livro
              </Button>
            </div>
          </Card>
        )}
        {session && proposal && phase === 'review' && (
          <>
            {expired && (
              <Alert variant="warning">
                A proposta expirou. Volte ao briefing e gere outra para criar o livro.
              </Alert>
            )}
            <Card className={styles.panel}>
              <Input
                label="Título do livro"
                value={proposal.title}
                maxLength={300}
                onChange={(event) => setProposal({ ...proposal, title: event.target.value })}
              />
              <Input
                label="Gênero"
                value={proposal.genre}
                maxLength={120}
                onChange={(event) => setProposal({ ...proposal, genre: event.target.value })}
              />
              <Textarea
                label="Sinopse"
                value={proposal.synopsis}
                maxLength={4000}
                rows={5}
                onChange={(event) => setProposal({ ...proposal, synopsis: event.target.value })}
              />
            </Card>
            <h3>Compêndio inicial · {proposal.entities.length} fichas</h3>
            <div className={styles.entities}>
              {proposal.entities.map((entity) => (
                <Card key={entity.id} className={styles.panel}>
                  <h4>{entity.name}</h4>
                  <Badge variant="secondary">
                    {entity.category === 'character'
                      ? 'Personagem'
                      : entity.category === 'location'
                        ? 'Local'
                        : entity.category === 'concept'
                          ? 'Conceito / Item'
                          : 'Outro'}
                  </Badge>
                  <p>{entity.summary}</p>
                  <p>{entity.relations.length} relações</p>
                  <div className={styles.actions}>
                    <Button variant="secondary" onClick={() => setEditing(entity)}>
                      Editar {entity.name}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={expired}
                      onClick={() => request('entity', 'review', { proposal, entityId: entity.id })}
                    >
                      Regenerar {entity.name}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={proposal.entities.length === 1}
                      onClick={() => setRemoving(entity)}
                    >
                      Excluir {entity.name}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
            <AgentMessage>
              <p>
                Quer tentar outra versão de uma ficha? Vou preservar os campos que você editou.
                Quando terminar os ajustes, salve a revisão ou continue para a capa.
              </p>
            </AgentMessage>
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => setPhase('brief')}>
                Voltar ao briefing
              </Button>
              <Button variant="secondary" onClick={() => request('save', 'review', { proposal })}>
                Salvar revisão
              </Button>
              <Button disabled={expired} onClick={() => request('save', 'cover', { proposal })}>
                Continuar para capa
              </Button>
            </div>
          </>
        )}
        {session && proposal && phase === 'cover' && (
          <Card className={styles.panel}>
            <Textarea
              label="Direção visual da capa"
              value={proposal.coverDirection}
              maxLength={2000}
              rows={3}
              onChange={(event) => {
                setProposal({ ...proposal, coverDirection: event.target.value });
                setUseGenerated(false);
              }}
            />
            <div className={styles.actions}>
              <Button
                disabled={expired || !costs || (user?.credits ?? 0) < costs.text + costs.cover}
                onClick={() => request('cover', 'cover', { proposal })}
              >
                Gerar capa com IA
              </Button>
              <Button variant="secondary" onClick={() => setPicker(true)}>
                Selecionar da biblioteca
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setSelectedImage(null);
                  setUseGenerated(false);
                }}
              >
                Continuar sem capa
              </Button>
              {coverValid && !useGenerated && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSelectedImage(null);
                    setUseGenerated(true);
                  }}
                >
                  Usar capa gerada
                </Button>
              )}
            </div>
            {(useGenerated && coverValid) || selectedImage ? (
              <img
                className={styles.cover}
                src={selectedImage?.url ?? session.cover?.previewUrl}
                alt={`Prévia de capa de ${proposal.title}`}
              />
            ) : (
              <p>Livro sem capa selecionada.</p>
            )}
            {contextChanged && session.cover && (
              <Alert variant="warning">
                O contexto da capa mudou. Gere outra capa para usar a versão atual.
              </Alert>
            )}
            <p>
              <strong>{proposal.title}</strong> · {proposal.genre} · {proposal.entities.length}{' '}
              fichas privadas
            </p>
            <p>
              Proposta disponível até {date(session.proposalExpiresAt ?? 0)}. Capas geradas expiram
              em 1 hora; capas aceitas ficam na biblioteca.
            </p>
            <p>
              Total: <strong>{total} créditos</strong>. Saldo: {user?.credits ?? 0}.
            </p>
            {(user?.credits ?? 0) < total && (
              <Alert variant="warning">
                Saldo insuficiente. Você pode voltar aos livros e criar manualmente.
              </Alert>
            )}
            <div className={styles.actions}>
              <Button variant="secondary" onClick={() => setPhase('review')}>
                Voltar à revisão
              </Button>
              <Button
                disabled={expired || !costs || (user?.credits ?? 0) < total}
                onClick={() =>
                  void execute(
                    {
                      sessionId: session.id,
                      expectedCost: total,
                      revision: session.revision,
                      proposal,
                      coverId: useGenerated && coverValid ? session.cover!.id : null,
                      imageId: selectedImage?.id ?? null,
                    },
                    'cover',
                    true,
                  )
                }
              >
                Criar livro · {total} créditos
              </Button>
            </div>
          </Card>
        )}
      </fieldset>
      {busy && (
        <div role="status" className={styles.thinking}>
          <Sparkles className="icon icon-sm" aria-hidden="true" />
          Estou preparando o próximo passo…
        </div>
      )}
      {costs && (
        <details className={styles.notes}>
          <summary>Créditos e privacidade</summary>
          <p>
            Pacote textual: {costs.text} créditos. Capa gerada: {costs.cover} créditos. Cobrança
            somente ao criar o livro.
          </p>
          <p>
            O planejamento e as fichas são privados. Você pode retomar esta conversa por 7 dias.
          </p>
        </details>
      )}
      {editing && proposal && (
        <LoreEntityForm
          open
          privateOnly
          entityToEdit={lore.find((entity) => entity.id === editing.id)}
          allEntities={lore}
          onClose={() => setEditing(null)}
          onSubmit={(input) => {
            setProposal({
              ...proposal,
              entities: proposal.entities.map((entity) =>
                entity.id === editing.id
                  ? {
                      ...entity,
                      ...input,
                      aliases: input.aliases ?? [],
                      details: input.details ?? '',
                      structuredDetails: input.structuredDetails ?? entity.structuredDetails,
                      relations: input.relations ?? [],
                    }
                  : entity,
              ),
            });
            return Promise.resolve();
          }}
        />
      )}
      <Dialog
        open={!!removing}
        title="Excluir ficha da proposta"
        onClose={() => setRemoving(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (proposal && removing)
                  setProposal({
                    ...proposal,
                    entities: proposal.entities
                      .filter((entity) => entity.id !== removing.id)
                      .map((entity) => ({
                        ...entity,
                        relations: entity.relations.filter(
                          (relation) => relation.targetEntityId !== removing.id,
                        ),
                      })),
                  });
                setRemoving(null);
              }}
            >
              Excluir ficha e suas relações
            </Button>
          </>
        }
      >
        <p>
          A ficha {removing?.name} e todas as relações que apontam para ela serão removidas da
          proposta.
        </p>
      </Dialog>
      <Dialog
        open={restart}
        title="Começar outra ideia"
        onClose={() => setRestart(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRestart(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => {
                setSession(null);
                setProposal(null);
                setIdea('');
                setSelectedImage(null);
                setPhase('idea');
                setRestart(false);
              }}
            >
              Começar outra ideia
            </Button>
          </>
        }
      >
        <p>A última sessão deixará de aparecer para retomada. Nenhum crédito será debitado.</p>
      </Dialog>
      <ImageLibraryPicker
        open={picker}
        onClose={() => setPicker(false)}
        onSelect={(image) => {
          setSelectedImage(image);
          setUseGenerated(false);
          setPicker(false);
        }}
      />
    </section>
  );
}
export function AssistedBookPage() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState label="Verificando sua conta..." />;
  if (!user)
    return (
      <Alert title="Entre para planejar seu livro">
        <Link to="/login">Entrar na sua conta</Link>
      </Alert>
    );
  return <AssistedCreation key={user.uid} />;
}
