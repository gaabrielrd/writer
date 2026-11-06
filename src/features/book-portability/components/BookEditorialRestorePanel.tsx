import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { auth } from '@/shared/lib';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  Dropdown,
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/shared/ui';
import type {
  EditorialReviewPage,
  EditorialReviewView,
  EditorialReviewWire,
} from '../model/bookEditorialReview';
import { bookEditorialReviewApi as api } from '../services/bookEditorialReviewApi';
import {
  createEditorialReviewJournal,
  type EditorialReviewPending,
} from '../services/bookEditorialReviewJournal';
import {
  createEditorialReviewDriver,
  type EditorialReviewResult,
} from '../services/bookEditorialReviewDriver';
import {
  EditorialRestoreReferencePicker,
  type SelectedEditorialReference,
} from './EditorialRestoreReferencePicker';
import { BookEditorialHistoryBrowser } from './BookEditorialHistoryBrowser';
import styles from './BookEditorialRestorePanel.module.css';
type Driver = ReturnType<typeof createEditorialReviewDriver>;
interface Props {
  bookId: string;
  onWorkChange?: (state: { dirty: boolean; pending: boolean }) => void;
}
const message = (cause: unknown) =>
  cause instanceof Error ? cause.message : 'Não foi possível concluir esta ação.';
