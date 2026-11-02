import { useEffect, useRef, useState } from 'react';
import { ArchiveRestore, Check, Pause } from 'lucide-react';
import { Alert, Badge, Button, Dialog, Input, LoadingState } from '@/shared/ui';
import { useBookRestore } from '../hooks/useBookRestore';
import styles from './BookRestore.module.css';
export interface BookRestoreDialogProps {
  open: boolean;
  ownerId: string;
  restoreId?: string;
  onClose: () => void;
  onOpenBook: (id: string, guard: () => void) => Promise<void>;
}
export function BookRestoreDialog(props: BookRestoreDialogProps) {
  return props.open ? (
    <RestoreSession key={props.ownerId + ':' + (props.restoreId ?? 'new')} {...props} />
  ) : null;
}
function RestoreSession({ ownerId, restoreId, onClose, onOpenBook }: BookRestoreDialogProps) {
  const api = useBookRestore(ownerId, restoreId),
    load = useRef(api.load);
  const [confirmation, setConfirmation] = useState<'cancel' | 'discard' | null>(null);
  useEffect(() => {
    let active = true;
    if (restoreId)
      queueMicrotask(() => {
        if (active) void load.current();
      });
    return () => {
      active = false;
    };
  }, [restoreId]);
  const local = api.inspection?.review,
    final = api.review,
    terminal = api.job?.state === 'activated' || api.job?.state === 'cancelled';
  const canCancel = !!api.id && !terminal && !api.done;
  return (
    <Dialog
      open
      onClose={onClose}
      title="Restaurar backup de livro"
      description="Prepare uma nova cópia privada a partir de um backup do Writer."
      maxWidthClass="max-w-2xl"
      footer={
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          {api.busy ? (
            <Button variant="secondary" onClick={api.pause}>
              <Pause className="icon icon-sm" aria-hidden="true" />
              Pausar
            </Button>
          ) : (
            <>
              {!api.id && (
                <Button disabled={!local} onClick={() => void api.start()}>
                  <ArchiveRestore className="icon icon-sm" aria-hidden="true" />
                  Preparar cópia
                </Button>
              )}
              {api.id && !api.done && (
                <Button variant={final ? 'secondary' : 'primary'} onClick={() => void api.resume()}>
                  Retomar
                </Button>
              )}
              {final && (
                <Button onClick={() => void api.activate()}>
                  <Check className="icon icon-sm" aria-hidden="true" />
                  Criar cópia privada
                </Button>
              )}
              {api.job?.state === 'activated' && (
                <Button onClick={() => void api.open(onOpenBook)}>Abrir livro</Button>
              )}
            </>
          )}
        </div>
      }
    >
      <div className={styles.stack}>
        <p className={styles.muted}>
          O original será preservado. A cópia não será publicada nem colocada à venda.
        </p>
        {api.error && (
          <Alert variant="destructive" title="Não foi possível concluir">
            {api.error} A tentativa foi preservada; retome ou verifique o pedido.
          </Alert>
        )}
        {api.busy ? (
          <LoadingState label={api.message} />
        ) : (
          <p role="status" aria-live="polite">
            {api.message}
          </p>
        )}
        {(!api.id || api.job?.state === 'uploading' || (!api.job && !api.done)) && (
          <Input
            type="file"
            label={api.id ? 'Selecionar o mesmo backup' : 'Selecionar backup'}
            hint="Use um arquivo de backup do Writer ou JSON legado. O arquivo fica apenas nesta janela."
            disabled={api.busy}
            onChange={(event) => {
              const value = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (value) void api.inspect(value);
            }}
          />
        )}
        {local && !final && (
          <section className={styles.section} aria-label="Revisão do backup">
            <div className={styles.stack}>
              <h3>Revisão do backup</h3>
              <Badge variant="secondary">
                {local.legacy
                  ? 'JSON legado · versão ' + local.source.version
                  : 'Backup completo do Writer'}
              </Badge>
              <dl className={styles.summary}>
                <div>
                  <dt>Partes</dt>
                  <dd>{local.totals.acts}</dd>
                </div>
                <div>
                  <dt>Capítulos</dt>
                  <dd>{local.totals.chapters}</dd>
                </div>
                <div>
                  <dt>Versões de texto</dt>
                  <dd>{local.totals.versions}</dd>
                </div>
                <div>
                  <dt>Personas</dt>
                  <dd>{local.totals.profiles}</dd>
                </div>
              </dl>
              <p>
                O histórico registrado no arquivo será preservado. Se houver texto salvo e rascunho
                diferentes, o texto salvo permanece no manuscrito e o rascunho vira uma versão
                separada.
              </p>
              <p>
                O livro será religado ao universo original somente se o acesso continuar autorizado.
              </p>
              {local.legacy && (
                <Alert variant="warning">
                  Este formato antigo não registra histórico nem progresso e não separa o rascunho
                  do texto salvo. Dados ausentes não serão inventados.
                  {local.legacy.publicationDiscarded
                    ? ' A publicação anterior não será restaurada.'
                    : ''}
                </Alert>
              )}
              {(local.warnings.missingDates > 0 ||
                local.warnings.danglingLocalReferences > 0 ||
                local.warnings.externalReferences > 0 ||
                local.warnings.orphanGroups > 0 ||
                local.warnings.legacyCover ||
                !!local.warnings.missingPersonas ||
                !!local.warnings.unknownOverrides) && (
                <Alert variant="warning" title="Materiais que precisam de atenção">
                  <ul className={styles.list}>
                    {local.warnings.missingDates > 0 && (
                      <li>{local.warnings.missingDates} datas não registradas.</li>
                    )}
                    {local.warnings.danglingLocalReferences > 0 && (
                      <li>
                        {local.warnings.danglingLocalReferences} referências internas indisponíveis.
                      </li>
                    )}
                    {local.warnings.externalReferences > 0 && (
                      <li>
                        {local.warnings.externalReferences} referências externas dependem de acesso
                        atual.
                      </li>
                    )}
                    {local.warnings.orphanGroups > 0 && (
                      <li>{local.warnings.orphanGroups} grupos sem vínculo disponível.</li>
                    )}
                    {local.warnings.legacyCover && <li>A capa antiga pode estar indisponível.</li>}
                    {!!local.warnings.missingPersonas && (
                      <li>{local.warnings.missingPersonas} personas não registradas.</li>
                    )}
                    {!!local.warnings.unknownOverrides && (
                      <li>{local.warnings.unknownOverrides} ajustes antigos não reconhecidos.</li>
                    )}
                  </ul>
                </Alert>
              )}
            </div>
          </section>
        )}
        {final && (
          <section className={styles.section} aria-label="Revisão da cópia privada">
            <div className={styles.stack}>
              <h3 className={styles.heading}>
                {final.summary.titlePreview || 'Livro sem título'}
                {final.summary.titleTruncated ? '…' : ''}
              </h3>
              <Badge variant="secondary">Cópia privada</Badge>
              <dl className={styles.summary}>
                <div>
                  <dt>Capítulos</dt>
                  <dd>{final.summary.counts.chapters}</dd>
                </div>
                <div>
                  <dt>Palavras</dt>
                  <dd>{final.summary.counts.words}</dd>
                </div>
                <div>
                  <dt>Cenas</dt>
                  <dd>{final.summary.counts.scenes}</dd>
                </div>
                <div>
                  <dt>Fichas de lore</dt>
                  <dd>{final.summary.counts.lore}</dd>
                </div>
                <div>
                  <dt>Versões de texto</dt>
                  <dd>{final.summary.counts.versions}</dd>
                </div>
                <div>
                  <dt>Personas</dt>
                  <dd>{final.summary.counts.profiles}</dd>
                </div>
              </dl>
              <p>
                {final.summary.universe.observed === 'available'
                  ? 'Vínculo com o universo original autorizado.'
                  : final.summary.universe.observed === 'none'
                    ? 'Sem universo vinculado.'
                    : 'Universo original indisponível; ele não será duplicado.'}
              </p>
              <p>
                {final.summary.cover.kind === 'library'
                  ? 'A capa será finalizada na biblioteca de imagens.'
                  : final.summary.cover.kind === 'none'
                    ? 'Sem capa.'
                    : 'A capa antiga não está disponível neste backup.'}
              </p>
              {final.summary.draft.outcome !== 'none' && (
                <p>
                  {final.summary.draft.outcome === 'version'
                    ? 'O texto salvo ficará no manuscrito e o rascunho será preservado como versão separada.'
                    : 'O rascunho foi preservado no texto da cópia.'}
                </p>
              )}
              <p>Escolha Criar cópia privada para confirmar esta revisão.</p>
            </div>
          </section>
        )}
        {api.id && !api.busy && (
          <div className={styles.actions}>
            <Button variant="secondary" onClick={() => void api.verify()}>
              Verificar pedido
            </Button>
            {canCancel && (
              <Button variant="destructive" onClick={() => setConfirmation('cancel')}>
                Cancelar preparação
              </Button>
            )}
            {terminal && api.localRecovery && (
              <Button variant="secondary" onClick={() => setConfirmation('discard')}>
                Remover recuperação local
              </Button>
            )}
          </div>
        )}
        {confirmation && (
          <Alert
            variant="warning"
            title={
              confirmation === 'cancel'
                ? 'Cancelar esta preparação?'
                : 'Remover a recuperação deste dispositivo?'
            }
          >
            <div className={styles.stack}>
              <p>
                {confirmation === 'cancel'
                  ? 'A cópia ainda não criada será descartada. O livro original será preservado.'
                  : 'A cópia ativa e o backup serão preservados. Esta ação remove somente a recuperação protegida desta preparação no dispositivo.'}
              </p>
              <div className={styles.actions}>
                <Button
                  variant="secondary"
                  disabled={api.busy}
                  onClick={() => setConfirmation(null)}
                >
                  Voltar
                </Button>
                <Button
                  variant="destructive"
                  disabled={api.busy}
                  onClick={() => {
                    const choice = confirmation;
                    setConfirmation(null);
                    void (choice === 'cancel' ? api.cancel() : api.discardLocal());
                  }}
                >
                  Confirmar {confirmation === 'cancel' ? 'cancelamento' : 'remoção local'}
                </Button>
              </div>
            </div>
          </Alert>
        )}
      </div>
    </Dialog>
  );
}
