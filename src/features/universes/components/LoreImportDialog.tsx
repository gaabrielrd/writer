import { useEffect, useId, useRef, useState } from 'react';
import { Check, FileText, Upload, X } from 'lucide-react';
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
  LORE_IMPORT_MAX_BYTES,
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

function fileSize(bytes: number) {
  if (bytes === 0) return '0 KB';
  if (bytes < 1_000) return `${bytes.toLocaleString('pt-BR')} bytes`;
  const megabytes = bytes >= 1_000_000;
  return `${(bytes / (megabytes ? 1_000_000 : 1_000)).toLocaleString('pt-BR', {
    maximumFractionDigits: 1,
  })} ${megabytes ? 'MB' : 'KB'}`;
}

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
    <article className={styles.candidate} data-selected={choice.selected}>
      <div className={styles.candidateHeader}>
        <div>
          <h3>{choice.input.name || candidate.name}</h3>
          <p className={styles.caption}>
            {LORE_CATEGORIES.find((item) => item.value === choice.input.category)?.label}
            {' · '}
            {choice.targetId ? 'Atualizar ficha' : 'Nova entrada privada'}
          </p>
        </div>
        <Button
          variant="secondary"
          aria-pressed={choice.selected}
          disabled={disabled}
          onClick={() => onChange({ ...choice, selected: !choice.selected })}
        >
          {choice.selected && <Check className="icon icon-sm" aria-hidden="true" />}
          <span aria-hidden="true">{choice.selected ? 'Selecionada' : 'Selecionar'}</span>
          <span className="sr-only">
            {choice.selected ? 'Selecionada' : 'Selecionar'}: {candidate.name}
          </span>
        </Button>
      </div>
      <p>{choice.input.summary}</p>
      <p className={styles.caption}>
        Fonte: {candidate.fileName}
        {candidate.pages && candidate.pages.length > 1
          ? `, páginas ${candidate.pages.join(', ')}`
          : candidate.page
            ? `, página ${candidate.page}`
            : ''}
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
  const [recovering, setRecovering] = useState(() => !!getPendingLoreImport(uid, universeId));
  const [dragging, setDragging] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const fileHintId = useId();
  const dragDepth = useRef(0);
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
        })
        .finally(() => {
          if (alive.current) setRecovering(false);
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
          version: current ? (current.version ?? 1) : 2,
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
      setMessage('Carregando ficha para comparação…');
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
      setMessage('Salvando a revisão e confirmando a importação…');
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
      setMessage('Descartando importação…');
      await cancelLoreImport(sessionId);
      if (!alive.current) return;
      clearPendingLoreImport(uid, universeId);
      onClose();
    });
  }
  const locked = busy || recovering || !!pending;
  const needsFiles = !review || review.state === 'uploading';
  const canAnalyze = needsFiles || review?.state === 'analyzing';
  const stage =
    review?.state === 'ready' || review?.state === 'applied'
      ? 2
      : busy || review?.state === 'analyzing'
        ? 1
        : 0;
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const selectedCount = pending ? pending.changes.length : selected.length;
  function addFiles(incoming: File[]) {
    if (locked) return;
    const next = [...files, ...incoming];
    try {
      validateLoreImportFiles(next);
      setFiles(next);
      setError('');
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  return (
    <Dialog
      open
      title={universeId ? 'Importar lore para o universo' : 'Importar universo'}
      description="Transforme seus documentos em fichas de lore. Revise tudo antes de importar."
      maxWidthClass="max-w-3xl"
      className={styles.dialog}
      onClose={onClose}
      footer={
        <div className={styles.footer}>
          {(canAnalyze || review?.state === 'ready') && (
            <div className={styles.confirmationSummary} aria-live="polite">
              <strong>
                {review?.state === 'ready'
                  ? `${selectedCount} ${selectedCount === 1 ? 'ficha selecionada' : 'fichas selecionadas'}`
                  : 'Analisar não debita créditos'}
              </strong>
              <span>{review?.cost ?? 1} crédito na confirmação do lote</span>
            </div>
          )}
          <div className={styles.footerActions}>
            <Button
              variant="ghost"
              disabled={busy || recovering}
              onClick={() => setConfirmDiscard(true)}
            >
              Descartar importação
            </Button>
            <div className={styles.actions}>
              <Button variant="secondary" onClick={onClose}>
                {review || recovering ? 'Fechar e continuar depois' : 'Fechar'}
              </Button>
              {canAnalyze && (
                <Button
                  disabled={locked || confirmDiscard || (needsFiles && !files.length)}
                  onClick={() => void analyze()}
                >
                  {busy
                    ? 'Analisando…'
                    : review?.state === 'analyzing'
                      ? 'Continuar análise'
                      : 'Analisar arquivos'}
                </Button>
              )}
              {review?.state === 'ready' && (
                <Button
                  disabled={
                    busy ||
                    recovering ||
                    confirmDiscard ||
                    (!pending &&
                      (!selected.length || invalid || duplicates || (!universeId && !name.trim())))
                  }
                  onClick={() => void confirm()}
                >
                  {pending
                    ? 'Retomar confirmação'
                    : universeId
                      ? `Confirmar: ${selected.length - updates} ${selected.length - updates === 1 ? 'nova' : 'novas'} e ${updates} ${updates === 1 ? 'atualizada' : 'atualizadas'}`
                      : `Criar universo com ${selected.length} ${selected.length === 1 ? 'entrada' : 'entradas'}`}
                </Button>
              )}
            </div>
          </div>
        </div>
      }
    >
      <div className={styles.form}>
        <ol className={styles.steps} aria-label="Etapas da importação">
          {['Arquivos', 'Análise', 'Revisão'].map((label, index) => (
            <li
              key={label}
              aria-current={stage === index ? 'step' : undefined}
              data-complete={stage > index}
            >
              <span className={styles.stepNumber} aria-hidden="true">
                {stage > index ? <Check className="icon icon-sm" /> : index + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>
        {recovering && <LoadingState label="Recuperando sua importação…" />}
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
              Continuar importação
            </Button>
          </Alert>
        )}
        {!recovering && (busy || review?.state === 'analyzing') && (
          <section className={styles.progressPanel} aria-label="Progresso da importação">
            <h3>
              {review?.state === 'ready'
                ? 'Atualizando a importação'
                : needsFiles
                  ? 'Preparando seus arquivos'
                  : 'Identificando o lore'}
            </h3>
            {busy ? (
              <LoadingState label={message || 'Processando importação…'} />
            ) : (
              <p>A análise está pausada. Continue de onde parou.</p>
            )}
            {review?.state === 'analyzing' && (
              <>
                <progress
                  className={styles.progress}
                  aria-label="Trechos analisados"
                  value={review.cursor}
                  max={Math.max(1, review.total)}
                />
                <p className={styles.caption}>
                  {review.cursor} de {review.total} trechos concluídos
                </p>
              </>
            )}
            {canAnalyze && (
              <p className={styles.caption}>
                Você poderá revisar as sugestões antes de confirmar. Analisar não debita créditos.
              </p>
            )}
          </section>
        )}
        {!recovering && needsFiles && !busy && (
          <section className={styles.form} aria-label="Seleção de arquivos">
            {review?.state === 'uploading' && (
              <Alert variant="info">
                Para retomar o envio, selecione os mesmos arquivos usados no início desta
                importação.
              </Alert>
            )}
            <div>
              <h3 className={styles.sectionTitle}>Adicione seus documentos</h3>
              <p id={fileHintId} className={styles.caption}>
                PDF com texto, TXT ou Markdown · Até 50 arquivos e 10 MB no total.
              </p>
            </div>
            <div
              className={styles.dropzone}
              data-dragging={dragging}
              data-disabled={locked}
              onDragEnter={(event) => {
                event.preventDefault();
                dragDepth.current++;
                if (!locked) setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                event.preventDefault();
                dragDepth.current = Math.max(0, dragDepth.current - 1);
                if (!dragDepth.current) setDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                dragDepth.current = 0;
                setDragging(false);
                addFiles(Array.from(event.dataTransfer.files));
              }}
            >
              <Upload className="icon" aria-hidden="true" />
              <p>Arraste seus arquivos para cá</p>
              <Button
                variant="secondary"
                disabled={locked}
                onClick={() => fileInput.current?.click()}
              >
                {files.length ? 'Adicionar arquivos' : 'Escolher arquivos'}
              </Button>
              <Input
                ref={fileInput}
                className="sr-only"
                tabIndex={-1}
                type="file"
                aria-label="Arquivos para importar"
                aria-describedby={fileHintId}
                accept=".pdf,.txt,.text,.md,.markdown"
                multiple
                disabled={locked}
                onChange={(event) => {
                  addFiles(Array.from(event.target.files ?? []));
                  event.target.value = '';
                }}
              />
            </div>
            <div className={styles.fileTotals} aria-live="polite">
              <span>{files.length} de 50 arquivos</span>
              <span>
                {fileSize(totalBytes)} de {fileSize(LORE_IMPORT_MAX_BYTES)}
              </span>
            </div>
            {!!files.length && (
              <ul className={styles.fileList} aria-label="Arquivos selecionados">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`}>
                    <FileText className="icon icon-sm" aria-hidden="true" />
                    <span className={styles.fileName}>{file.name}</span>
                    <span className={styles.fileSize}>{fileSize(file.size)}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remover ${file.name}`}
                      disabled={locked}
                      onClick={() => setFiles(files.filter((_, i) => i !== index))}
                    >
                      <X className="icon icon-sm" aria-hidden="true" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <p className={styles.caption}>
              Os arquivos selecionados ficam nesta janela até você iniciar a análise.
            </p>
          </section>
        )}
        {canAnalyze && !recovering && (
          <div className={styles.importNotes}>
            <p>
              Os textos serão enviados ao provedor de IA da plataforma. Novas entradas são privadas.
            </p>
            <details>
              <summary>Como seus dados são tratados</summary>
              <p>
                Atualizações preservam visibilidade, relações e notas estruturadas. Fichas ausentes
                dos arquivos permanecem intactas. PDFs precisam ter texto selecionável. Limite
                total: 10.000.000 bytes. Descartar a importação não debita créditos.
              </p>
            </details>
          </div>
        )}
        {review?.state === 'ready' && (
          <>
            <div>
              <h3 className={styles.sectionTitle}>Revise as fichas sugeridas</h3>
              <p className={styles.caption}>
                Selecione o que deseja importar. Para atualizar uma ficha, escolha o destino e
                confira as diferenças. Novas entradas são privadas; atualizações preservam
                visibilidade, relações e notas estruturadas.
              </p>
            </div>
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
                  required
                  hint="Obrigatório para criar o universo."
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
                {!!review.candidates.length && !selected.length && (
                  <p className={styles.caption}>
                    Selecione ao menos uma ficha para confirmar. Possíveis correspondências precisam
                    da sua escolha.
                  </p>
                )}
                {invalid && (
                  <Alert variant="warning">
                    Confira os campos das fichas selecionadas: nome e resumo são obrigatórios, com
                    até 20 apelidos e 150.000 caracteres nos detalhes.
                  </Alert>
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
                  {selected.length - updates}{' '}
                  {selected.length - updates === 1 ? 'nova entrada' : 'novas entradas'} e {updates}{' '}
                  {updates === 1 ? 'atualização' : 'atualizações'}. Confira os trechos removidos e
                  acrescentados antes de confirmar. Fichas ausentes dos arquivos permanecem
                  intactas.
                </p>
              </>
            )}
          </>
        )}
        {review?.state === 'applied' && review.result && (
          <Alert>
            <p>
              Importação confirmada: {review.result.created}{' '}
              {review.result.created === 1 ? 'nova entrada' : 'novas entradas'} e{' '}
              {review.result.updated} {review.result.updated === 1 ? 'atualização' : 'atualizações'}
              .
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
        {review?.state === 'cancelled' && (
          <EmptyState
            title="Importação descartada"
            description="Feche esta janela e inicie uma nova importação quando quiser. Nenhuma ficha existente foi removida."
          />
        )}
      </div>
    </Dialog>
  );
}
