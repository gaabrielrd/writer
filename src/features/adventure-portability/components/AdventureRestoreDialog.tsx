import { useEffect, useRef, useState } from 'react';
import { ArchiveRestore, Check, Pause } from 'lucide-react';
import { Alert, Badge, Button, Dialog, Input, LoadingState } from '@/shared/ui';
import { useAdventureRestore } from '../hooks/useAdventureRestore';
import styles from './AdventureRestore.module.css';
type Warnings = {
  missingDates: number;
  danglingLocalReferences: number;
  externalReferences: number;
  orphanGroups: number;
  unknownOverrides: number;
  historicalOnlyResources: number;
};
function Warnings({ value }: { value: Warnings }) {
  const items = [
    [value.missingDates, 'datas não registradas.'],
    [value.danglingLocalReferences, 'referências internas indisponíveis.'],
    [value.externalReferences, 'referências externas dependem de acesso atual.'],
    [value.orphanGroups, 'grupos sem vínculo disponível.'],
    [value.unknownOverrides, 'ajustes de persona não reconhecidos.'],
    [value.historicalOnlyResources, 'recursos preservados somente no histórico.'],
  ] as const;
  return items.some(([count]) => count > 0) ? (
    <Alert variant="warning" title="Materiais que precisam de atenção">
      <ul className={styles.list}>
        {items
          .filter(([count]) => count > 0)
          .map(([count, text]) => (
            <li key={text}>
              {count} {text}
            </li>
          ))}
      </ul>
    </Alert>
  ) : null;
}
function Summary({ items }: { items: readonly (readonly [string, number])[] }) {
  return (
    <dl className={styles.summary}>
      {items.map(([label, count]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{count}</dd>
        </div>
      ))}
    </dl>
  );
}
export interface AdventureRestoreDialogProps {
  open: boolean;
  ownerId: string;
  restoreId?: string;
  onClose: () => void;
  onOpenAdventure: (id: string, guard: () => void) => Promise<void>;
}
export function AdventureRestoreDialog(props: AdventureRestoreDialogProps) {
  return props.open ? (
    <RestoreSession key={props.ownerId + ':' + (props.restoreId ?? 'new')} {...props} />
  ) : null;
}
function RestoreSession({
  ownerId,
  restoreId,
  onClose,
  onOpenAdventure,
}: AdventureRestoreDialogProps) {
  const api = useAdventureRestore(ownerId, restoreId),
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
    terminal = api.job?.state === 'activated' || api.job?.state === 'cancelled',
    canCancel = !!api.id && !terminal && !api.done;
  return (
    <Dialog
      open
      onClose={onClose}
      title="Restaurar backup de aventura"
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
                <Button onClick={() => void api.open(onOpenAdventure)}>Abrir aventura</Button>
              )}
            </>
          )}
        </div>
      }
    >
      <div className={styles.stack}>
        <p className={styles.muted}>A aventura original será preservada. A cópia será privada.</p>
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
            hint="Use um backup de aventura do Writer (.writer). O arquivo fica apenas nesta janela."
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
              <Badge variant="secondary">Backup de aventura do Writer</Badge>
              <Summary
                items={[
                  ['Partes', local.totals.parts],
                  ['Cenas', local.totals.resources.scene],
                  ['Versões de texto', local.totals.versions],
                  ['Ilustrações', local.totals.imageAssets],
                ]}
              />
              <p>
                O histórico registrado será preservado. O texto salvo permanece no manuscrito e o
                rascunho será recuperado como uma versão separada.
              </p>
              <p>O universo original será religado somente se o acesso continuar autorizado.</p>
              <Warnings value={local.warnings} />
            </div>
          </section>
        )}
        {final && (
          <section className={styles.section} aria-label="Revisão da cópia privada">
            <div className={styles.stack}>
              <h3 className={styles.heading}>
                {final.summary.titlePreview || 'Aventura sem título'}
                {final.summary.titleTruncated ? '…' : ''}
              </h3>
              <Badge variant="secondary">Cópia privada</Badge>
              <Summary
                items={[
                  ['Partes', final.summary.counts.parts],
                  ['Cenas', final.summary.counts.scenes],
                  ['Blocos', final.summary.counts.blocks],
                  ['Palavras', final.summary.counts.words],
                  ['Fichas de lore', final.summary.counts.lore],
                  ['Versões de texto', final.summary.counts.versions],
                  ['Personas', final.summary.counts.profiles],
                  ['Ilustrações', final.summary.counts.images],
                ]}
              />
              <p>
                {final.summary.universe.observed === 'available'
                  ? 'Vínculo com o universo original autorizado.'
                  : final.summary.universe.observed === 'none'
                    ? 'Sem universo vinculado.'
                    : 'Universo original indisponível; ele não será duplicado.'}
              </p>
              <p>
                {final.summary.mediaState === 'pending'
                  ? 'As ilustrações serão finalizadas na biblioteca após criar a cópia.'
                  : 'Sem ilustrações no backup.'}
              </p>
              {final.summary.draftOutcome === 'version' && (
                <p>
                  O texto salvo ficará no manuscrito e o rascunho será preservado como versão
                  separada.
                </p>
              )}
              <Warnings value={final.summary.warnings} />
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
                  ? 'A preparação da cópia será descartada. A aventura original será preservada.'
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
