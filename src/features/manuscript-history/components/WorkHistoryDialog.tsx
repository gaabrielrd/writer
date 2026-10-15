import { useState } from 'react';
import { Copy, History, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { renderRichText } from '@/shared/lib';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
} from '@/shared/ui';
import { useWorkHistory, type UseWorkHistoryOptions } from '../hooks/useWorkHistory';
import { sameVersionResource, type VersionSummary } from '../model/workHistory';
import styles from './WorkHistoryDialog.module.css';

export interface WorkHistoryDialogProps extends UseWorkHistoryOptions {
  onClose: () => void;
}
function versionTitle(version: VersionSummary) {
  return (
    version.label ||
    (version.reason === 'before-restore' ? 'Antes da restauração' : 'Versão manual')
  );
}
function versionDate(value: number) {
  return Number.isFinite(value) && Math.abs(value) <= 8_640_000_000_000_000
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(value)
    : 'Data indisponível';
}
export function WorkHistoryDialog(props: WorkHistoryDialogProps) {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <HistorySession
      key={JSON.stringify([
        user.uid,
        props.target.kind,
        props.target.id,
        props.resource?.kind,
        props.resource?.id,
      ])}
      {...props}
    />
  );
}
function HistorySession(props: WorkHistoryDialogProps) {
  const history = useWorkHistory(props);
  const [label, setLabel] = useState('');
  const [confirmation, setConfirmation] = useState<'restore' | 'delete' | null>(null);
  const locked = history.busy || Boolean(history.pending);
  const selected = history.selected;
  const editable =
    props.editor && props.resource && sameVersionResource(props.editor.resource, props.resource);
  const confirmedContent = props.editor?.getConfirmedContent();
  const sameObservedSource = Boolean(
    props.editor &&
    history.source &&
    sameVersionResource(props.editor.resource, history.source.resource) &&
    confirmedContent === history.source.content,
  );
  const sourceMismatch = Boolean(
    props.editor &&
    history.source &&
    sameVersionResource(props.editor.resource, history.source.resource) &&
    confirmedContent !== null &&
    confirmedContent !== undefined &&
    confirmedContent !== history.source.content,
  );
  const canCreate = Boolean(
    editable &&
    sameObservedSource &&
    history.source &&
    !history.sourceLoading &&
    !history.conflict &&
    !props.editor?.blockedReason &&
    !locked,
  );
  const canRestore = Boolean(
    selected &&
    sameObservedSource &&
    history.source &&
    props.editor &&
    sameVersionResource(selected.version.resource, props.editor.resource) &&
    !props.editor.blockedReason &&
    !history.sourceLoading &&
    !history.conflict &&
    !locked,
  );
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title="Histórico do texto"
      description="Guarde versões manualmente e compare antes de restaurar. A restauração guarda uma cópia do texto substituído."
      maxWidthClass="max-w-5xl"
      className={styles.dialog}
      footer={
        <Button variant="outline" onClick={props.onClose}>
          Fechar histórico
        </Button>
      }
    >
      <div className={styles.content}>
        <p className={styles.hint}>
          Versões permanecem até você excluí-las ou remover o projeto. Elas ocupam armazenamento e
          ainda não fazem parte do backup do projeto.
        </p>
        {props.editor?.blockedReason && (
          <Alert variant="warning">
            {props.editor.blockedReason} A comparação mostra o texto confirmado, sem substituir suas
            alterações.
          </Alert>
        )}
        {sourceMismatch && (
          <Alert variant="warning">
            O texto confirmado neste editor difere do texto salvo no projeto. Resolva a diferença
            entre os textos antes de criar ou restaurar uma versão. Atualizar a comparação não
            altera o editor.
          </Alert>
        )}
        {history.pending && (
          <Alert variant="warning">
            Há uma operação de histórico ainda não confirmada. Confirme o mesmo pedido antes de
            continuar escrevendo.
            <Button
              variant="secondary"
              disabled={history.busy}
              onClick={() => void history.recover()}
            >
              Confirmar operação pendente
            </Button>
          </Alert>
        )}
        {history.error && <Alert variant="destructive">{history.error}</Alert>}
        {history.notice && <p role="status">{history.notice}</p>}
        {history.conflict && (
          <Alert variant="warning">
            O texto confirmado pode ter mudado. Confira a comparação novamente antes de tentar
            restaurar ou guardar outra versão.
            <Button
              variant="outline"
              disabled={locked || history.sourceLoading}
              onClick={() => void history.compareCurrent()}
            >
              Atualizar comparação
            </Button>
          </Alert>
        )}
        {editable && (
          <section className={styles.capture} aria-label="Guardar versão do texto">
            <Input
              label="Nome da versão (opcional)"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              disabled={locked}
            />
            <Button disabled={!canCreate} onClick={() => void history.create(label)}>
              <Plus className="icon icon-sm" aria-hidden="true" />
              Criar versão
            </Button>
            {!canCreate &&
              !locked &&
              !history.sourceLoading &&
              !props.editor?.blockedReason &&
              !sourceMismatch && (
                <p className={styles.hint}>Salve e confirme o texto antes de criar uma versão.</p>
              )}
          </section>
        )}
        <section className={styles.versions} aria-label="Versões guardadas">
          <div className={styles.heading}>
            <h3>
              <History className="icon icon-sm" aria-hidden="true" />
              Versões guardadas
            </h3>
            <Button variant="ghost" disabled={locked || history.loading} onClick={history.refresh}>
              Atualizar versões
            </Button>
          </div>
          {history.loading ? (
            <LoadingState label="Carregando versões…" />
          ) : history.listError ? (
            <ErrorState
              title="Não foi possível carregar o histórico"
              description={history.listError}
              onRetry={history.refresh}
            />
          ) : !history.items.length ? (
            <EmptyState
              title="Nenhuma versão guardada"
              description="Crie uma versão manual de um capítulo ou cena para guardar esse ponto do texto."
            />
          ) : (
            <ul className={styles.list}>
              {history.items.map((version) => (
                <li key={version.id}>
                  <Button
                    variant={history.selectedId === version.id ? 'secondary' : 'outline'}
                    className={styles.versionButton}
                    aria-pressed={history.selectedId === version.id}
                    disabled={locked}
                    onClick={() => {
                      setConfirmation(null);
                      void history.select(version);
                    }}
                  >
                    <span>{versionTitle(version)}</span>
                    <span className={styles.hint}>
                      {version.resource.kind === 'chapter'
                        ? 'Capítulo'
                        : version.resource.kind === 'block'
                          ? 'Bloco'
                          : 'Cena'}{' '}
                      · {versionDate(version.createdAt)} ·{' '}
                      {version.wordCount.toLocaleString('pt-BR')} palavras
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {history.moreError && <Alert variant="destructive">{history.moreError}</Alert>}
          {history.nextCursor && (
            <Button
              variant="outline"
              disabled={history.loadingMore || locked}
              onClick={() => void history.loadMore()}
            >
              {history.loadingMore ? 'Carregando versões…' : 'Carregar mais versões'}
            </Button>
          )}
        </section>
        {history.reading && <LoadingState label="Lendo e verificando a versão…" />}
        {history.readError && (
          <ErrorState
            title="Versão indisponível"
            description={history.readError}
            action={
              <Button
                variant="outline"
                onClick={() => {
                  const version = history.items.find((item) => item.id === history.selectedId);
                  if (version) void history.select(version);
                }}
              >
                Tentar ler versão novamente
              </Button>
            }
          />
        )}
        {history.sourceError && (
          <Alert variant="warning">
            {history.sourceError}
            <Button
              variant="outline"
              disabled={locked || history.sourceLoading}
              onClick={() => void history.compareCurrent()}
            >
              Atualizar comparação
            </Button>
          </Alert>
        )}
        {selected && (
          <section className={styles.preview} aria-label="Comparação da versão">
            <div className={styles.heading}>
              <h3>{versionTitle(selected.version)}</h3>
              <Badge variant="secondary">Versão privada</Badge>
            </div>
            {history.sourceLoading ? (
              <LoadingState label="Carregando texto confirmado…" />
            ) : (
              !history.source &&
              !history.sourceError && (
                <Alert variant="info">
                  A origem desta versão não está disponível. Você pode copiar ou excluir a versão. A
                  restauração exige a mesma cena ou capítulo existente e editável.
                </Alert>
              )
            )}
            <div className={styles.comparison}>
              <section aria-label="Texto da versão guardada">
                <h4>Versão guardada</h4>
                <div
                  className={styles.prose}
                  dangerouslySetInnerHTML={{ __html: renderRichText(selected.content) }}
                />
              </section>
              {history.source && (
                <section aria-label="Texto atual confirmado">
                  <h4>Texto atual confirmado</h4>
                  <div
                    className={styles.prose}
                    dangerouslySetInnerHTML={{ __html: renderRichText(history.source.content) }}
                  />
                </section>
              )}
            </div>
            {!props.editor && history.source && (
              <p className={styles.hint}>
                Abra o capítulo ou a cena de origem para restaurar esta versão.
              </p>
            )}
            <div className={styles.actions}>
              <Button variant="outline" disabled={locked} onClick={() => void history.copy()}>
                <Copy className="icon icon-sm" aria-hidden="true" />
                Copiar texto da versão
              </Button>
              <Button
                variant="secondary"
                disabled={!canRestore}
                onClick={() => setConfirmation('restore')}
              >
                <RotateCcw className="icon icon-sm" aria-hidden="true" />
                Restaurar esta versão
              </Button>
              <Button variant="outline" disabled={locked} onClick={() => setConfirmation('delete')}>
                <Trash2 className="icon icon-sm" aria-hidden="true" />
                Excluir esta versão
              </Button>
            </div>
            {confirmation === 'restore' && (
              <Alert variant="warning">
                <p>
                  Substituir somente o texto desta cena ou capítulo? O texto atual será guardado
                  como uma versão recuperável. Planejamento, posição e créditos permanecem iguais.
                </p>
                {props.editor?.destinationAudience && (
                  <p>
                    Audiência atual: {props.editor.destinationAudience}. A restauração troca apenas
                    o texto; a audiência permanece igual.
                  </p>
                )}
                <div className={styles.actions}>
                  <Button
                    disabled={!canRestore}
                    onClick={() => {
                      setConfirmation(null);
                      void history.restore();
                    }}
                  >
                    Confirmar restauração
                  </Button>
                  <Button variant="outline" disabled={locked} onClick={() => setConfirmation(null)}>
                    Cancelar restauração
                  </Button>
                </div>
              </Alert>
            )}
            {confirmation === 'delete' && (
              <Alert variant="warning">
                <p>
                  Excluir definitivamente esta versão guardada? O texto atual do manuscrito
                  permanece igual.
                </p>
                <div className={styles.actions}>
                  <Button
                    variant="destructive"
                    disabled={locked}
                    onClick={() => {
                      setConfirmation(null);
                      void history.remove(selected.version);
                    }}
                  >
                    Confirmar exclusão da versão
                  </Button>
                  <Button variant="outline" disabled={locked} onClick={() => setConfirmation(null)}>
                    Cancelar exclusão
                  </Button>
                </div>
              </Alert>
            )}
          </section>
        )}
      </div>
    </Dialog>
  );
}
