import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
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
import { renderRichText } from '@/shared/lib';
import { useAuth } from '@/features/auth';
import {
  listLiteraryIntegrations,
  type LiteraryIntegration,
} from '../services/literaryIntegrationService';
import { listLiteraryReferences } from '../services/literaryPlanningService';
import { LiteraryReaderGuideEditor } from './LiteraryReaderGuideEditor';
import { publicationUnitLabels, type EditorialState } from '../model/editorial';
import * as publication from '../services/literaryPublicationService';
import styles from './EditorialContractPanel.module.css';
type Props = {
  bookId: string;
  editorialState: EditorialState | null;
  onWorkChange?: (state: { dirty: boolean; pending: boolean }) => void;
  onPublicationChange?: () => void;
};
const labels: Record<publication.LiteraryPublication['state'], string> = {
  planning: 'Identificando capítulos',
  compiling: 'Compilando o texto',
  verifying: 'Reconferindo o manifesto',
  prepared: 'Manifesto preparado; publicação pendente',
  checkingGuide: 'Conferindo o guia',
  verified: 'Edição conferida; confirmação pendente',
  published: 'Publicação confirmada',
  canceled: 'Edição cancelada',
  stale: 'Fontes alteradas; prepare outra versão',
};
const startChecks = () => ({
  finalTextReviewed: false,
  navigationReviewed: false,
  publicationAuthorized: false,
});
const finalChecks = () => ({
  wholeTextChecked: false,
  guideChecked: false,
  removalsChecked: false,
  authorizePublicRelease: false,
});
const definite = (cause: unknown) =>
  typeof cause === 'object' &&
  cause !== null &&
  'code' in cause &&
  [
    'functions/invalid-argument',
    'functions/failed-precondition',
    'functions/not-found',
    'functions/permission-denied',
    'functions/unauthenticated',
    'functions/resource-exhausted',
    'functions/already-exists',
  ].includes(String(cause.code));
