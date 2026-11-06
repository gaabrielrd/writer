import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Dropdown, EmptyState, LoadingState } from '@/shared/ui';
import {
  startLiteraryPassageInspection,
  getLiteraryPassageInspection,
  advanceLiteraryPassageInspection,
  cancelLiteraryPassageInspection,
  cancelLiteraryPassageInspectionStart,
  getLiteraryPassageInspectionScope,
  type LiteraryPassageInspection,
  type StartPassageInspection,
} from '../services/literaryPassageInspectionService';
import {
  listLiteraryPublications,
  type LiteraryPublication,
} from '../services/literaryPublicationService';
import {
  readPassageInspectionIntent,
  reservePassageInspectionIntent,
  releasePassageInspectionIntent,
  markPassageInspectionCancellation,
  type PassageInspectionIntent,
} from '../services/literaryPassageInspectionStorage';
import styles from './EditorialContractPanel.module.css';
export interface WorkflowAdmissionSelection {
  inspectionId: string;
  contractRevision: number;
  chapterActId: string | null;
  previousChapterId: string | null;
}
interface Props {
  actorId: string;
  bookId: string;
  chapterId: string;
  contractRevision: number;
  required: boolean;
  unit: 'chapter' | 'act' | 'book' | null;
  disabled: boolean;
  onChange: (selection: WorkflowAdmissionSelection | null) => void;
  onWorkChange: (state: { dirty: boolean; pending: boolean }) => void;
}
const labels = {
  scanning: 'Conferindo a ordem',
  verifying: 'Reconferindo o inventário',
  publication: 'Conferindo a unidade publicada',
  ready: 'Inspeção concluída',
  stale: 'Origem alterada',
  canceled: 'Inspeção encerrada',
};
export function LiteraryWorkflowAdmissionFields(props: Props) {
  return (
    <WorkflowAdmissionFields
      key={JSON.stringify([props.actorId, props.bookId, props.chapterId, props.contractRevision])}
      {...props}
    />
  );
}
function WorkflowAdmissionFields(props: Props) {
  const {
    actorId,
    bookId,
    chapterId,
    contractRevision,
    required,
    unit,
    disabled,
    onChange,
    onWorkChange,
  } = props;
  const [initial] = useState(() => {
    try {
      return { intent: readPassageInspectionIntent(actorId, bookId, chapterId), error: null };
    } catch (cause) {
      return {
        intent: null,
        error:
          cause instanceof Error ? cause.message : 'Não foi possível consultar o acompanhamento.',
      };
    }
  });
  const [intent, setIntent] = useState<PassageInspectionIntent | null>(initial.intent),
    [observed, setObserved] = useState<LiteraryPassageInspection | null>(null),
    [publications, setPublications] = useState<LiteraryPublication[]>([]),
    [after, setAfter] = useState<string | null>(null),
    [loaded, setLoaded] = useState(false),
    [publicationId, setPublicationId] = useState(''),
    [busy, setBusy] = useState(false),
    [canceling, setCanceling] = useState(false),
    [error, setError] = useState<string | null>(initial.error),
    [chosen, setChosen] = useState(false);
  const alive = useRef(false),
    working = useRef(false),
    closing = useRef(false),
    epoch = useRef(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, [actorId, bookId, chapterId]);
  useEffect(() => {
    onWorkChange({ dirty: chosen, pending: busy || canceling });
  }, [chosen, busy, canceling, onWorkChange]);
  useEffect(() => {
    onChange(null);
  }, [onChange]);
  async function run(task: () => Promise<void> | void) {
    if (working.current || closing.current || disabled || !actorId) return;
    const ticket = epoch.current;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (cause) {
      if (alive.current && ticket === epoch.current)
        setError(cause instanceof Error ? cause.message : 'Não foi possível conferir a passagem.');
    } finally {
      if (ticket === epoch.current) {
        working.current = false;
        if (alive.current) setBusy(false);
      }
    }
  }
  function adopt(value: LiteraryPassageInspection, ticket = epoch.current) {
    if (value.chapterId !== chapterId) throw new Error('A inspeção pertence a outro capítulo.');
    if (!alive.current || ticket !== epoch.current) return;
    setObserved(value);
    if (value.state !== 'ready') {
      setChosen(false);
      onChange(null);
    }
  }
  async function query(saved: PassageInspectionIntent) {
    const ticket = epoch.current;
    const value = await getLiteraryPassageInspection(bookId, saved.inspectionId);
    if (
      value.inspectionId !== saved.inspectionId ||
      value.chapterId !== saved.chapterId ||
      (saved.version === 2 &&
        (value.expectedScopeToken !== saved.expectedScopeToken ||
          value.publicationId !== saved.publicationId))
    )
      throw new Error('A resposta pertence a outra origem de inspeção.');
    adopt(value, ticket);
    return value;
  }
  function startWire(saved: PassageInspectionIntent): StartPassageInspection {
    if (saved.version !== 2 || !saved.expectedScopeToken)
      throw new Error(
        'Acompanhamento antigo: consulte a inspeção existente sem recriar seu início.',
      );
    return {
      target: { kind: 'book', id: saved.bookId },
      inspectionId: saved.inspectionId,
      chapterId: saved.chapterId,
      expectedScopeToken: saved.expectedScopeToken,
      ...(saved.publicationId ? { publicationId: saved.publicationId } : {}),
    };
  }
  async function sendStart(saved: PassageInspectionIntent) {
    if (saved.cancelRequested === true)
      throw new Error(
        'O encerramento já foi solicitado; confirme-o antes de iniciar outra inspeção.',
      );
    const ticket = epoch.current;
    await startLiteraryPassageInspection(startWire(saved));
    if (ticket === epoch.current) await query(saved);
  }
  async function cancel() {
    if (!intent || closing.current || disabled || !actorId) return;
    closing.current = true;
    const ticket = ++epoch.current;
    setCanceling(true);
    setError(null);
    setChosen(false);
    onChange(null);
    try {
      const saved = await markPassageInspectionCancellation(intent);
      if (alive.current) setIntent(saved);
      if (saved.version === 2) await cancelLiteraryPassageInspectionStart(startWire(saved));
      else {
        const fresh = await query(saved);
        await cancelLiteraryPassageInspection({
          target: { kind: 'book', id: bookId },
          inspectionId: saved.inspectionId,
          expectedOriginToken: fresh.originToken,
          expectedRevision: fresh.revision,
        });
      }
      const confirmed = await query(saved);
      if (confirmed.state !== 'canceled')
        throw new Error('O encerramento ainda não foi confirmado. Preserve o acompanhamento.');
      // The permanent server fence makes a late start ACK harmless; do not wait for it.
      if (alive.current && ticket === epoch.current) {
        working.current = false;
        setBusy(false);
      }
    } catch (cause) {
      if (alive.current && ticket === epoch.current)
        setError(
          cause instanceof Error ? cause.message : 'Não foi possível confirmar o encerramento.',
        );
    } finally {
      closing.current = false;
      if (alive.current) setCanceling(false);
    }
  }
  const continuingAct =
    observed?.previous?.actId !== null &&
    observed?.previous?.actId === observed?.chapterActId &&
    unit === 'act';
  const publicationMissing = !!(
    required &&
    observed?.previous &&
    !continuingAct &&
    !observed.publication
  );
  const locked = disabled || busy || canceling;
  return (
    <section className={styles.panel} aria-label="Inspeção de entrada e publicação">
      <h4>Conferir a entrada neste capítulo</h4>
      <p>
        {required
          ? 'O contrato exige publicação da unidade anterior antes do avanço.'
          : 'Você pode conferir a ordem e a edição anterior antes de escolher a passagem.'}{' '}
        A conferência não gera texto nem publica.
      </p>
      {error && <Alert variant="destructive">{error}</Alert>}
      {busy && <LoadingState label="Consultando a inspeção…" />}
      <Button
        variant="outline"
        disabled={locked}
        onClick={() =>
          void run(() => {
            const saved = readPassageInspectionIntent(actorId, bookId, chapterId);
            setIntent(saved);
            setObserved(null);
            setChosen(false);
            onChange(null);
          })
        }
      >
        Consultar acompanhamento deste capítulo
      </Button>
      {!intent && (
        <>
          <Button
            variant="outline"
            disabled={locked}
            onClick={() =>
              void run(async () => {
                const page = await listLiteraryPublications(bookId);
                if (alive.current) {
                  setPublications(page.items);
                  setAfter(page.nextAfterId);
                  setLoaded(true);
                }
              })
            }
          >
            Consultar edições confirmadas
          </Button>
          {loaded &&
            !publications.some(
              (item) => item.state === 'published' && item.publicationConfirmed,
            ) && (
              <EmptyState
                title="Nenhuma edição confirmada nesta página"
                description="A primeira unidade e a continuação dentro do ato podem usar apenas a inspeção de ordem. Para uma fronteira, confirme a publicação anterior ou consulte a próxima página."
              />
            )}
          <Dropdown
            mode="select"
            label="Edição para conferir a unidade anterior"
            value={publicationId || 'none'}
            disabled={locked}
            options={[
              { value: 'none', label: 'Somente conferir ordem e predecessora' },
              ...publications
                .filter((item) => item.state === 'published' && item.publicationConfirmed)
                .map((item) => ({
                  value: item.jobId,
                  label:
                    (item.title ?? 'Edição') +
                    ' · ' +
                    new Date(item.publishedAt ?? item.createdAt).toLocaleString('pt-BR'),
                })),
            ]}
            onValueChange={(id) => setPublicationId(id === 'none' ? '' : id)}
          />
          {after && (
            <Button
              variant="outline"
              disabled={locked}
              onClick={() =>
                void run(async () => {
                  const page = await listLiteraryPublications(bookId, after);
                  if (alive.current) {
                    setPublications((old) => [
                      ...old,
                      ...page.items.filter((v) => !old.some((x) => x.jobId === v.jobId)),
                    ]);
                    setAfter(page.nextAfterId);
                  }
                })
              }
            >
              Mais edições confirmadas
            </Button>
          )}
          <Button
            disabled={locked || !actorId}
            onClick={() =>
              void run(async () => {
                const source = await getLiteraryPassageInspectionScope(bookId, chapterId);
                if (source.chapterId !== chapterId)
                  throw new Error('A origem pertence a outro capítulo.');
                const saved = await reservePassageInspectionIntent(
                  actorId,
                  bookId,
                  chapterId,
                  publicationId || null,
                  source.scopeToken,
                );
                if (alive.current) setIntent(saved);
                await sendStart(saved);
              })
            }
          >
            Iniciar inspeção da ordem
          </Button>
        </>
      )}
      {intent && (
        <>
          <p>
            Há uma inspeção acompanhada neste navegador para este capítulo. Consultar não avança nem
            repete o início.
          </p>
          <Button
            variant="outline"
            disabled={locked}
            onClick={() =>
              void run(async () => {
                await query(intent);
              })
            }
          >
            Consultar inspeção salva
          </Button>
          {intent.cancelRequested === true && (
            <Alert>
              Encerramento solicitado. Consulte ou repita somente o encerramento; o início e o
              avanço continuam bloqueados.
            </Alert>
          )}
          {intent.version === 1 && (
            <Alert>
              Acompanhamento antigo: consulte a inspeção existente. O início não será recriado com
              uma origem nova.
            </Alert>
          )}
          {!observed && intent.version === 2 && intent.cancelRequested !== true && (
            <Button
              variant="outline"
              disabled={locked}
              onClick={() => void run(() => sendStart(intent))}
            >
              Repetir o mesmo início da inspeção
            </Button>
          )}
          {observed?.state !== 'canceled' && (
            <Button
              variant="outline"
              disabled={disabled || canceling || !actorId}
              onClick={() => void cancel()}
            >
              Encerrar inspeção
            </Button>
          )}
          {observed && (
            <>
              <p role="status">
                {labels[observed.state]} · {observed.scanned} capítulos conferidos ·{' '}
                {observed.verified} reconferidos · {observed.publicationChecked} publicados
                conferidos.
              </p>
              {intent.cancelRequested !== true &&
                !['ready', 'stale', 'canceled'].includes(observed.state) && (
                  <Button
                    disabled={locked}
                    onClick={() =>
                      void run(async () => {
                        const ticket = epoch.current;
                        const fresh = await query(intent);
                        if (ticket !== epoch.current) return;
                        if (['stale', 'canceled'].includes(fresh.state))
                          throw new Error(
                            'A inspeção precisa ser encerrada e refeita com a origem atual.',
                          );
                        adopt(
                          await advanceLiteraryPassageInspection({
                            target: { kind: 'book', id: bookId },
                            inspectionId: intent.inspectionId,
                            expectedOriginToken: fresh.originToken,
                            expectedRevision: fresh.revision,
                          }),
                          ticket,
                        );
                      })
                    }
                  >
                    Conferir próxima página da inspeção
                  </Button>
                )}
              {observed.state === 'ready' && (
                <>
                  <p>
                    {observed.previous
                      ? 'Predecessora imediata: ' + observed.previous.title
                      : 'Primeira unidade: não há capítulo anterior na ordem conferida.'}
                  </p>
                  {observed.publication && (
                    <p>
                      Publicação conferida: {observed.publication.count} capítulos da unidade
                      anterior.
                    </p>
                  )}
                  {publicationMissing && (
                    <Alert>
                      Esta passagem exige uma edição confirmada. Encerre esta inspeção e inicie
                      outra selecionando a edição anterior.
                    </Alert>
                  )}
                  <Button
                    disabled={locked || publicationMissing || intent.cancelRequested === true}
                    onClick={() =>
                      void run(async () => {
                        const ticket = epoch.current;
                        const fresh = await query(intent);
                        if (ticket !== epoch.current) return;
                        if (fresh.state !== 'ready')
                          throw new Error(
                            'A inspeção mudou. Consulte sua origem antes de escolher.',
                          );
                        if (!alive.current) return;
                        onChange({
                          inspectionId: fresh.inspectionId,
                          contractRevision,
                          chapterActId: fresh.chapterActId,
                          previousChapterId: fresh.previous?.id ?? null,
                        });
                        setChosen(true);
                      })
                    }
                  >
                    Usar inspeção conferida neste ciclo
                  </Button>
                  {chosen && <p>Inspeção escolhida. O registro do ciclo reconferirá sua origem.</p>}
                </>
              )}
              {observed.state === 'canceled' && (
                <Button
                  variant="outline"
                  disabled={locked}
                  onClick={() =>
                    void run(async () => {
                      const fresh = await query(intent);
                      if (fresh.state !== 'canceled')
                        throw new Error(
                          'Confirme o encerramento antes de remover o acompanhamento.',
                        );
                      await releasePassageInspectionIntent(intent);
                      if (alive.current) {
                        setIntent(null);
                        setObserved(null);
                        setChosen(false);
                        onChange(null);
                      }
                    })
                  }
                >
                  Remover acompanhamento encerrado
                </Button>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
