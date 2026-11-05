import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Dialog,
  Dropdown,
  EmptyState,
  Input,
  LoadingState,
  Textarea,
} from '@/shared/ui';
import { LORE_CATEGORIES } from '@/features/lore';
import {
  applyLoreImport,
  advanceLoreImport,
  cancelLoreImport,
  clearPendingLoreImport,
  getLoreImport,
  getLoreImportTarget,
  getPendingLoreImport,
  rememberLoreImport,
  saveLoreImportReview,
  uploadLoreImport,
} from '../services/loreImportService';
import {
  loreImportDiff,
  loreTextDiff,
  matchingImportEntities,
  validateLoreImportFiles,
  type ImportLoreFields,
  type LoreImportCandidate,
  type LoreImportChoice,
  type LoreImportExisting,
  type LoreImportReview,
  type LoreImportSubmission,
} from '../model/loreImport';
import styles from './LoreImportDialog.module.css';

interface Choice extends LoreImportChoice {
  selected: boolean;
  before?: LoreImportExisting;
}
function initialChoices(review: LoreImportReview): Record<string, Choice> {
  return Object.fromEntries(
    review.candidates.map((candidate) => [
      candidate.id,
      {
        candidateId: candidate.id,
        targetId: null,
        input: pickFields(candidate),
        selected: !matchingImportEntities(candidate, review.existing).length,
      },
    ]),
  );
}
function pickFields(value: ImportLoreFields): ImportLoreFields {
  return {
    name: value.name,
    aliases: value.aliases,
    category: value.category,
    summary: value.summary,
    details: value.details,
  };
}
function FieldDiff({ before, after }: { before: ImportLoreFields; after: ImportLoreFields }) {
  const differences = loreImportDiff(before, after);
  return (
    <div aria-label="Comparação da ficha" className={styles.diff}>
      {!differences.length && <p>Nenhuma alteração nesta ficha.</p>}
      {differences.map((difference) => (
        <section key={difference.field}>
          <h4>
            {difference.label} —{' '}
            {difference.kind === 'added'
              ? 'Acrescentado'
              : difference.kind === 'removed'
                ? 'Removido'
                : 'Alterado'}
          </h4>
          <p className={styles.inlineDiff} aria-label={`Diferenças em ${difference.label}`}>
            {loreTextDiff(difference.before, difference.after).map((part, index) =>
              part.kind === 'removed' ? (
                <del key={index}>{part.text}</del>
              ) : part.kind === 'added' ? (
                <ins key={index}>{part.text}</ins>
              ) : (
                <span key={index}>{part.text}</span>
              ),
            )}
          </p>
          {difference.before && (
            <div>
              <strong>Saiu</strong>
              <del>{difference.before}</del>
            </div>
          )}
          {difference.after && (
            <div>
              <strong>Entrou</strong>
              <ins>{difference.after}</ins>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
function CandidateEditor({
  candidate,
  choice,
  existing,
  disabled,
  onChange,
  onTarget,
}: {
  candidate: LoreImportCandidate;
  choice: Choice;
  existing: LoreImportReview['existing'];
  disabled: boolean;
  onChange: (value: Choice) => void;
  onTarget: (targetId: string) => void;
}) {
  const matches = matchingImportEntities(candidate, existing);
  const update = (input: Partial<ImportLoreFields>) =>
    onChange({ ...choice, input: { ...choice.input, ...input } });
  return (
    <article className={styles.candidate}>
      <div className={styles.actions}>
        <Button
          variant={choice.selected ? 'primary' : 'secondary'}
          aria-pressed={choice.selected}
          disabled={disabled}
          onClick={() => onChange({ ...choice, selected: !choice.selected })}
        >
          {choice.selected ? 'Selecionada' : 'Selecionar'}: {candidate.name}
        </Button>
      </div>
      <p>
        Fonte: {candidate.fileName}
        {candidate.page ? `, página ${candidate.page}` : ''}
      </p>
      <blockquote>{candidate.evidence}</blockquote>
      {!!matches.length && (
        <Alert variant="warning">
          Possível correspondência: {matches.map((item) => item.name).join(', ')}. Escolha a ficha
          que deseja atualizar ou crie uma entrada distinta.
        </Alert>
      )}
      <Dropdown
        mode="select"
        label={`Destino de ${candidate.name}`}
        searchable
        value={choice.targetId ?? ''}
        disabled={disabled}
        options={[
          { value: '', label: 'Criar nova entrada privada' },
          ...existing.map((item) => ({ value: item.id, label: `Atualizar: ${item.name}` })),
        ]}
        onValueChange={onTarget}
      />
      <details>
        <summary>Revisar campos de {candidate.name}</summary>
        <div className={styles.form}>
          <Input
            label="Nome"
            maxLength={200}
            value={choice.input.name}
            disabled={disabled}
            onChange={(event) => update({ name: event.target.value })}
          />
          <Dropdown
            mode="select"
            label="Categoria"
            value={choice.input.category}
            disabled={disabled}
            options={LORE_CATEGORIES}
            onValueChange={(category) =>
              update({ category: category as ImportLoreFields['category'] })
            }
          />
          <Textarea
            label="Apelidos (um por linha)"
            value={choice.input.aliases.join('\n')}
            disabled={disabled}
            onChange={(event) =>
              update({ aliases: event.target.value.split('\n').filter(Boolean) })
            }
          />
          <Textarea
            label="Resumo"
            maxLength={140}
            value={choice.input.summary}
            disabled={disabled}
            onChange={(event) => update({ summary: event.target.value })}
          />
          <Textarea
            label="Detalhes"
            maxLength={150000}
            rows={6}
            value={choice.input.details}
            disabled={disabled}
            onChange={(event) => update({ details: event.target.value })}
          />
        </div>
      </details>
      {choice.before && <FieldDiff before={choice.before} after={choice.input} />}
    </article>
  );
}
export function LoreImportDialog({
  uid,
  universeId,
  onClose,
  onSuccess,
}: {
  uid: string;
  universeId?: string;
  onClose: () => void;
  onSuccess: (id: string) => void;
}) {
  const [sessionId] = useState(() => getPendingLoreImport(uid, universeId) ?? crypto.randomUUID());
  const [files, setFiles] = useState<File[]>([]);
  const [review, setReview] = useState<LoreImportReview>();
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [pending, setPending] = useState<LoreImportSubmission>();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const alive = useRef(true);
  const controller = useRef(new AbortController());
  useEffect(() => {
    alive.current = true;
    const abort = new AbortController();
    controller.current = abort;
    if (getPendingLoreImport(uid, universeId)) {
      void getLoreImport(sessionId)
        .then((value) => {
          if (!alive.current) return;
          setReview(value);
          setChoices(initialChoices(value));
          if (value.pendingReview) {
            setPending(value.pendingReview);
            setName(value.pendingReview.name);
            setDescription(value.pendingReview.description);
          }
        })
        .catch(() => {
          if (alive.current)
            setError(
              'Não foi possível recuperar a importação. Selecione os mesmos arquivos para retomar o envio, ou descarte a tentativa.',
            );
        });
    }
    return () => {
      alive.current = false;
      abort.abort();
    };
  }, [sessionId, uid, universeId]);
  async function perform(operation: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch (cause) {
      if (alive.current && !controller.current.signal.aborted)
        setError(
          cause instanceof Error ? cause.message : 'Não foi possível concluir. Tente novamente.',
        );
    } finally {
      if (alive.current) {
        setBusy(false);
        setMessage('');
      }
    }
  }
  async function analyze() {
    await perform(async () => {
      let current = review;
      if (!current || current.state === 'uploading') {
        validateLoreImportFiles(files);
        rememberLoreImport(uid, sessionId, universeId);
        current = await uploadLoreImport({
          id: sessionId,
          universeId,
          files,
          signal: controller.current.signal,
          onProgress: (value) => {
            if (alive.current) setMessage(value);
          },
        });
      }
      while (current.state === 'analyzing') {
        controller.current.signal.throwIfAborted();
        if (alive.current) {
          setReview(current);
          setMessage(`Analisando lore… ${current.cursor} de ${current.total} trechos concluídos.`);
        }
        current = await advanceLoreImport(sessionId, current.cursor);
      }
      if (alive.current) {
        setReview(current);
        setChoices(initialChoices(current));
      }
    });
  }
  async function target(candidate: LoreImportCandidate, targetId: string) {
    await perform(async () => {
      const before = targetId ? await getLoreImportTarget(sessionId, targetId) : undefined;
      if (!alive.current) return;
      const input = pickFields(candidate);
      setChoices((values) => ({
        ...values,
        [candidate.id]: {
          candidateId: candidate.id,
          targetId: targetId || null,
          input,
          selected: true,
          before,
        },
      }));
    });
  }
  const selected = Object.values(choices).filter((choice) => choice.selected);
  const updates = selected.filter((choice) => choice.targetId).length;
  const invalid = selected.some(
    (choice) =>
      !choice.input.name.trim() ||
      !choice.input.summary.trim() ||
      choice.input.aliases.length > 20 ||
      choice.input.details.length > 150000,
  );
  const duplicates =
    new Set(selected.filter((choice) => choice.targetId).map((choice) => choice.targetId)).size !==
    updates;
  async function confirm() {
    await perform(async () => {
      const submission = pending ?? {
        id: sessionId,
        operationId: crypto.randomUUID(),
        name,
        description,
        changes: selected.map(({ candidateId, targetId, input }) => ({
          candidateId,
          targetId,
          input,
        })),
      };
      setPending(submission);
      await saveLoreImportReview(submission);
      const result = await applyLoreImport(submission);
      if (!alive.current) return;
      clearPendingLoreImport(uid, universeId);
      onSuccess(result.universeId);
    });
  }
  async function discard() {
    await perform(async () => {
      await cancelLoreImport(sessionId);
      if (!alive.current) return;
      clearPendingLoreImport(uid, universeId);
      onClose();
    });
  }
  const locked = busy || !!pending;
  return (
    <Dialog
      open
      title={universeId ? 'Importar lore para o universo' : 'Importar universo'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Fechar e continuar depois
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setConfirmDiscard(true)}>
            Descartar importação
          </Button>
          {review?.state === 'ready' && (
            <Button
              disabled={
                busy ||
                (!pending &&
                  (!selected.length || invalid || duplicates || (!universeId && !name.trim())))
              }
              onClick={() => void confirm()}
            >
              {pending
                ? 'Retomar confirmação'
                : universeId
                  ? `Confirmar: ${selected.length - updates} novas e ${updates} atualizadas`
                  : `Criar universo com ${selected.length} entradas`}
            </Button>
          )}
        </>
      }
    >
      <div className={styles.form}>
        <p>
          PDF com texto, TXT e Markdown. Até 50 arquivos, somando 10 MB (10.000.000 bytes). O lote
          custa 1 crédito na confirmação; analisar ou descartar não debita.
        </p>
        <p>
          Novas entradas são privadas. Atualizações preservam visibilidade, relações e notas
          estruturadas. Os textos serão enviados ao provedor de IA da plataforma.
        </p>
        {error && <Alert variant="destructive">{error}</Alert>}
        {confirmDiscard && (
          <Alert variant="warning">
            <p>
              Descartar arquivos e sugestões desta importação? Nenhuma ficha existente será
              removida. Uma confirmação já concluída será preservada.
            </p>
            <Button disabled={busy} onClick={() => void discard()}>
              Confirmar descarte
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setConfirmDiscard(false)}>
              Voltar à revisão
            </Button>
          </Alert>
        )}
        {busy && <LoadingState label={message || 'Processando importação…'} />}
        {(!review || review.state === 'uploading') && (
          <>
            <Input
              type="file"
              label="Arquivos para importar"
              accept=".pdf,.txt,.text,.md,.markdown"
              multiple
              disabled={locked}
              onChange={(event) => {
                const next = [...files, ...Array.from(event.target.files ?? [])];
                try {
                  validateLoreImportFiles(next);
                  setFiles(next);
                  setError('');
                } catch (cause) {
                  setError((cause as Error).message);
                }
                event.target.value = '';
              }}
            />
            <ul>
              {files.map((file, index) => (
                <li key={`${file.name}-${index}`}>
                  {file.name} — {file.size.toLocaleString('pt-BR')} bytes{' '}
                  <Button
                    variant="ghost"
                    disabled={locked}
                    onClick={() => setFiles(files.filter((_, i) => i !== index))}
                  >
                    Remover {file.name}
                  </Button>
                </li>
              ))}
            </ul>
            <p>
              Total: {files.reduce((sum, file) => sum + file.size, 0).toLocaleString('pt-BR')} /
              10.000.000 bytes
            </p>
          </>
        )}
        {(!review || ['uploading', 'analyzing'].includes(review.state)) && (
          <Button
            disabled={busy || ((!review || review.state === 'uploading') && !files.length)}
            onClick={() => void analyze()}
          >
            {review?.state === 'analyzing' ? 'Continuar análise' : 'Analisar arquivos'}
          </Button>
        )}
        {review?.state === 'ready' && (
          <>
            {!pending && (
              <Alert variant="info">
                A análise pode ser retomada. Edições locais ainda não confirmadas serão perdidas ao
                fechar esta janela.
              </Alert>
            )}
            {!universeId && (
              <>
                <Input
                  label="Nome do universo"
                  value={name}
                  maxLength={200}
                  disabled={locked}
                  onChange={(event) => setName(event.target.value)}
                />
                <Textarea
                  label="Descrição do universo"
                  value={description}
                  maxLength={4000}
                  disabled={locked}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </>
            )}
            {pending ? (
              <Alert variant="warning">
                A revisão está salva no servidor. Retome a confirmação com o mesmo conteúdo ou
                descarte a importação. {pending.changes.length} entradas selecionadas. Uma resposta
                incerta não autoriza uma nova cobrança.
              </Alert>
            ) : (
              <>
                <div className={styles.actions}>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      setChoices((values) =>
                        Object.fromEntries(
                          Object.entries(values).map(([id, value]) => [
                            id,
                            { ...value, selected: true },
                          ]),
                        ),
                      )
                    }
                  >
                    Selecionar todas
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      setChoices((values) =>
                        Object.fromEntries(
                          Object.entries(values).map(([id, value]) => [
                            id,
                            { ...value, selected: false },
                          ]),
                        ),
                      )
                    }
                  >
                    Desmarcar todas
                  </Button>
                </div>
                {!review.candidates.length && (
                  <EmptyState
                    title="Nenhum elemento de lore identificado"
                    description="Nenhuma ficha foi criada. Tente documentos com informações sobre o universo."
                  />
                )}
                {duplicates && (
                  <Alert variant="destructive">
                    Cada ficha existente pode receber somente uma atualização por lote. Consolide as
                    sugestões antes de confirmar.
                  </Alert>
                )}
                {review.candidates.map(
                  (candidate) =>
                    choices[candidate.id] && (
                      <CandidateEditor
                        key={candidate.id}
                        candidate={candidate}
                        choice={choices[candidate.id]!}
                        existing={review.existing}
                        disabled={locked}
                        onChange={(choice) =>
                          setChoices((values) => ({ ...values, [candidate.id]: choice }))
                        }
                        onTarget={(targetId) => void target(candidate, targetId)}
                      />
                    ),
                )}
                <p>
                  {selected.length - updates} novas entradas e {updates} atualizações. Confira os
                  trechos removidos e acrescentados antes de confirmar. Fichas ausentes dos arquivos
                  permanecem intactas.
                </p>
              </>
            )}
          </>
        )}
        {review?.state === 'applied' && review.result && (
          <Alert>
            <p>
              Importação confirmada: {review.result.created} novas entradas e{' '}
              {review.result.updated} atualizações.
            </p>
            <Button
              onClick={() => {
                clearPendingLoreImport(uid, universeId);
                onSuccess(review.result!.universeId);
              }}
            >
              Abrir universo
            </Button>
          </Alert>
        )}
      </div>
    </Dialog>
  );
}