export function LiteraryPublicationPanel(props: Props) {
  const { user } = useAuth();
  return (
    <PublicationSession key={user?.uid + ':' + props.bookId} {...props} actorId={user?.uid ?? ''} />
  );
}
function PublicationSession({
  bookId,
  actorId,
  editorialState,
  onWorkChange,
  onPublicationChange,
}: Props & { actorId: string }) {
  const [page, setPage] = useState<Awaited<
      ReturnType<typeof publication.listLiteraryPublications>
    > | null>(null),
    [integrations, setIntegrations] = useState<{
      items: LiteraryIntegration[];
      nextAfterId: string | null;
    } | null>(null),
    [targets, setTargets] = useState<Awaited<ReturnType<typeof listLiteraryReferences>> | null>(
      null,
    ),
    [policy, setPolicy] = useState<publication.PublicationPolicy>('book'),
    [unitId, setUnitId] = useState(''),
    [integrationId, setIntegrationId] = useState(''),
    [authorName, setAuthorName] = useState(''),
    [checks, setChecks] = useState(startChecks),
    [job, setJob] = useState<publication.LiteraryPublication | null>(null),
    [manifest, setManifest] = useState<Awaited<
      ReturnType<typeof publication.listLiteraryPublicationManifest>
    > | null>(null),
    [removals, setRemovals] = useState<Awaited<
      ReturnType<typeof publication.listLiteraryPublicationRemovals>
    > | null>(null),
    [preview, setPreview] = useState<Awaited<
      ReturnType<typeof publication.getLiteraryPublicationChapter>
    > | null>(null),
    [guideWork, setGuideWork] = useState({ dirty: false, pending: false }),
    [releaseChecks, setReleaseChecks] = useState(finalChecks),
    [releaseFor, setReleaseFor] = useState(''),
    [pendingStart, setPendingStart] = useState<publication.StartPublication | null>(null),
    [pendingConfirm, setPendingConfirm] = useState<publication.ConfirmPublication | null>(null),
    [confirmation, setConfirmation] = useState<publication.PublicationConfirmation | null>(null),
    [busy, setBusy] = useState(false),
    [processing, setProcessing] = useState(false),
    [error, setError] = useState<string | null>(null),
    [notice, setNotice] = useState<string | null>(null);
  const configuredUnit = editorialState?.contract.publicationPolicy?.unit ?? null;
  const policyMismatch = configuredUnit !== null && policy !== configuredUnit;
  const epoch = useRef(0),
    working = useRef(false),
    pause = useRef(false),
    setupDirty =
      !!authorName ||
      !!integrationId ||
      !!unitId ||
      policy !== 'book' ||
      Object.values(checks).some(Boolean),
    pending = !!pendingStart || !!pendingConfirm || guideWork.pending,
    locked = busy || pending,
    dirty = setupDirty || guideWork.dirty,
    editionKey = JSON.stringify([job?.jobId, job?.manifestHash, job?.guideHash, job?.removalHash]),
    acknowledged = releaseFor === editionKey ? releaseChecks : finalChecks();
  useEffect(() => {
    onWorkChange?.({ dirty, pending: pending || busy });
  }, [dirty, pending, busy, onWorkChange]);
  useEffect(() => {
    const current = ++epoch.current;
    if (actorId)
      void Promise.all([
        publication.listLiteraryPublications(bookId),
        listLiteraryIntegrations(bookId),
      ])
        .then(([p, i]) => {
          if (epoch.current === current) {
            setPage(p);
            setIntegrations(i);
          }
        })
        .catch((cause: unknown) => {
          if (epoch.current === current)
            setError(
              cause instanceof Error ? cause.message : 'Não foi possível carregar as edições.',
            );
        });
    return () => {
      epoch.current += 1;
      pause.current = true;
    };
  }, [actorId, bookId]);
  const run = async (task: (current: number) => Promise<void>) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    setNotice(null);
    const current = epoch.current;
    try {
      await task(current);
    } catch (cause) {
      if (epoch.current === current)
        setError(cause instanceof Error ? cause.message : 'Não foi possível concluir esta etapa.');
    } finally {
      if (epoch.current === current) {
        working.current = false;
        setBusy(false);
        setProcessing(false);
      }
    }
  };
  const loadPage = (afterId: string | null = null) =>
    run(async (current) => {
      const result = await publication.listLiteraryPublications(bookId, afterId);
      if (epoch.current === current)
        setPage((previous) => ({
          ...result,
          items: afterId ? [...(previous?.items ?? []), ...result.items] : result.items,
        }));
    });
  const loadIntegrations = (afterId: string | null = null) =>
    run(async (current) => {
      const result = await listLiteraryIntegrations(bookId, afterId);
      if (epoch.current === current)
        setIntegrations((previous) => ({
          ...result,
          items: afterId ? [...(previous?.items ?? []), ...result.items] : result.items,
        }));
    });
  const loadTargets = (selected: publication.PublicationPolicy, afterId: string | null = null) =>
    run(async (current) => {
      if (selected === 'book') {
        setTargets(null);
        return;
      }
      const result = await listLiteraryReferences(bookId, selected, afterId, 'subject');
      if (epoch.current === current)
        setTargets((previous) => ({
          ...result,
          items: afterId ? [...(previous?.items ?? []), ...result.items] : result.items,
        }));
    });
  const changePublicationUnit = (value: publication.PublicationPolicy) => {
    setPolicy(value);
    setUnitId('');
    setTargets(null);
    void loadTargets(value);
  };
  const details = async (current: number, next: publication.LiteraryPublication) => {
    const [m, r] = await Promise.all([
      publication.listLiteraryPublicationManifest(bookId, next.jobId),
      publication.listLiteraryPublicationRemovals(bookId, next.jobId),
    ]);
    if (epoch.current === current) {
      setManifest(m);
      setRemovals(r);
    }
  };
  const adopt = (next: publication.LiteraryPublication) => {
    setJob(next);
    setManifest(null);
    setRemovals(null);
    setPreview(null);
    setConfirmation(null);
    setReleaseChecks(finalChecks());
  };
  const refresh = async (current: number, id: string) => {
    const next = await publication.getLiteraryPublication(bookId, id);
    if (next.state === 'unconfirmed')
      throw new Error('Pedido ainda sem confirmação. Consulte novamente sem criar outra edição.');
    if (epoch.current === current) setJob(next);
    return next;
  };
  const steps = async (current: number, initial: publication.LiteraryPublication) => {
    pause.current = false;
    setProcessing(true);
    let next = initial;
    while (epoch.current === current && !pause.current) {
      const compiling = ['planning', 'compiling', 'verifying'].includes(next.state),
        guide = next.state === 'checkingGuide';
      if (!compiling && !guide) break;
      const result = await (guide
        ? publication.advanceLiteraryPublicationGuide(bookId, next.jobId)
        : publication.advanceLiteraryPublication(bookId, next.jobId));
      if (epoch.current !== current) return;
      setJob(result);
      if (
        ['planning', 'compiling', 'verifying', 'checkingGuide'].includes(result.state) &&
        result.progressRevision <= next.progressRevision
      )
        throw new Error('O checkpoint não avançou. Consulte o estado antes de continuar.');
      next = result;
    }
    if (epoch.current === current) {
      await details(current, next);
      setNotice(
        pause.current ? 'Processamento pausado. O checkpoint foi preservado.' : labels[next.state],
      );
    }
  };
  const resetSetup = () => {
    setAuthorName('');
    setIntegrationId('');
    setUnitId('');
    setPolicy('book');
    setTargets(null);
    setChecks(startChecks());
  };
  const start = () =>
    run(async (current) => {
      if (!pendingStart && (!editorialState || policyMismatch))
        throw new Error(
          'Confira a unidade definida no contrato antes de preparar uma nova edição.',
        );
      const accepted = integrations?.items.find((item) => item.jobId === integrationId);
      if (!pendingStart && (!accepted?.sourceToken || !authorName.trim()))
        throw new Error('Escolha a integração aceita e o nome público do autor.');
      const input = pendingStart ?? {
        target: { kind: 'book' as const, id: bookId },
        jobId: crypto.randomUUID(),
        policy,
        unitId: policy === 'book' ? null : unitId,
        integrationId,
        expectedIntegrationToken: accepted!.sourceToken!,
        authorName,
        checks,
      };
      setPendingStart(input);
      let next;
      try {
        next = await publication.startLiteraryPublication(input, actorId);
      } catch (cause) {
        if (epoch.current === current && definite(cause)) setPendingStart(null);
        throw cause;
      }
      if (epoch.current !== current) return;
      setPendingStart(null);
      resetSetup();
      adopt(next);
      onPublicationChange?.();
      next = await refresh(current, next.jobId);
      await steps(current, next);
    });
  const inspectStart = () =>
    run(async (current) => {
      if (!pendingStart) return;
      const receipt = await publication.resolvePublicationRecovery(
        actorId,
        bookId,
        pendingStart.jobId,
        'publication',
        pendingStart.jobId,
        0,
      );
      if (epoch.current !== current) return;
      if (!receipt) {
        setNotice('Edição ainda sem confirmação. Consulte novamente ou repita o mesmo pedido.');
        return;
      }
      const next = await refresh(current, pendingStart.jobId);
      if (epoch.current === current) {
        setPendingStart(null);
        resetSetup();
        adopt(next);
        onPublicationChange?.();
        await details(current, next);
      }
    });
  const open = (id: string) =>
    run(async (current) => {
      const next = await refresh(current, id);
      if (epoch.current === current) {
        adopt(next);
        await details(current, next);
      }
    });
  const verifyGuide = () =>
    run(async (current) => {
      if (!job) return;
      const next = await publication.startLiteraryPublicationGuideVerification(bookId, job);
      if (epoch.current === current) {
        setJob(next);
        setReleaseChecks(finalChecks());
        await steps(current, next);
      }
    });
  const publish = () =>
    run(async (current) => {
      if (!job?.manifestHash || !job.guideHash || !job.removalHash) return;
      const input = pendingConfirm ?? {
        target: { kind: 'book' as const, id: bookId },
        jobId: job.jobId,
        operationId: crypto.randomUUID(),
        expectedManifestHash: job.manifestHash,
        expectedGuideHash: job.guideHash,
        expectedRemovalHash: job.removalHash,
        checks: acknowledged,
      };
      setPendingConfirm(input);
      let result;
      try {
        result = await publication.confirmLiteraryPublication(input, actorId);
      } catch (cause) {
        if (epoch.current === current && definite(cause)) setPendingConfirm(null);
        throw cause;
      }
      if (epoch.current !== current) return;
      setPendingConfirm(null);
      setConfirmation(result);
      setReleaseChecks(finalChecks());
      onPublicationChange?.();
      await refresh(current, job.jobId);
      setNotice('Edição pública confirmada no servidor.');
    });
  const inspectConfirm = () =>
    run(async (current) => {
      if (!pendingConfirm) return;
      const result = await publication.getLiteraryPublicationConfirmation(
        bookId,
        pendingConfirm.jobId,
        pendingConfirm.operationId,
      );
      if (epoch.current !== current) return;
      if (result.state === 'unconfirmed') {
        setNotice(
          'Publicação ainda sem confirmação. Consulte novamente; nenhuma edição foi reenviada.',
        );
        return;
      }
      if (
        result.result.manifestHash !== pendingConfirm.expectedManifestHash ||
        result.result.guideHash !== pendingConfirm.expectedGuideHash ||
        result.result.removalHash !== pendingConfirm.expectedRemovalHash
      )
        throw new Error('O recibo corresponde a outra versão.');
      setConfirmation(result.result);
      onPublicationChange?.();
      await publication.resolvePublicationRecovery(
        actorId,
        bookId,
        pendingConfirm.operationId,
        'publicationConfirm',
        pendingConfirm.jobId,
        0,
      );
      if (epoch.current === current) {
        setPendingConfirm(null);
        await refresh(current, pendingConfirm.jobId);
        setNotice('Confirmação recuperada sem republicar.');
      }
    });
  const accepted =
    integrations?.items.filter(
      (item) =>
        item.state === 'done' &&
        item.authorAccepted &&
        item.sourceToken &&
        (item.unresolvedBlocking ?? item.blocking) === 0,
    ) ?? [];
  const compileChecks = [
    ['finalTextReviewed', 'Conferi o texto final da unidade'],
    ['navigationReviewed', 'Conferi a ordem e a navegação'],
    ['publicationAuthorized', 'Autorizo preparar esta edição'],
  ] as const;
  const releaseLabels = [
    ['wholeTextChecked', 'Conferi o texto integral preparado'],
    ['guideChecked', 'Conferi os campos públicos e os limites de revelação do guia'],
    ['removalsChecked', 'Conferi os capítulos que saem desta edição'],
    ['authorizePublicRelease', 'Autorizo tornar esta edição pública'],
  ] as const;
  if (!actorId) return <EmptyState title="Entre na sua conta para preparar a publicação." />;
  return (
    <section className={styles.panel} aria-label="Publicação versionada">
      <h3>Publicação versionada</h3>
      <p>Prepare o texto, confira o guia e confirme a edição pública em etapas separadas.</p>
      {busy && (
        <LoadingState
          label={
            processing
              ? 'Processando a edição; você pode pausar.'
              : 'Consultando ou salvando a edição...'
          }
        />
      )}
      {processing && (
        <Button
          variant="outline"
          onClick={() => {
            pause.current = true;
          }}
        >
          Pausar processamento
        </Button>
      )}
      {error && <ErrorState message={error} />}
      {notice && <Alert>{notice}</Alert>}
      <div className={styles.decisionForm}>
        <h4>Preparar uma edição</h4>
        {!editorialState ? (
          <Alert>
            Contrato ainda indisponível. Abra Contrato e decisões para carregar ou tentar novamente.
          </Alert>
        ) : (
          <p>
            Unidade conferida no contrato (revisão {editorialState.revision}):{' '}
            {configuredUnit ? publicationUnitLabels[configuredUnit] : 'Não definida'}.
          </p>
        )}
        {policyMismatch && configuredUnit && (
          <Alert>
            O escopo escolhido difere da unidade do contrato. Confira o contrato para mudar essa
            escolha ou use a unidade já salva.
            <Button
              variant="outline"
              disabled={locked}
              onClick={() => changePublicationUnit(configuredUnit)}
            >
              Usar unidade do contrato: {publicationUnitLabels[configuredUnit]}
            </Button>
          </Alert>
        )}
        <Input
          label="Nome público do autor"
          value={authorName}
          maxLength={120}
          disabled={locked}
          onChange={(event) => setAuthorName(event.target.value)}
        />
        <Dropdown
          mode="select"
          label="Política de publicação"
          value={policy}
          disabled={locked}
          options={[
            { value: 'book', label: 'Livro inteiro' },
            { value: 'act', label: 'Até o ato escolhido' },
            { value: 'chapter', label: 'Até o capítulo escolhido' },
          ]}
          onValueChange={(value) => changePublicationUnit(value as publication.PublicationPolicy)}
        />
        {policy !== 'book' && (
          <Dropdown
            mode="select"
            label={policy === 'act' ? 'Ato final da edição' : 'Capítulo final da edição'}
            value={unitId}
            disabled={locked}
            options={[
              { value: '', label: 'Escolha a unidade' },
              ...(targets?.items ?? []).map((item) => ({
                value: item.reference.id,
                label: item.label,
              })),
            ]}
            onValueChange={setUnitId}
          />
        )}
        {targets?.nextAfterId && (
          <Button
            variant="outline"
            disabled={locked}
            onClick={() => void loadTargets(policy, targets.nextAfterId)}
          >
            Mais unidades
          </Button>
        )}
        <Dropdown
          mode="select"
          label="Integração aceita"
          value={integrationId}
          disabled={locked}
          options={[
            { value: '', label: 'Escolha uma integração concluída' },
            ...accepted.map((item) => ({
              value: item.jobId,
              label:
                (item.level === 'book' ? 'Livro' : 'Ato') +
                ' · ' +
                item.chapters +
                ' capítulo(s) · ' +
                new Date(item.completedAt ?? item.createdAt).toLocaleString('pt-BR'),
            })),
          ]}
          onValueChange={setIntegrationId}
        />
        <div className={styles.actions}>
          <Button variant="outline" disabled={locked} onClick={() => void loadIntegrations()}>
            Atualizar integrações
          </Button>
          {integrations?.nextAfterId && (
            <Button
              variant="outline"
              disabled={locked}
              onClick={() => void loadIntegrations(integrations.nextAfterId)}
            >
              Mais integrações
            </Button>
          )}
        </div>
        {compileChecks.map(([key, label]) => (
          <Dropdown
            key={key}
            mode="select"
            label={label}
            value={checks[key] ? 'yes' : 'no'}
            disabled={locked}
            options={[
              { value: 'no', label: 'Pendente' },
              { value: 'yes', label: 'Confirmo' },
            ]}
            onValueChange={(value) => setChecks({ ...checks, [key]: value === 'yes' })}
          />
        ))}
        <div className={styles.actions}>
          <Button
            disabled={
              busy ||
              guideWork.dirty ||
              guideWork.pending ||
              !!pendingConfirm ||
              (!pendingStart &&
                (!editorialState ||
                  policyMismatch ||
                  !authorName.trim() ||
                  !integrationId ||
                  (policy !== 'book' && !unitId) ||
                  !Object.values(checks).every(Boolean)))
            }
            onClick={() => void start()}
          >
            {pendingStart ? 'Repetir a mesma preparação' : 'Preparar manifesto'}
          </Button>
          {pendingStart && (
            <Button variant="outline" disabled={busy} onClick={() => void inspectStart()}>
              Consultar preparação
            </Button>
          )}
          <Button variant="ghost" disabled={locked} onClick={resetSetup}>
            Descartar preparação não iniciada
          </Button>
        </div>
      </div>
      <div className={styles.actions}>
        <Button variant="outline" disabled={locked} onClick={() => void loadPage()}>
          Atualizar edições
        </Button>
      </div>
      {!page && !error && !busy && <LoadingState label="Carregando edições..." />}
      {page?.items.length === 0 && <EmptyState title="Nenhuma edição editorial preparada" />}
      {page?.items.map((item) => (
        <div key={item.jobId} className={styles.decisionForm}>
          <strong className={styles.contextText}>{item.title ?? 'Edição'}</strong>
          <Badge>{labels[item.state]}</Badge>
          <Button
            variant="outline"
            disabled={locked || dirty}
            onClick={() => void open(item.jobId)}
          >
            Abrir edição de {new Date(item.createdAt).toLocaleString('pt-BR')}
          </Button>
        </div>
      ))}
      {page?.nextAfterId && (
        <Button variant="outline" disabled={locked} onClick={() => void loadPage(page.nextAfterId)}>
          Mais edições
        </Button>
      )}
      {job && (
        <div className={styles.panel}>
          <h4 className={styles.contextText}>
            {job.title ?? 'Edição'} · {job.authorName ?? 'Autoria pendente'}
          </h4>
          <Badge>{labels[job.state]}</Badge>
          {job.message && <Alert>{job.message}</Alert>}
          <p>
            {job.compiledChapters} de {job.chapterCount} capítulos compilados · {job.verifiedUnits}{' '}
            de {job.unitCount} fontes reconferidas · {job.wordCount} palavras.
          </p>
          <p>
            {job.verifiedGuideEntries} de {job.guideCount} entradas do guia conferidas ·{' '}
            {job.removalCount} remoção(ões).
          </p>
          <div className={styles.actions}>
            <Button
              variant="outline"
              disabled={locked || guideWork.dirty}
              onClick={() =>
                void run(async (current) => {
                  const next = await refresh(current, job.jobId);
                  if (epoch.current === current) await details(current, next);
                })
              }
            >
              Consultar checkpoint
            </Button>
            {['planning', 'compiling', 'verifying', 'checkingGuide'].includes(job.state) && (
              <Button
                disabled={locked || guideWork.dirty}
                onClick={() => void run((current) => steps(current, job))}
              >
                Continuar processamento
              </Button>
            )}
            {!['published', 'canceled'].includes(job.state) && (
              <Button
                variant="destructive"
                disabled={locked || guideWork.dirty}
                onClick={() =>
                  void run(async (current) => {
                    const next = await publication.cancelLiteraryPublication(bookId, job.jobId);
                    if (epoch.current === current) setJob(next);
                  })
                }
              >
                Cancelar esta edição
              </Button>
            )}
          </div>
          <h4>Texto e ordem da edição</h4>
          {manifest?.items.map((chapter) => (
            <div key={chapter.chapterId} className={styles.decisionForm}>
              <strong>
                {chapter.index + 1}. {chapter.title}
              </strong>
              <span>{chapter.compiled ? 'Texto compilado' : 'Compilação pendente'}</span>
              <Button
                variant="outline"
                disabled={busy || !chapter.compiled}
                onClick={() =>
                  void run(async (current) => {
                    const result = await publication.getLiteraryPublicationChapter(
                      bookId,
                      job.jobId,
                      chapter.chapterId,
                    );
                    if (epoch.current === current) setPreview(result);
                  })
                }
              >
                Conferir texto de {chapter.title}
              </Button>
            </div>
          ))}
          {manifest?.nextAfterIndex !== null && manifest?.nextAfterIndex !== undefined && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async (current) => {
                  const result = await publication.listLiteraryPublicationManifest(
                    bookId,
                    job.jobId,
                    manifest.nextAfterIndex,
                  );
                  if (epoch.current === current)
                    setManifest((prior) => ({
                      ...result,
                      items: [...(prior?.items ?? []), ...result.items],
                    }));
                })
              }
            >
              Mais capítulos do manifesto
            </Button>
          )}
          {preview && (
            <div className={styles.comparison}>
              <h4>Texto preparado · {preview.title}</h4>
              <div
                className={styles.contextText}
                dangerouslySetInnerHTML={{ __html: renderRichText(preview.content) }}
              />
              <Textarea label="Texto da fonte para copiar citações" value={preview.text} readOnly />
            </div>
          )}
          {job.removalCount > 0 && (
            <Alert>
              Esta edição retira capítulos do leitor atual. Confira a lista completa antes de
              autorizar.
            </Alert>
          )}
          {removals?.items.map((item) => (
            <p key={item.chapterId}>Sai desta edição: {item.title ?? item.chapterId}</p>
          ))}
          {removals?.nextAfterId && (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void run(async (current) => {
                  const result = await publication.listLiteraryPublicationRemovals(
                    bookId,
                    job.jobId,
                    removals.nextAfterId,
                  );
                  if (epoch.current === current)
                    setRemovals((prior) => ({
                      ...result,
                      items: [...(prior?.items ?? []), ...result.items],
                    }));
                })
              }
            >
              Mais remoções
            </Button>
          )}
          {['prepared', 'checkingGuide', 'verified', 'published', 'stale'].includes(job.state) && (
            <>
              <LiteraryReaderGuideEditor
                key={actorId + ':' + bookId + ':' + job.jobId}
                bookId={bookId}
                actorId={actorId}
                job={job}
                chapters={manifest?.items ?? []}
                disabled={busy || !!pendingConfirm}
                onWorkChange={setGuideWork}
                onSaved={() => {
                  setReleaseChecks(finalChecks());
                  void run(async (current) => {
                    await refresh(current, job.jobId);
                  });
                }}
                onPreview={(chapterId) =>
                  void run(async (current) => {
                    const result = await publication.getLiteraryPublicationChapter(
                      bookId,
                      job.jobId,
                      chapterId,
                    );
                    if (epoch.current === current) setPreview(result);
                  })
                }
              />
              {job.state === 'prepared' && (
                <Button
                  disabled={locked || guideWork.dirty || setupDirty}
                  onClick={() => void verifyGuide()}
                >
                  Conferir guia e limites de revelação
                </Button>
              )}
              {['checkingGuide', 'verified'].includes(job.state) && (
                <Button
                  variant="outline"
                  disabled={locked || guideWork.dirty}
                  onClick={() =>
                    void run(async (current) => {
                      const next = await publication.reopenLiteraryPublicationGuide(
                        bookId,
                        job.jobId,
                      );
                      if (epoch.current === current) {
                        setJob(next);
                        setReleaseChecks(finalChecks());
                      }
                    })
                  }
                >
                  Reabrir guia para editar
                </Button>
              )}
            </>
          )}
          {(job.state === 'verified' || pendingConfirm) && (
            <div className={styles.decisionForm}>
              <h4>Confirmação pública</h4>
              <p>
                Confirme esta versão do texto, do guia e das remoções para torná-la visível aos
                leitores.
              </p>
              {releaseLabels.map(([key, label]) => (
                <Dropdown
                  key={key}
                  mode="select"
                  label={label}
                  value={acknowledged[key] ? 'yes' : 'no'}
                  disabled={locked}
                  options={[
                    { value: 'no', label: 'Pendente' },
                    { value: 'yes', label: 'Confirmo' },
                  ]}
                  onValueChange={(value) => {
                    setReleaseFor(editionKey);
                    setReleaseChecks({ ...acknowledged, [key]: value === 'yes' });
                  }}
                />
              ))}
              <Button
                disabled={
                  busy ||
                  setupDirty ||
                  guideWork.dirty ||
                  guideWork.pending ||
                  (!pendingConfirm && !Object.values(acknowledged).every(Boolean))
                }
                onClick={() => void publish()}
              >
                {pendingConfirm ? 'Repetir a mesma confirmação' : 'Publicar esta edição'}
              </Button>
              {pendingConfirm && (
                <Button variant="outline" disabled={busy} onClick={() => void inspectConfirm()}>
                  Consultar confirmação pública
                </Button>
              )}
            </div>
          )}
          {confirmation && (
            <Alert>
              {confirmation.currentPointerMatches
                ? 'Edição confirmada e selecionada no leitor.'
                : 'Confirmação histórica recuperada; a edição não foi republicada.'}{' '}
              <Link to={confirmation.publicationUrl}>Abrir leitor</Link>
            </Alert>
          )}
          {!confirmation && job.state === 'published' && job.publicationUrl && (
            <p>
              Publicação confirmada em{' '}
              {new Date(job.publishedAt ?? job.createdAt).toLocaleString('pt-BR')}.{' '}
              <Link to={job.publicationUrl}>Abrir leitor</Link>
            </p>
          )}
        </div>
      )}
    </section>
  );
}
