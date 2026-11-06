import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  collaborationLabels,
  publicationUnitLabels,
  type LiteraryCollaborationMode,
  categoryLabels,
  composeEditorialContract,
  editorialFields,
  statusLabels,
  type EditorialCategory,
  type EditorialContract,
  type EditorialState,
  type EditorialStatus,
  type EditorialVersionPage,
  type SaveEditorialContract,
} from '../model/editorial';
import {
  getLiteraryContract,
  getLiteraryContractVersion,
  listLiteraryContractVersions,
  saveLiteraryContract,
} from '../services/literaryProductionService';
import styles from './EditorialContractPanel.module.css';
import { ContractInferencePanel } from './ContractInferencePanel';
import { EditorialPublicationPolicyFields } from './EditorialPublicationPolicyFields';

type Props = {
  bookId: string;
  onWorkChange?: (state: { dirty: boolean; pending: boolean }) => void;
  captureGeneration?: () => unknown;
  onStateChange?: (state: EditorialState) => void;
};
export function EditorialContractPanel(props: Props) {
  const { user } = useAuth();
  return <ContractSession key={JSON.stringify([user?.uid ?? null, props.bookId])} {...props} />;
}
function ContractSession({ bookId, onWorkChange, captureGeneration, onStateChange }: Props) {
  const { user } = useAuth();
  const [state, setState] = useState<EditorialState | null>(null);
  const [draft, setDraft] = useState<EditorialContract | null>(null);
  const [remote, setRemote] = useState<EditorialState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<SaveEditorialContract | null>(null);
  const [versions, setVersions] = useState<EditorialVersionPage | null>(null);
  const [historical, setHistorical] = useState<EditorialState | null>(null);
  const [decision, setDecision] = useState('');
  const [source, setSource] = useState('Decisão do autor');
  const [category, setCategory] = useState<EditorialCategory>('preference');
  const [status, setStatus] = useState<EditorialStatus>('proposal');
  const [supersedes, setSupersedes] = useState('');
  const epoch = useRef(0);
  useEffect(() => {
    if (state) onStateChange?.(state);
  }, [state, onStateChange]);
  useEffect(() => {
    onWorkChange?.({
      dirty:
        !!draft && (JSON.stringify(draft) !== JSON.stringify(state?.contract) || !!decision.trim()),
      pending: pending !== null,
    });
  }, [draft, state, decision, pending, onWorkChange]);
  useEffect(() => {
    const current = ++epoch.current;
    void getLiteraryContract(bookId)
      .then((result) => {
        if (epoch.current !== current) return;
        setState(result);
        setDraft(result.contract);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (epoch.current !== current) return;
        setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o contrato.');
        setLoading(false);
      });
    return () => {
      epoch.current += 1;
    };
  }, [bookId]);
  const readCurrent = useCallback(async () => {
    const current = epoch.current;
    setBusy(true);
    setError(null);
    try {
      const result = await getLiteraryContract(bookId);
      if (epoch.current !== current) return;
      if (draft) setRemote(result);
      else {
        setState(result);
        setDraft(result.contract);
      }
    } catch (cause) {
      if (epoch.current === current)
        setError(cause instanceof Error ? cause.message : 'Falha ao consultar.');
    } finally {
      if (epoch.current === current) setBusy(false);
    }
  }, [bookId, draft]);
  const save = async () => {
    if (!draft || !state || busy) return;
    const current = epoch.current;
    const request = pending ?? {
      target: { kind: 'book' as const, id: bookId },
      operationId: crypto.randomUUID(),
      expectedRevision: state.revision,
      contract: structuredClone(draft),
    };
    setPending(request);
    setBusy(true);
    setError(null);
    try {
      const result = await saveLiteraryContract(request, user?.uid ?? '');
      if (epoch.current !== current) return;
      setState(result);
      setDraft(result.contract);
      setPending(null);
      setRemote(null);
      setVersions(null);
    } catch (cause) {
      if (epoch.current !== current) return;
      const code =
        typeof cause === 'object' && cause !== null && 'code' in cause ? String(cause.code) : '';
      if (
        [
          'functions/invalid-argument',
          'functions/failed-precondition',
          'functions/not-found',
          'functions/permission-denied',
          'functions/unauthenticated',
        ].includes(code)
      )
        setPending(null);
      setError(
        cause instanceof Error ? cause.message : 'Resposta incerta. Recupere o mesmo salvamento.',
      );
    } finally {
      if (epoch.current === current) setBusy(false);
    }
  };
  const history = async (before: number | null = null) => {
    const current = epoch.current;
    setBusy(true);
    setError(null);
    try {
      const result = await listLiteraryContractVersions(bookId, before);
      if (epoch.current === current)
        setVersions((previous) => ({
          ...result,
          items: before === null ? result.items : [...(previous?.items ?? []), ...result.items],
        }));
    } catch (cause) {
      if (epoch.current === current)
        setError(cause instanceof Error ? cause.message : 'Falha ao ler histórico.');
    } finally {
      if (epoch.current === current) setBusy(false);
    }
  };
  const inspectVersion = async (revision: number) => {
    const current = epoch.current;
    setBusy(true);
    setError(null);
    try {
      const result = await getLiteraryContractVersion(bookId, revision);
      if (epoch.current === current) setHistorical(result);
    } catch (cause) {
      if (epoch.current === current)
        setError(cause instanceof Error ? cause.message : 'Falha ao ler versão.');
    } finally {
      if (epoch.current === current) setBusy(false);
    }
  };
  if (loading) return <LoadingState label="Abrindo contrato editorial…" />;
  if (!draft || !state)
    return (
      <ErrorState message={error ?? 'Contrato indisponível.'} onRetry={() => void readCurrent()} />
    );
  const frozen = busy || pending !== null;
  const replaced = new Set(composeEditorialContract(draft).supersededIds);
  return (
    <section className={styles.panel} aria-label="Contrato editorial">
      <div>
        <h2>Contrato editorial</h2>
        <p>
          Defina a intenção da obra. Propostas, hipóteses e lacunas permanecem distintas das
          decisões do autor.
        </p>
        <Badge>{state.revision ? 'Revisão ' + state.revision : 'Ainda não salvo'}</Badge>
      </div>
      {error && <Alert variant="destructive">{error}</Alert>}
      {pending && (
        <Alert>
          Salvamento sem confirmação. Os campos estão preservados; recupere a mesma operação.
        </Alert>
      )}
      {remote && (
        <div className={styles.comparison}>
          <h3>Versão atual do servidor: {remote.revision}</h3>
          <p>
            Método de colaboração:{' '}
            {collaborationLabels[remote.contract.collaborationPolicy?.mode ?? 'supervised']}
          </p>
          <p>
            Unidade de publicação:{' '}
            {remote.contract.publicationPolicy
              ? publicationUnitLabels[remote.contract.publicationPolicy.unit] +
                (remote.contract.publicationPolicy.requirePreviousPublication === true
                  ? ' · Publicação anterior obrigatória para avançar o ciclo'
                  : ' · Sem exigência de publicação anterior')
              : 'Não definida'}
          </p>
          <p>
            Seu rascunho continua abaixo. Confira as diferenças antes de escolher a versão atual.
          </p>
          <dl>
            {Object.entries(editorialFields).map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>
                  {remote.contract.fields[key as keyof typeof editorialFields] || 'Não definido'}
                </dd>
              </div>
            ))}
          </dl>
          <Button
            disabled={frozen}
            variant="outline"
            onClick={() => {
              setState(remote);
              setDraft(remote.contract);
              setRemote(null);
            }}
          >
            Descartar rascunho e abrir versão do servidor
          </Button>
          <Button variant="ghost" onClick={() => setRemote(null)}>
            Manter rascunho
          </Button>
        </div>
      )}
      <Dropdown
        mode="select"
        label="Método de colaboração"
        disabled={frozen}
        value={draft.collaborationPolicy?.mode ?? 'supervised'}
        options={Object.entries(collaborationLabels).map(([value, label]) => ({ value, label }))}
        onValueChange={(mode) =>
          setDraft({
            ...draft,
            collaborationPolicy: { version: 1, mode: mode as LiteraryCollaborationMode },
          })
        }
      />
      <p>
        Orientação mantém a escrita com você e oferece análises e sugestões. Supervisionado pede
        aceite por fase. Contínuo permite apenas as fases, unidades e limites autorizados
        separadamente. Salvar este modo não inicia execução nem debita créditos.
      </p>
      <p>
        Alterar o modo exige reconferir a preparação e as propostas anteriores antes de retomar a
        execução.
      </p>
      {!draft.collaborationPolicy && (
        <p>
          Contrato anterior sem modo operacional definido: execução supervisionada. As observações
          livres abaixo permanecem preservadas.
        </p>
      )}
      <EditorialPublicationPolicyFields value={draft} disabled={frozen} onChange={setDraft} />
      <div className={styles.fields}>
        {Object.entries(editorialFields).map(([key, label]) => (
          <Textarea
            key={key}
            label={label}
            value={draft.fields[key as keyof typeof editorialFields]}
            disabled={frozen}
            maxLength={key === 'examples' ? 12000 : 6000}
            onChange={(event) =>
              setDraft({ ...draft, fields: { ...draft.fields, [key]: event.target.value } })
            }
          />
        ))}
      </div>
      <ContractInferencePanel
        bookId={bookId}
        revision={state.revision}
        disabled={frozen}
        captureGeneration={captureGeneration}
        onUse={(proposal) => {
          const existing = new Set(draft.decisions.map((item) => item.id));
          if (
            draft.decisions.length +
              proposal.decisions.filter((item) => !existing.has(item.id)).length >
            150
          )
            throw new Error(
              'O registro chegou ao limite de decisões. Revise as propostas antes de adicioná-las.',
            );
          setDraft((previous) => {
            if (!previous) return previous;
            const ids = new Set(previous.decisions.map((item) => item.id));
            return {
              ...previous,
              fields: Object.fromEntries(
                Object.keys(editorialFields).map((key) => [
                  key,
                  previous.fields[key as keyof typeof editorialFields] ||
                    proposal.fields[key as keyof typeof editorialFields],
                ]),
              ) as EditorialContract['fields'],
              decisions: [
                ...previous.decisions,
                ...proposal.decisions.filter((item) => !ids.has(item.id)),
              ],
            };
          });
        }}
      />
      <h3>Registro de decisões</h3>
      {!draft.decisions.length && (
        <EmptyState
          title="Nenhuma decisão registrada"
          description="Registre requisitos, preferências e hipóteses com sua origem."
        />
      )}
      <ol className={styles.decisions}>
        {draft.decisions.map((row) => (
          <li key={row.id}>
            <p>{row.text}</p>
            <p>
              {categoryLabels[row.category]} · {statusLabels[row.status]}
              {replaced.has(row.id) ? ' · Substituída' : ''}
            </p>
            <p>Fonte: {row.source}</p>
            <Button
              variant="ghost"
              disabled={frozen || replaced.has(row.id)}
              onClick={() => {
                setSupersedes(row.id);
                setDecision(row.text);
                setCategory(row.category);
                setStatus(row.status);
              }}
            >
              Registrar decisão substituta
            </Button>
          </li>
        ))}
      </ol>
      <fieldset disabled={frozen} className={styles.decisionForm}>
        <legend>{supersedes ? 'Nova decisão substituta' : 'Nova decisão'}</legend>
        <Textarea
          label="Decisão"
          maxLength={4000}
          value={decision}
          onChange={(event) => setDecision(event.target.value)}
        />
        <Input
          label="Fonte"
          maxLength={1000}
          value={source}
          onChange={(event) => setSource(event.target.value)}
        />
        <Dropdown
          mode="select"
          label="Classe"
          value={category}
          options={Object.entries(categoryLabels).map(([value, label]) => ({ value, label }))}
          onValueChange={(value) => setCategory(value as EditorialCategory)}
        />
        <Dropdown
          mode="select"
          label="Situação"
          value={status}
          options={Object.entries(statusLabels).map(([value, label]) => ({ value, label }))}
          onValueChange={(value) => setStatus(value as EditorialStatus)}
        />
        {status === 'approved' && (
          <p>Ao adicionar, você registra explicitamente sua aprovação desta decisão.</p>
        )}
        <Button
          disabled={!decision.trim() || !source.trim() || draft.decisions.length >= 150}
          onClick={() => {
            setDraft({
              ...draft,
              decisions: [
                ...draft.decisions,
                {
                  id: crypto.randomUUID(),
                  text: decision,
                  source,
                  category,
                  status,
                  supersedes: supersedes || null,
                },
              ],
            });
            setDecision('');
            setSupersedes('');
          }}
        >
          Adicionar ao rascunho
        </Button>
        {supersedes && (
          <Button
            variant="ghost"
            onClick={() => {
              setSupersedes('');
              setDecision('');
            }}
          >
            Cancelar substituição
          </Button>
        )}
      </fieldset>
      <div className={styles.actions}>
        <Button disabled={busy} onClick={() => void save()}>
          {pending ? 'Recuperar salvamento' : 'Salvar contrato e decisões'}
        </Button>
        <Button variant="outline" disabled={frozen} onClick={() => void readCurrent()}>
          Comparar com servidor
        </Button>
        <Button variant="ghost" disabled={frozen} onClick={() => void history()}>
          Consultar histórico
        </Button>
      </div>
      {versions && (
        <section aria-label="Versões do contrato">
          <h3>Versões preservadas</h3>
          {versions.items.length === 0 && <p>Nenhuma versão salva.</p>}
          {versions.items.map((row) => (
            <Button
              key={row.revision}
              variant="ghost"
              disabled={busy}
              onClick={() => void inspectVersion(row.revision)}
            >
              Consultar revisão {row.revision}
            </Button>
          ))}
          {versions.nextBeforeRevision !== null && (
            <Button
              disabled={busy}
              variant="outline"
              onClick={() => void history(versions.nextBeforeRevision)}
            >
              Mais versões
            </Button>
          )}
        </section>
      )}
      {historical && (
        <section className={styles.comparison} aria-label="Versão histórica">
          <h3>Revisão histórica {historical.revision}</h3>
          <p>
            Método de colaboração:{' '}
            {collaborationLabels[historical.contract.collaborationPolicy?.mode ?? 'supervised']}
          </p>
          <p>
            Unidade de publicação:{' '}
            {historical.contract.publicationPolicy
              ? publicationUnitLabels[historical.contract.publicationPolicy.unit] +
                (historical.contract.publicationPolicy.requirePreviousPublication === true
                  ? ' · Publicação anterior obrigatória para avançar o ciclo'
                  : ' · Sem exigência de publicação anterior')
              : 'Não definida'}
          </p>
          <dl>
            {Object.entries(editorialFields).map(([key, label]) => (
              <div key={key}>
                <dt>{label}</dt>
                <dd>
                  {historical.contract.fields[key as keyof typeof editorialFields] ||
                    'Não definido'}
                </dd>
              </div>
            ))}
          </dl>
          <ol>
            {historical.contract.decisions.map((row) => (
              <li key={row.id}>
                {row.text} · {statusLabels[row.status]} · {row.source}
              </li>
            ))}
          </ol>
          <Button variant="ghost" onClick={() => setHistorical(null)}>
            Fechar consulta
          </Button>
        </section>
      )}
    </section>
  );
}
