import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { UniverseSelect } from '@/features/universes';
import {
  PdfPagePreview,
  DOCUMENT_EXTENSIONS,
  DOCUMENT_FORMAT_LABEL,
  parseDocumentFile,
  isSupportedDocument,
  DocumentSectionReview,
  splitImportedSection,
  mergeImportedSections,
  type ParsedSection,
  type DocumentParseResult,
} from '@/features/document-import';
import { Alert, Badge, Button, Dialog, Dropdown, Input, LoadingState, Textarea } from '@/shared/ui';
import {
  prepareAdventureImportSections,
  sourceFromFile,
  bytes,
  IMPORT_BODY_LIMIT,
} from '../services/adventureImportContracts';
import { confirmAdventureImportOriginal } from '../services/adventureImportSource';
import { useAdventureImport } from '../hooks/useAdventureImport';
import type { ConfirmedReview, ImportSource } from '../model/adventureImport';
import styles from './AdventureImport.module.css';
export interface AdventureImportDialogProps {
  open: boolean;
  onClose: () => void;
  onActivated: (id: string) => void;
  importId?: string;
}
export function AdventureImportDialog(props: AdventureImportDialogProps) {
  const { user } = useAuth();
  return user && props.open ? (
    <ImportDialogSession key={user.uid + ':' + (props.importId ?? 'new')} {...props} />
  ) : null;
}
function ImportDialogSession({
  open,
  onClose,
  onActivated,
  importId: initialId,
}: AdventureImportDialogProps) {
  const api = useAdventureImport(open, onActivated);
  const [file, setFile] = useState<File | null>(null),
    [source, setSource] = useState<ImportSource | null>(null),
    [parsed, setParsed] = useState<DocumentParseResult | null>(null),
    [sections, setSections] = useState<ParsedSection[]>([]),
    [title, setTitle] = useState(''),
    [synopsis, setSynopsis] = useState(''),
    [universeId, setUniverseId] = useState<string | null>(null),
    [expanded, setExpanded] = useState<string | null>(null),
    [page, setPage] = useState(1),
    [parsing, setParsing] = useState(false),
    [parseError, setParseError] = useState(''),
    [parseProgress, setParseProgress] = useState(''),
    [cancelOpen, setCancelOpen] = useState(false),
    [rebuilding, setRebuilding] = useState(false),
    [original, setOriginal] = useState<File | null>(null),
    [originalPages, setOriginalPages] = useState(0),
    [originalPage, setOriginalPage] = useState('1'),
    [originalError, setOriginalError] = useState(''),
    [originalLoading, setOriginalLoading] = useState(false);
  const controller = useRef<AbortController | null>(null),
    loaded = useRef<string | null>(null),
    fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) controller.current?.abort();
    return () => controller.current?.abort();
  }, [open]);
  useEffect(() => {
    let active = true;
    if (open && initialId && loaded.current !== initialId) {
      // StrictMode may retire this effect before it owns a session generation.
      queueMicrotask(() => {
        if (!active) return;
        loaded.current = initialId;
        void api.load(initialId);
      });
    }
    return () => {
      active = false;
    };
  }, [open, initialId, api]);
  async function process(fileValue: File) {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setParseError('');
    setParsed(null);
    setSource(null);
    setSections([]);
    setFile(fileValue);
    setParsing(true);
    try {
      if (!isSupportedDocument(fileValue.name))
        throw new Error('Formato não suportado. Use ' + DOCUMENT_FORMAT_LABEL + '.');
      const result = await parseDocumentFile(fileValue, {
        signal: current.signal,
        onProgress: (n, total) => {
          if (!current.signal.aborted) setParseProgress(`Página ${n} de ${total}`);
        },
      });
      const fileSource = await sourceFromFile(fileValue);
      if (current.signal.aborted) return;
      setSource(fileSource);
      setParsed(result);
      setSections(prepareAdventureImportSections(result.chapters));
      setTitle(result.title);
      setExpanded(null);
    } catch (cause) {
      if (!current.signal.aborted)
        setParseError(
          cause instanceof Error ? cause.message : 'Não foi possível analisar o documento.',
        );
    } finally {
      if (controller.current === current && !current.signal.aborted) setParsing(false);
    }
  }
  async function attachOriginal(next: File) {
    if (!api.progress) return;
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setOriginalLoading(true);
    setOriginalError('');
    try {
      const pages = await confirmAdventureImportOriginal(next, api.progress.source);
      if (current.signal.aborted) return;
      setOriginal(next);
      setOriginalPages(pages);
      setOriginalPage('1');
    } catch (cause) {
      if (!current.signal.aborted)
        setOriginalError(
          cause instanceof Error
            ? cause.message
            : 'Não foi possível conferir o PDF. A revisão foi mantida.',
        );
    } finally {
      if (!current.signal.aborted) setOriginalLoading(false);
    }
  }
  const selected = sections.filter((s) => s.selected),
    hasJob = !!api.importId && !rebuilding,
    locked = api.busy || parsing;
  const review: ConfirmedReview | null = source
    ? {
        schemaVersion: 1,
        project: { title, synopsis, universeId },
        source,
        sections: selected.map((s) => ({ title: s.title, content: s.content })),
      }
    : null;
  const tooLarge = selected.some((s) => bytes(s.content) > IMPORT_BODY_LIMIT);
  const active = api.progress;
  function close() {
    controller.current?.abort();
    onClose();
  }
  return (
    <Dialog
      open={open}
      onClose={close}
      title="Importar aventura"
      description="Crie uma nova aventura privada a partir de um documento conferido."
      className="max-w-5xl"
      footer={
        <div className={styles.actions}>
          <Button variant="secondary" onClick={close}>
            {api.importId ? 'Fechar preparação' : 'Fechar conferência'}
          </Button>
          {hasJob ? (
            <>
              <Button
                variant="secondary"
                disabled={api.busy}
                onClick={() => void api.verify(api.importId!)}
              >
                Verificar pedido
              </Button>
              <Button
                disabled={api.busy}
                onClick={() => void api.resume(api.importId!, review ?? undefined)}
              >
                Retomar importação
              </Button>
              <Button
                variant="destructive"
                disabled={api.busy || active?.state === 'activated' || active?.state === 'deleted'}
                onClick={() => setCancelOpen(true)}
              >
                Cancelar importação
              </Button>
            </>
          ) : (
            <Button
              disabled={locked || !review || !selected.length || !title.trim() || tooLarge}
              onClick={() => {
                if (review) {
                  if (rebuilding && api.importId) {
                    setRebuilding(false);
                    void api.resume(api.importId, review);
                  } else void api.start(review);
                }
              }}
            >
              Confirmar importação
            </Button>
          )}
        </div>
      }
    >
      <div className={styles.stack}>
        {(api.error || parseError) && (
          <Alert variant="destructive">
            <span className={styles.errorMessage}>{api.error || parseError}</span>
          </Alert>
        )}
        {api.busy && <LoadingState label="Conferindo e preparando a importação..." />}
        {hasJob ? (
          <>
            <Alert>
              O pedido está em preparação ou confirmação. Fechar não cancela a importação. A
              aventura só ficará disponível após a ativação; a revisão só estará protegida após a
              gravação cifrada completa.
            </Alert>
            {active ? (
              <>
                <h3>{active.title}</h3>
                <p role="status">
                  {active.state === 'uploading'
                    ? 'Enviando seções'
                    : active.state === 'preparing'
                      ? 'Preparando partes e cenas'
                      : active.state === 'ready'
                        ? 'Pronta para ativar'
                        : active.state === 'deleting'
                          ? 'Limpando preparação'
                          : active.state === 'deleted'
                            ? 'Importação cancelada'
                            : 'Aventura ativada'}
                  : {active.uploadedSections} de {active.sectionCount} seções recebidas;{' '}
                  {active.preparedSections} preparadas.
                </p>
              </>
            ) : (
              <p>O pedido ainda precisa ser confirmado com o servidor.</p>
            )}
            {active?.state === 'uploading' && !api.record?.snapshot && !api.busy && (
              <Alert variant="warning">
                Ainda não há cópia protegida completa neste dispositivo. Antes do envio, ela precisa
                ser gravada com sucesso. Após reload, reconstrua a mesma revisão ou cancele.
              </Alert>
            )}
            {active?.state === 'uploading' && !api.record?.snapshot && !api.busy && (
              <Button variant="secondary" disabled={api.busy} onClick={() => setRebuilding(true)}>
                Reconstruir a mesma revisão
              </Button>
            )}
            {active?.source.mediaType === 'application/pdf' && (
              <section className={styles.section}>
                <h3>Conferir PDF original</h3>
                <p>
                  Reanexe o mesmo arquivo para consultar suas páginas. A revisão confirmada
                  permanece intacta.
                </p>
                <Input
                  type="file"
                  label="PDF original para conferência"
                  accept=".pdf"
                  disabled={originalLoading}
                  onChange={(e) => {
                    const next = e.target.files?.[0];
                    if (next) void attachOriginal(next);
                  }}
                />
                {originalLoading && <LoadingState label="Conferindo a identidade do PDF..." />}
                {originalError && <Alert variant="warning">{originalError}</Alert>}
                {original && (
                  <>
                    <Dropdown
                      mode="select"
                      label="Página original do PDF"
                      value={originalPage}
                      onValueChange={setOriginalPage}
                      options={Array.from({ length: originalPages }, (_, i) => ({
                        value: String(i + 1),
                        label: 'Página ' + (i + 1),
                      }))}
                    />
                    <PdfPagePreview
                      key={originalPage}
                      file={original}
                      pageNumber={Number(originalPage)}
                    />
                  </>
                )}
              </section>
            )}
          </>
        ) : (
          <>
            <Alert>
              Cada seção selecionada cria uma parte, uma cena e seu bloco principal privado. Não
              serão inferidos lore, audiências ou imagens.
            </Alert>
            <Input
              ref={fileRef}
              type="file"
              label="Arquivo da aventura"
              accept={DOCUMENT_EXTENSIONS.join(',')}
              disabled={locked}
              onChange={(e) => {
                const next = e.target.files?.[0];
                if (next) void process(next);
              }}
            />
            <p>Formatos: {DOCUMENT_FORMAT_LABEL}. O arquivo original permanece neste navegador.</p>
            {parsing && <LoadingState label={parseProgress || 'Analisando documento...'} />}
            {parsed && (
              <>
                <Input
                  label="Título da aventura"
                  value={title}
                  maxLength={300}
                  disabled={locked}
                  onChange={(e) => setTitle(e.target.value)}
                />
                <Textarea
                  label="Sinopse da aventura"
                  value={synopsis}
                  maxLength={4000}
                  disabled={locked}
                  onChange={(e) => setSynopsis(e.target.value)}
                />
                <UniverseSelect
                  value={universeId}
                  onChange={setUniverseId}
                  disabled={locked}
                  alwaysShow
                  hint="Universo opcional. A aventura importada continua privada."
                />
                <p>
                  {sections.length} seções encontradas; {selected.length} selecionadas.
                </p>
                {tooLarge && (
                  <Alert variant="warning">
                    Uma seção selecionada excede o limite de 800.000 bytes. Divida antes de
                    confirmar; o texto não será truncado.
                  </Alert>
                )}
                {(parsed.warnings ?? []).map((warning, i) => (
                  <Alert key={i} variant="warning">
                    {warning.message}
                    <div className={styles.actions}>
                      {warning.pages.map((n) => (
                        <Button
                          key={n}
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const s =
                              sections.find((s) => s.sourcePages?.includes(n)) ?? sections[0];
                            if (s) {
                              setExpanded(s.id);
                              setPage(n);
                            }
                          }}
                        >
                          Página {n}
                        </Button>
                      ))}
                    </div>
                  </Alert>
                ))}
                <div className={styles.actions}>
                  <Button
                    variant="secondary"
                    disabled={locked}
                    onClick={() => setSections((ss) => ss.map((s) => ({ ...s, selected: true })))}
                  >
                    Selecionar todas
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={locked}
                    onClick={() => setSections((ss) => ss.map((s) => ({ ...s, selected: false })))}
                  >
                    Desmarcar todas
                  </Button>
                </div>
                {sections.map((section, index) => (
                  <section className={styles.section} key={section.id}>
                    <div className={styles.row}>
                      <Input
                        type="checkbox"
                        className="h-5 w-5"
                        label={`Selecionar seção ${index + 1}`}
                        checked={section.selected}
                        disabled={locked}
                        onChange={(e) =>
                          setSections((ss) =>
                            ss.map((s) =>
                              s.id === section.id ? { ...s, selected: e.target.checked } : s,
                            ),
                          )
                        }
                      />
                      <Input
                        label={`Título da seção ${index + 1}`}
                        maxLength={300}
                        disabled={locked}
                        value={section.title}
                        onChange={(e) =>
                          setSections((ss) =>
                            ss.map((s) =>
                              s.id === section.id ? { ...s, title: e.target.value } : s,
                            ),
                          )
                        }
                      />
                      <Badge variant="secondary">{section.wordCount} palavras</Badge>
                    </div>
                    {section.sourcePages?.length && (
                      <p>Páginas de origem: {section.sourcePages.join(', ')}</p>
                    )}
                    <Button
                      variant="secondary"
                      disabled={locked}
                      aria-expanded={expanded === section.id}
                      onClick={() => {
                        setExpanded(expanded === section.id ? null : section.id);
                        setPage(section.sourcePages?.[0] ?? 1);
                      }}
                    >
                      {expanded === section.id ? 'Recolher prévia' : 'Conferir conteúdo'}
                    </Button>
                    {expanded === section.id && file && (
                      <DocumentSectionReview
                        key={section.id + ':' + page}
                        section={section}
                        sectionLabel="seção"
                        file={file}
                        pageCount={parsed.pageCount}
                        initialPage={page}
                        disabled={locked}
                        canMerge={
                          !!sections[index + 1] &&
                          section.selected === sections[index + 1]!.selected
                        }
                        onSplit={(at) =>
                          setSections((ss) =>
                            ss.flatMap((s) =>
                              s.id === section.id ? splitImportedSection(s, at) : [s],
                            ),
                          )
                        }
                        onMerge={() =>
                          setSections((ss) => {
                            const next = ss[index + 1];
                            if (!next || next.selected !== section.selected) return ss;
                            return [
                              ...ss.slice(0, index),
                              mergeImportedSections(section, next),
                              ...ss.slice(index + 2),
                            ];
                          })
                        }
                      />
                    )}
                    {expanded === section.id &&
                      sections[index + 1] &&
                      section.selected !== sections[index + 1]!.selected && (
                        <p>Para unir, selecione ou desmarque as duas seções explicitamente.</p>
                      )}
                    {expanded !== section.id && (
                      <div className={styles.preview}>{section.preview}</div>
                    )}
                  </section>
                ))}
                <Alert>
                  A revisão confirmada será protegida neste dispositivo, sem o arquivo original. O
                  envio só começa após a gravação da cópia cifrada. Antes de confirmar, fechar
                  descarta esta conferência.
                </Alert>
              </>
            )}
          </>
        )}
      </div>
      <Dialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancelar esta importação?"
        description="A preparação será encerrada e os dados temporários serão removidos. Uma aventura já ativada será preservada."
        footer={
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              Continuar preparando
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setCancelOpen(false);
                void api.cancel(api.importId!);
              }}
            >
              Confirmar cancelamento
            </Button>
          </div>
        }
      >
        <p>Os dados temporários serão removidos em etapas retomáveis.</p>
      </Dialog>
    </Dialog>
  );
}
