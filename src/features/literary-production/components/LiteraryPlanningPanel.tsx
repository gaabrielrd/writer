import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import {
  Alert,
  Badge,
  Button,
  Dropdown,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  Textarea,
} from '@/shared/ui';
import { statusLabels, type EditorialStatus } from '../model/editorial';
import {
  referenceLabels,
  type LiteraryPlan,
  type LiteraryPlanPage,
  type LiteraryPlanState,
  type LiteraryReferenceKind,
  type LiteraryReferencePage,
  type LiteraryReference,
  type SaveLiteraryPlan,
} from '../model/planning';
import {
  getLiteraryPlan,
  getLiteraryPlanVersion,
  listLiteraryPlanVersions,
  listLiteraryPlans,
  listLiteraryReferences,
  listLiteraryVolumeBooks,
  saveLiteraryPlan,
} from '../services/literaryPlanningService';
import styles from './EditorialContractPanel.module.css';
import { LiteraryProposalPanel } from './LiteraryProposalPanel';

const referenceKey = (ref: Pick<LiteraryReference, 'kind' | 'scopeId' | 'id'>) =>
  JSON.stringify([ref.kind, ref.scopeId, ref.id]);
interface Props {
  bookId: string;
  onWorkChange?: (state: { dirty: boolean; pending: boolean }) => void;
  captureGeneration?: () => unknown;
}
export function LiteraryPlanningPanel(props: Props) {
  const { user } = useAuth();
  return <PlanningSession key={(user?.uid ?? 'anonymous') + ':' + props.bookId} {...props} />;
}
function PlanningSession({ bookId, onWorkChange, captureGeneration }: Props) {
  const { user } = useAuth();
  const [page, setPage] = useState<LiteraryPlanPage | null>(null);
  const [entry, setEntry] = useState<LiteraryPlanState | null>(null);
  const [draft, setDraft] = useState<LiteraryPlan | null>(null);
  const [kind, setKind] = useState('bookOverview');
  const [volumeBooks, setVolumeBooks] = useState<Awaited<
    ReturnType<typeof listLiteraryVolumeBooks>
  > | null>(null);
  const [sourceBookId, setSourceBookId] = useState('');
  const [sourceUnitKind, setSourceUnitKind] = useState<
    'act' | 'chapter' | 'scene' | 'arc' | 'event'
  >('chapter');
  const [referenceKind, setReferenceKind] = useState<LiteraryReferenceKind>('chapter');
  const [referencePurpose, setReferencePurpose] = useState<'source' | 'subject'>('subject');
  const [references, setReferences] = useState<LiteraryReferencePage | null>(null);
  const [pending, setPending] = useState<SaveLiteraryPlan | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [compare, setCompare] = useState<LiteraryPlanState | null>(null);
  const [versions, setVersions] = useState<Awaited<
    ReturnType<typeof listLiteraryPlanVersions>
  > | null>(null);
  const [historical, setHistorical] = useState<LiteraryPlanState | null>(null);
  const [referenceNames, setReferenceNames] = useState<Record<string, string>>({});
  const epoch = useRef(0);
  const working = useRef(false);
  useEffect(() => {
    onWorkChange?.({
      dirty: !!draft && JSON.stringify(draft) !== JSON.stringify(entry?.plan),
      pending: pending !== null,
    });
  }, [draft, entry, pending, onWorkChange]);
  useEffect(() => {
    const current = ++epoch.current;
    void listLiteraryPlans(bookId)
      .then((result) => {
        if (epoch.current === current) {
          setPage(result);
          setLoading(false);
        }
      })
      .catch((cause: unknown) => {
        if (epoch.current === current) {
          setError(cause instanceof Error ? cause.message : 'Planejamento indisponível.');
          setLoading(false);
        }
      });
    return () => {
      epoch.current = current + 1;
    };
  }, [bookId]);
  const run = async (task: () => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    const current = epoch.current;
    try {
      await task();
    } catch (cause) {
      if (epoch.current === current)
        setError(cause instanceof Error ? cause.message : 'Não foi possível concluir.');
    } finally {
      if (epoch.current === current) {
        working.current = false;
        setBusy(false);
      }
    }
  };
  const loadPage = (afterId: string | null = null) =>
    run(async () => {
      const current = epoch.current;
      const result = await listLiteraryPlans(bookId, afterId);
      if (epoch.current === current) {
        setLoading(false);
        setPage((previous) => ({
          ...result,
          items: afterId ? [...(previous?.items ?? []), ...result.items] : result.items,
        }));
      }
    });
  const open = (id: string) =>
    run(async () => {
      const current = epoch.current;
      const result = await getLiteraryPlan(bookId, id);
      if (epoch.current !== current) return;
      if (draft) {
        setCompare(result);
        return;
      }
      setEntry(result);
      setDraft(result.plan);
      setReferences(null);
      setVersions(null);
      setHistorical(null);
    });
  const newDraft = () => {
    if (!page || draft || !page.schema[kind]) return;
    setEntry(null);
    setDraft({
      kind,
      title: '',
      status: 'working',
      fields: Object.fromEntries(Object.keys(page.schema[kind].fields).map((key) => [key, ''])),
      references: [],
    });
  };
  const save = () =>
    run(async () => {
      if (!draft) return;
      const current = epoch.current;
      const request = pending ?? {
        target: { kind: 'book' as const, id: bookId },
        id: entry?.id ?? crypto.randomUUID(),
        operationId: crypto.randomUUID(),
        expectedRevision: entry?.revision ?? 0,
        plan: structuredClone(draft),
      };
      setPending(request);
      let result;
      try {
        result = await saveLiteraryPlan(request, user?.uid ?? '');
      } catch (cause) {
        const code =
          typeof cause === 'object' && cause !== null && 'code' in cause ? String(cause.code) : '';
        if (
          [
            'functions/invalid-argument',
            'functions/failed-precondition',
            'functions/not-found',
            'functions/unauthenticated',
            'functions/permission-denied',
          ].includes(code)
        )
          setPending(null);
        throw cause;
      }
      if (epoch.current !== current) return;
      setPending(null);
      setVersions(null);
      setHistorical(null);
      // Receipt confirms this version; a later remote edit is never silently adopted.
      setEntry({
        schemaVersion: 1,
        ...result,
        createdAt: entry?.createdAt ?? result.updatedAt,
        plan: request.plan,
        sources: [],
      });
      setDraft(request.plan);
      setNotice('Documento salvo como revisão ' + result.revision + '.');
      const next = await listLiteraryPlans(bookId);
      if (epoch.current === current) setPage(next);
    });
  const browseVolumeBooks = (afterId: string | null = null) =>
    run(async () => {
      const current = epoch.current;
      const result = await listLiteraryVolumeBooks(bookId, afterId);
      if (epoch.current !== current) return;
      setVolumeBooks((previous) => ({
        ...result,
        items: afterId ? [...(previous?.items ?? []), ...result.items] : result.items,
      }));
    });
  const browseReferences = (afterId: string | null = null) =>
    run(async () => {
      const current = epoch.current;
      const selected = referenceKind;
      const result = await listLiteraryReferences(
        bookId,
        selected,
        afterId,
        referencePurpose,
        selected === 'volumeUnit' ? { bookId: sourceBookId, kind: sourceUnitKind } : undefined,
      );
      if (epoch.current !== current) return;
      setReferences((previous) => ({
        ...result,
        items: afterId ? [...(previous?.items ?? []), ...result.items] : result.items,
      }));
      setReferenceNames((previous) => ({
        ...previous,
        ...Object.fromEntries(
          result.items.map((item) => [referenceKey(item.reference), item.label]),
        ),
      }));
    });
  const history = (before: number | null = null) =>
    run(async () => {
      if (!entry) return;
      const current = epoch.current;
      const result = await listLiteraryPlanVersions(bookId, entry.id, before);
      if (epoch.current === current)
        setVersions((previous) => ({
          ...result,
          items: before ? [...(previous?.items ?? []), ...result.items] : result.items,
        }));
    });
  const inspectHistory = (revision: number) =>
    run(async () => {
      if (!entry) return;
      const current = epoch.current;
      const result = await getLiteraryPlanVersion(bookId, entry.id, revision);
      if (epoch.current === current) setHistorical(result);
    });
  if (loading) return <LoadingState label="Abrindo planejamento editorial…" />;
  if (!page)
    return (
      <ErrorState message={error ?? 'Planejamento indisponível.'} onRetry={() => void loadPage()} />
    );
  const referenceLabel = (ref: LiteraryReference) => {
    const saved = entry?.sources.find((source) => source.reference.sourceToken === ref.sourceToken);
    if (saved && !saved.available) return 'Fonte indisponível';
    return saved?.label ?? referenceNames[referenceKey(ref)] ?? 'Referência selecionada';
  };
  const disabled = busy || pending !== null;
  return (
    <section className={styles.panel} aria-label="Arquitetura literária">
      <h2>Arquitetura literária</h2>
      <p>
        Planeje a função das unidades e registre continuidade. Uma ficha expressa intenção; ela não
        comprova que o efeito existe no manuscrito.
      </p>
      {error && <Alert variant="destructive">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}
      {pending && (
        <Alert>Confirme o salvamento pendente antes de editar ou abrir outro documento.</Alert>
      )}
      {!page.items.length && (
        <EmptyState
          title="Planejamento ainda não registrado"
          description="Comece pela visão do livro ou prepare a unidade em que está trabalhando."
        />
      )}
      <ul>
        {page.items.map((row) => (
          <li key={row.id}>
            <Button variant="ghost" disabled={disabled} onClick={() => void open(row.id)}>
              {row.title}
            </Button>{' '}
            <Badge>{statusLabels[row.status]}</Badge>
          </li>
        ))}
      </ul>
      {page.nextAfterId && (
        <Button
          variant="outline"
          disabled={disabled}
          onClick={() => void loadPage(page.nextAfterId)}
        >
          Mais documentos
        </Button>
      )}
      {!draft && (
        <div className={styles.decisionForm}>
          <Dropdown
            mode="select"
            label="Documento"
            value={kind}
            options={Object.entries(page.schema).map(([value, schema]) => ({
              value,
              label: schema.label,
            }))}
            onValueChange={setKind}
            disabled={disabled}
          />
          <Button onClick={newDraft} disabled={disabled}>
            Preparar documento
          </Button>
        </div>
      )}
      {compare && (
        <section className={styles.comparison} aria-label="Comparação com documento salvo">
          <h3>
            {compare.plan.title} · revisão {compare.revision}
          </h3>
          <dl>
            {Object.entries(compare.plan.fields).map(([key, value]) => (
              <div key={key}>
                <dt>{page.schema[compare.plan.kind]?.fields[key] ?? key}</dt>
                <dd>{value || 'Não definido'}</dd>
              </div>
            ))}
          </dl>
          <Button
            variant="outline"
            disabled={disabled}
            onClick={() => {
              setEntry(compare);
              setDraft(compare.plan);
              setCompare(null);
              setReferences(null);
            }}
          >
            Descartar rascunho e abrir este documento
          </Button>
          <Button variant="ghost" onClick={() => setCompare(null)}>
            Manter rascunho
          </Button>
        </section>
      )}
      {draft && (
        <>
          <h3>{page.schema[draft.kind]?.label ?? draft.kind}</h3>
          {entry?.sources.some((source) => !source.available || source.changed) && (
            <Alert variant="warning">
              Há referências alteradas ou indisponíveis. Confira as versões e reconcilie a ficha.
              Atualizar um vínculo não revisa nem altera o manuscrito.
            </Alert>
          )}
          {entry?.sources
            .filter((source) => source.changed || !source.available)
            .map((source) => {
              const current = source.currentReference;
              const index = draft.references.findIndex(
                (reference) =>
                  reference.kind === source.reference.kind &&
                  reference.id === source.reference.id &&
                  reference.scopeId === source.reference.scopeId &&
                  reference.sourceToken === source.reference.sourceToken &&
                  reference.revision === source.reference.revision &&
                  reference.purpose === source.reference.purpose,
              );
              return (
                <section
                  key={source.reference.kind + ':' + source.reference.id}
                  className={styles.comparison}
                  aria-label="Reconciliação de referência"
                >
                  <p>
                    {source.label ?? referenceLabels[source.reference.kind]} · referência registrada
                    na revisão {source.reference.revision}.
                    {current
                      ? ' A fonte atual está na revisão ' + current.revision + '.'
                      : ' A mesma origem não está disponível. Escolha outra fonte explicitamente ou remova o vínculo.'}
                  </p>
                  {current && index >= 0 && (
                    <Button
                      variant="outline"
                      disabled={disabled}
                      onClick={() => {
                        setDraft({
                          ...draft,
                          status: 'working',
                          references: draft.references.map((reference, at) =>
                            at === index ? current : reference,
                          ),
                        });
                        setNotice(
                          'Vínculo atualizado apenas no rascunho. A ficha está em desenvolvimento: confira seu conteúdo antes de salvar e aprovar novamente. O manuscrito foi preservado.',
                        );
                      }}
                    >
                      Usar referência atual e revisar ficha
                    </Button>
                  )}
                </section>
              );
            })}
          <Input
            label="Título do documento"
            maxLength={300}
            value={draft.title}
            disabled={disabled}
            onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          />
          <Dropdown
            mode="select"
            label="Situação editorial"
            value={draft.status}
            disabled={disabled}
            options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))}
            onValueChange={(value) => setDraft({ ...draft, status: value as EditorialStatus })}
          />
          {draft.status === 'approved' && (
            <p>Salvar com esta situação registra seu aceite autoral deste planejamento.</p>
          )}
          <div className={styles.fields}>
            {Object.entries(
              page.schema[draft.kind]?.fields ??
                Object.fromEntries(Object.keys(draft.fields).map((key) => [key, key])),
            ).map(([key, label]) => (
              <Textarea
                key={key}
                label={label}
                maxLength={6000}
                value={draft.fields[key] ?? ''}
                disabled={disabled}
                onChange={(event) =>
                  setDraft({ ...draft, fields: { ...draft.fields, [key]: event.target.value } })
                }
              />
            ))}
          </div>
          <LiteraryProposalPanel
            key={entry?.id ?? 'new:' + draft.kind}
            bookId={bookId}
            draft={draft}
            revision={entry?.revision ?? 0}
            schema={page.schema}
            plans={page.items}
            disabled={disabled}
            captureGeneration={captureGeneration}
            onUse={setDraft}
          />
          <h4>Referências explícitas</h4>
          <p>Vincule as unidades existentes. Mudar a ordem não muda suas identidades.</p>
          <ul>
            {draft.references.map((ref, index) => (
              <li key={referenceKey(ref)}>
                {referenceLabels[ref.kind]} · {referenceLabel(ref)}
                <Button
                  variant="ghost"
                  disabled={disabled}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      references: draft.references.filter((_, at) => at !== index),
                    })
                  }
                >
                  Remover vínculo
                </Button>
              </li>
            ))}
          </ul>
          <div className={styles.decisionForm}>
            <Dropdown
              mode="select"
              label="Tipo de vínculo"
              value={referencePurpose}
              disabled={disabled || referenceKind === 'volumeUnit'}
              options={[
                { value: 'subject', label: 'Unidade planejada' },
                { value: 'source', label: 'Fonte para análise' },
              ]}
              onValueChange={(value) => {
                setReferencePurpose(value as 'subject' | 'source');
                setReferences(null);
              }}
            />
            <p>
              Unidade planejada identifica a quem esta ficha se refere. Fonte para análise inclui o
              conteúdo atual nas verificações.
            </p>
            <Dropdown
              mode="select"
              label="Origem da referência"
              value={referenceKind}
              options={Object.entries(referenceLabels).map(([value, label]) => ({ value, label }))}
              disabled={disabled}
              onValueChange={(value) => {
                setReferenceKind(value as LiteraryReferenceKind);
                if (value === 'volumeUnit') setReferencePurpose('source');
                setReferences(null);
              }}
            />
            {referenceKind === 'volumeUnit' && (
              <>
                <p>
                  Escolha um livro seu e a unidade de origem. O vínculo não inclui o volume inteiro
                  nem o transforma em parte deste manuscrito.
                </p>
                <Button
                  variant="outline"
                  disabled={disabled}
                  onClick={() => void browseVolumeBooks()}
                >
                  Consultar meus volumes
                </Button>
                {volumeBooks && volumeBooks.items.length === 0 && (
                  <EmptyState
                    title="Nenhum outro volume nesta página"
                    description="Continue a lista ou crie outro livro para vincular suas unidades."
                  />
                )}
                {volumeBooks && (
                  <Dropdown
                    mode="select"
                    label="Volume de origem"
                    value={sourceBookId}
                    disabled={disabled}
                    options={volumeBooks.items.map((item) => ({
                      value: item.id,
                      label: item.title + ' · ' + item.id,
                    }))}
                    onValueChange={(value) => {
                      setSourceBookId(value);
                      setReferences(null);
                    }}
                  />
                )}
                {volumeBooks?.nextAfterId && (
                  <Button
                    variant="outline"
                    disabled={disabled}
                    onClick={() => void browseVolumeBooks(volumeBooks.nextAfterId)}
                  >
                    Mais volumes
                  </Button>
                )}
                <Dropdown
                  mode="select"
                  label="Unidade no volume de origem"
                  value={sourceUnitKind}
                  disabled={disabled}
                  options={['act', 'chapter', 'scene', 'arc', 'event'].map((value) => ({
                    value,
                    label: referenceLabels[value as 'chapter'],
                  }))}
                  onValueChange={(value) => {
                    setSourceUnitKind(value as typeof sourceUnitKind);
                    setReferences(null);
                  }}
                />
              </>
            )}
            <Button
              disabled={disabled || (referenceKind === 'volumeUnit' && !sourceBookId)}
              variant="outline"
              onClick={() => void browseReferences()}
            >
              Consultar referências
            </Button>
            {references && references.items.length === 0 && (
              <p>Nenhuma referência disponível nesta página.</p>
            )}
            {references?.items.map((item) => (
              <Button
                key={item.reference.kind + ':' + item.reference.id}
                variant="ghost"
                className={styles.sourceButton}
                disabled={
                  disabled ||
                  draft.references.length >= 12 ||
                  draft.references.some(
                    (ref) =>
                      ref.kind === item.reference.kind &&
                      ref.id === item.reference.id &&
                      ref.scopeId === item.reference.scopeId,
                  )
                }
                onClick={() =>
                  setDraft({ ...draft, references: [...draft.references, item.reference] })
                }
              >
                Vincular {item.label}
              </Button>
            ))}
            {references?.nextAfterId && (
              <Button
                disabled={disabled}
                variant="outline"
                onClick={() => void browseReferences(references.nextAfterId)}
              >
                Mais referências
              </Button>
            )}
          </div>
          <div className={styles.actions}>
            <Button disabled={busy || !draft.title.trim()} onClick={() => void save()}>
              {pending ? 'Recuperar salvamento' : 'Salvar documento'}
            </Button>
            {entry && (
              <Button disabled={disabled} variant="outline" onClick={() => void open(entry.id)}>
                Comparar com servidor
              </Button>
            )}
            {entry && (
              <Button disabled={disabled} variant="ghost" onClick={() => void history()}>
                Consultar versões
              </Button>
            )}
            <Button
              disabled={disabled}
              variant="ghost"
              onClick={() => {
                setDraft(null);
                setEntry(null);
                setCompare(null);
                setReferences(null);
              }}
            >
              Fechar rascunho sem salvar
            </Button>
          </div>
        </>
      )}
      {versions && (
        <section aria-label="Versões do planejamento">
          <h3>Versões preservadas</h3>
          {versions.items.map((row) => (
            <Button
              key={row.revision}
              disabled={disabled}
              variant="ghost"
              onClick={() => void inspectHistory(row.revision)}
            >
              Consultar revisão {row.revision}
            </Button>
          ))}
          {versions.nextBeforeRevision !== null && (
            <Button
              disabled={disabled}
              variant="outline"
              onClick={() => void history(versions.nextBeforeRevision)}
            >
              Mais versões
            </Button>
          )}
        </section>
      )}
      {historical && (
        <section className={styles.comparison} aria-label="Planejamento histórico">
          <h3>
            {historical.plan.title} · revisão {historical.revision}
          </h3>
          <dl>
            {Object.entries(historical.plan.fields).map(([key, value]) => (
              <div key={key}>
                <dt>{page.schema[historical.plan.kind]?.fields[key] ?? key}</dt>
                <dd>{value || 'Não definido'}</dd>
              </div>
            ))}
          </dl>
          <Button variant="ghost" onClick={() => setHistorical(null)}>
            Fechar consulta
          </Button>
        </section>
      )}
    </section>
  );
}