const sourceLabels: Record<string, string> = {
  book: 'Livro',
  act: 'Ato',
  chapter: 'Capítulo',
  scene: 'Cena',
  arc: 'Arco',
  event: 'Evento',
  lore: 'Ficha de compêndio',
  persona: 'Persona',
  artifact: 'Registro editorial',
  image: 'Imagem',
};
export function BookEditorialRestorePanel(props: Props) {
  const { user } = useAuth();
  return user ? (
    <ReviewSession key={user.uid + ':' + props.bookId} {...props} actorId={user.uid} />
  ) : (
    <EmptyState title="Entre para consultar o arquivo restaurado" />
  );
}
function ReviewSession({ bookId, actorId, onWorkChange }: Props & { actorId: string }) {
  const [page, setPage] = useState<EditorialReviewPage | null>(null),
    [view, setView] = useState<EditorialReviewView | null>(null);
  const [candidate, setCandidate] = useState<EditorialReviewView | null>(null),
    [selected, setSelected] = useState<SelectedEditorialReference[]>([]);
  const [decision, setDecision] = useState<EditorialReviewWire['decision']>('keep-current');
  const [pending, setPending] = useState<EditorialReviewPending | null>(null),
    [storageReady, setStorageReady] = useState(false);
  const [dirty, setDirty] = useState(false),
    dirtyRef = useRef(false);
  const [loading, setLoading] = useState(true),
    [loadingReview, setLoadingReview] = useState(false),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null),
    [storageError, setStorageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null),
    [confirm, setConfirm] = useState(false),
    [switchTo, setSwitchTo] = useState<string | null>(null);
  const [area, setArea] = useState<'review' | 'history'>('review');
  const generation = useRef(0),
    driverRef = useRef<Driver | null>(null),
    requestEpoch = useRef(0),
    selectionEpoch = useRef(0);
  const guardRef = useRef<() => void>(() => {
    throw new Error('A sessão ainda não está pronta.');
  });
  const setWorkDirty = (value: boolean) => {
    dirtyRef.current = value;
    setDirty(value);
  };
  function adopt(next: EditorialReviewView) {
    setView(next);
    setCandidate(null);
    setSelected(next.sources.map((row) => ({ ...row })));
    setDecision('keep-current');
    setWorkDirty(false);
  }
  useEffect(() => {
    const ticket = ++generation.current;
    const guard = () => {
      if (generation.current !== ticket || auth.currentUser?.uid !== actorId)
        throw new Error('A conta ou o livro mudou. Reabra esta revisão.');
    };
    guardRef.current = guard;
    const journal = createEditorialReviewJournal({ actorId, bookId }, guard);
    const driver = createEditorialReviewDriver({
      scope: { actorId, bookId },
      journal,
      api,
      guard,
      onChange: (value) => {
        guard();
        if (driverRef.current === driver) setPending(value);
      },
    });
    driverRef.current = driver;
    void driver
      .pending()
      .then((value) => {
        guard();
        setPending(value);
        setStorageReady(true);
      })
      .catch((cause) => {
        if (generation.current === ticket) {
          setStorageError(message(cause));
          setStorageReady(false);
        }
      });
    void api
      .list(bookId)
      .then((result) => {
        guard();
        setPage(result);
      })
      .catch((cause) => {
        if (generation.current === ticket) setError(message(cause));
      })
      .finally(() => {
        if (generation.current === ticket) setLoading(false);
      });
    return () => {
      generation.current++;
      requestEpoch.current++;
      selectionEpoch.current++;
      driverRef.current = null;
    };
  }, [actorId, bookId]);
  useEffect(() => {
    onWorkChange?.({ dirty, pending: pending !== null || busy });
  }, [dirty, pending, busy, onWorkChange]);
  async function readPending() {
    const driver = driverRef.current,
      guard = guardRef.current;
    if (!driver) return;
    try {
      guard();
      const value = await driver.pending();
      guard();
      setPending(value);
      setStorageReady(true);
      setStorageError(null);
    } catch (cause) {
      try {
        guard();
        setStorageReady(false);
        setStorageError(message(cause));
      } catch {
        /* Old account/session. */
      }
    }
  }
  async function loadPage(after: string | null = null) {
    const guard = guardRef.current;
    setLoading(true);
    setError(null);
    try {
      guard();
      const result = await api.list(bookId, after);
      guard();
      setPage((previous) => ({
        ...result,
        items: after ? [...(previous?.items ?? []), ...result.items] : result.items,
      }));
    } catch (cause) {
      try {
        guard();
        setError(message(cause));
      } catch {
        /* Old scope. */
      }
    } finally {
      try {
        guard();
        setLoading(false);
      } catch {
        /* Old scope. */
      }
    }
  }
  async function loadReview(id: string) {
    const guard = guardRef.current,
      ticket = ++selectionEpoch.current;
    setLoadingReview(true);
    setError(null);
    try {
      guard();
      const next = await api.get(bookId, id);
      guard();
      if (selectionEpoch.current !== ticket) return;
      if (view?.id === id && dirtyRef.current && next.reviewState === 'required') {
        if (next.reviewToken !== view.reviewToken) setCandidate(next);
        else setView(next);
      } else adopt(next);
    } catch (cause) {
      try {
        guard();
        if (selectionEpoch.current === ticket) setError(message(cause));
      } catch {
        /* Old scope. */
      }
    } finally {
      try {
        guard();
        if (selectionEpoch.current === ticket) setLoadingReview(false);
      } catch {
        /* Old scope. */
      }
    }
  }
  function selectReview(id: string) {
    if (pending || busy) return;
    if (dirtyRef.current && view?.id !== id) {
      setSwitchTo(id);
      return;
    }
    void loadReview(id);
  }
  async function action(
    kind: 'submit' | 'resolve' | 'retry' | 'retire',
    wire?: EditorialReviewWire,
  ) {
    const driver = driverRef.current,
      guard = guardRef.current;
    if (!driver) return;
    const ticket = ++requestEpoch.current;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      guard();
      let result: EditorialReviewResult;
      if (kind === 'submit') {
        if (!wire) return;
        result = await driver.submit(wire);
      } else if (kind === 'resolve') result = await driver.resolve();
      else if (kind === 'retire') result = await driver.retire();
      else result = await driver.retry();
      guard();
      if (requestEpoch.current !== ticket) return;
      const current = await driver.pending();
      guard();
      if (requestEpoch.current !== ticket) return;
      setPending(current);
      if (result.outcome && result.cleared) {
        if (result.outcome.kind === 'confirmed') {
          setWorkDirty(false);
          setNotice('Revisão confirmada.');
        } else setNotice('Pedido encerrado. Sua seleção foi preservada para revisão.');
        const id = result.outcome.receipt.id;
        const next = await api.get(bookId, id);
        guard();
        if (requestEpoch.current !== ticket) return;
        if (dirtyRef.current && next.reviewState === 'required') setCandidate(next);
        else adopt(next);
        await loadPage();
      } else if (result.outcome) setNotice('Confira o acompanhamento atual antes de continuar.');
      else
        setNotice(
          current?.intent === 'withdraw'
            ? 'O encerramento ainda precisa de confirmação.'
            : 'O pedido ainda não foi confirmado. Reenvio exige uma nova ação sua.',
        );
    } catch (cause) {
      try {
        guard();
        if (requestEpoch.current === ticket) {
          setError(message(cause));
          await readPending();
        }
      } catch {
        /* Preserve the old actor's durable pointer. */
      }
    } finally {
      try {
        guard();
        if (requestEpoch.current === ticket) setBusy(false);
      } catch {
        /* Old scope. */
      }
    }
  }
  function submit() {
    if (!view || !storageReady || pending || candidate) return;
    const wire: EditorialReviewWire = {
      bookId,
      id: view.id,
      operationId: crypto.randomUUID(),
      reviewToken: view.reviewToken,
      decision,
      ...(decision === 'reconcile-references'
        ? { references: structuredClone(selected.map((row) => row.reference)) }
        : {}),
    };
    setConfirm(false);
    void action('submit', wire);
  }
  return (
    <section className={styles.panel} aria-label="Arquivo editorial restaurado">
      <h3>Arquivo restaurado</h3>
      <p>
        Revise o contrato e os planos desta cópia. As fontes históricas exigem uma escolha atual
        antes de serem vinculadas.
      </p>
      <div className={styles.actions} aria-label="Áreas do arquivo restaurado">
        <Button
          variant={area === 'review' ? 'primary' : 'outline'}
          aria-pressed={area === 'review'}
          onClick={() => setArea('review')}
        >
          Revisões da cópia
        </Button>
        <Button
          variant={area === 'history' ? 'primary' : 'outline'}
          aria-pressed={area === 'history'}
          onClick={() => setArea('history')}
        >
          Arquivo original
        </Button>
      </div>
      {storageError && (
        <ErrorState
          title="Acompanhamento local indisponível"
          message={storageError}
          onRetry={() => void readPending()}
        />
      )}
      {pending && (
        <Alert variant="warning">
          <div className={styles.panel}>
            <strong>Pedido aguardando confirmação</strong>
            <p>
              {pending.intent === 'withdraw'
                ? 'Você pediu o encerramento deste pedido.'
                : 'Confira o resultado antes de confirmar outra revisão.'}
            </p>
            <div className={styles.actions}>
              <Button
                variant="outline"
                disabled={pending.phase === 'checking'}
                onClick={() => void action('resolve')}
              >
                Conferir pedido
              </Button>
              {pending.intent === 'apply' && pending.phase === 'unconfirmed' && (
                <Button disabled={busy} onClick={() => void action('retry')}>
                  Reenviar mesmo pedido
                </Button>
              )}
              <Button
                variant="outline"
                disabled={pending.intent === 'withdraw' && pending.phase === 'withdrawing' && busy}
                onClick={() => void action('retire')}
              >
                {pending.intent === 'withdraw' ? 'Concluir encerramento' : 'Encerrar pedido'}
              </Button>
            </div>
          </div>
        </Alert>
      )}
      {error && <ErrorState message={error} onRetry={() => void loadPage()} />}
      {notice && <Alert variant="info">{notice}</Alert>}
      <div hidden={area !== 'review'} className={styles.panel}>
        <div className={styles.actions}>
          <Button variant="outline" disabled={loading} onClick={() => void loadPage()}>
            Atualizar lista
          </Button>
        </div>
        {loading && <LoadingState label="Consultando revisões…" />}
        {page && page.items.length === 0 && !loading && (
          <EmptyState
            title="Nenhuma revisão restaurada"
            description="O arquivo pode conter apenas registros históricos."
          />
        )}
        <div className={styles.catalog}>
          {page?.items.map((row) => (
            <Button
              key={row.id}
              variant={view?.id === row.id ? 'primary' : 'outline'}
              disabled={!!pending || busy || loadingReview}
              onClick={() => selectReview(row.id)}
            >
              {row.title} · {row.reviewState === 'acknowledged' ? 'revisado' : 'a revisar'}
            </Button>
          ))}
        </div>
        {page?.next && (
          <Button variant="outline" disabled={loading} onClick={() => void loadPage(page.next)}>
            Mais revisões
          </Button>
        )}
        {loadingReview && <LoadingState label="Conferindo a revisão atual…" />}
        {view && (
          <div className={styles.detail}>
            <h4>{view.title}</h4>
            <Badge variant={view.reviewState === 'acknowledged' ? 'success' : 'outline'}>
              {view.reviewState === 'acknowledged' ? 'Revisado' : 'A revisar'}
            </Badge>
            {view.state === 'changed' && (
              <p>O estado atual já foi alterado. O aceite preserva essas alterações.</p>
            )}
            {view.state === 'missing' && (
              <p>O estado atual foi removido. Manter atual preserva essa ausência.</p>
            )}
            {view.reviewState === 'acknowledged' && (
              <p>
                {view.currentChangedSinceAcknowledgement
                  ? 'A corrente mudou depois desta revisão.'
                  : 'Esta revisão foi confirmada para o estado observado.'}
              </p>
            )}
            <details>
              <summary>Referências históricas a conferir</summary>
              {view.pendingReferences.length === 0 ? (
                <p>Nenhuma referência pendente.</p>
              ) : (
                <ul>
                  {view.pendingReferences.map((ref, index) => (
                    <li key={index}>
                      {sourceLabels[ref.kind] ?? 'Referência histórica'} ·{' '}
                      {ref.scope.kind === 'universe'
                        ? 'universo'
                        : ref.scope.kind === 'library'
                          ? 'biblioteca'
                          : 'livro'}{' '}
                      · requer seleção atual
                    </li>
                  ))}
                </ul>
              )}
            </details>
            {candidate && (
              <Alert variant="warning">
                <p>A base mudou. Sua seleção foi preservada.</p>
                <div className={styles.actions}>
                  <Button
                    variant="outline"
                    disabled={!!pending || busy}
                    onClick={() => {
                      setView(candidate);
                      setCandidate(null);
                    }}
                  >
                    Usar base atual mantendo minha seleção
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!!pending || busy}
                    onClick={() => setSwitchTo(candidate.id)}
                  >
                    Recomeçar com referências atuais
                  </Button>
                </div>
              </Alert>
            )}
            {view.reviewState === 'required' && (
              <>
                <Button
                  variant="outline"
                  disabled={loadingReview}
                  onClick={() => void loadReview(view.id)}
                >
                  Atualizar base da revisão
                </Button>
                <Dropdown
                  mode="select"
                  label="Como concluir esta revisão"
                  value={decision}
                  disabled={busy || !!pending}
                  options={[
                    { value: 'keep-current', label: 'Manter o estado atual' },
                    ...(view.kind === 'plan' && view.state !== 'missing'
                      ? [{ value: 'reconcile-references', label: 'Escolher referências atuais' }]
                      : []),
                  ]}
                  onValueChange={(value) => {
                    setDecision(value as typeof decision);
                    setWorkDirty(true);
                  }}
                />
                {decision === 'reconcile-references' && (
                  <EditorialRestoreReferencePicker
                    key={view.id}
                    bookId={bookId}
                    value={selected}
                    disabled={busy || !!pending}
                    guard={() => guardRef.current()}
                    onChange={(value) => {
                      setSelected(value);
                      setWorkDirty(true);
                    }}
                  />
                )}
                <Button
                  disabled={
                    !storageReady ||
                    busy ||
                    !!pending ||
                    !!candidate ||
                    loadingReview ||
                    (decision === 'reconcile-references' &&
                      (view.state === 'missing' ||
                        selected.some((row) => row.available === false || row.changed)))
                  }
                  onClick={() => setConfirm(true)}
                >
                  Revisar escolha
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      {area === 'history' && (
        <BookEditorialHistoryBrowser bookId={bookId} guard={() => guardRef.current()} />
      )}
      <Dialog
        open={confirm}
        title="Confirmar revisão desta cópia"
        onClose={() => setConfirm(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirm(false)}>
              Continuar revisando
            </Button>
            <Button onClick={submit}>Confirmar revisão</Button>
          </>
        }
      >
        <p>
          {decision === 'keep-current'
            ? 'Manter o contrato ou plano atual, incluindo as alterações que você já fez.'
            : 'Atualizar somente as referências deste plano. Título, campos e texto serão preservados.'}
        </p>
        {decision === 'reconcile-references' && (
          <ul>
            {selected.length ? (
              selected.map((row, index) => (
                <li key={index}>{row.label ?? 'Referência escolhida'}</li>
              ))
            ) : (
              <li>Sem referências vinculadas.</li>
            )}
          </ul>
        )}
      </Dialog>
      <Dialog
        open={switchTo !== null}
        title="Descartar a seleção ainda não confirmada?"
        onClose={() => setSwitchTo(null)}
        footer={
          <>
            <Button variant="outline" onClick={() => setSwitchTo(null)}>
              Preservar minha seleção
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                const id = switchTo;
                setSwitchTo(null);
                setWorkDirty(false);
                if (id) void loadReview(id);
              }}
            >
              Descartar e continuar
            </Button>
          </>
        }
      >
        <p>Apenas a seleção local desta revisão será descartada.</p>
      </Dialog>
    </section>
  );
}
