import { useEffect, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Alert, Button, Dialog, Dropdown, LoadingState } from '@/shared/ui';
import { exportAdventureArchive } from '../services/exportAdventureArchive';
import { adventureArchivePicker } from '../services/adventureArchiveDestination';
import type { AdventureDraftInput } from '../services/adventureDraftData';
import styles from './AdventureBackup.module.css';
export interface AdventureBackupDialogProps {
  open: boolean;
  ownerId: string;
  adventureId: string;
  title: string;
  getDraft?: () => AdventureDraftInput;
  onClose: () => void;
}
export function AdventureBackupDialog(props: AdventureBackupDialogProps) {
  return props.open ? (
    <BackupSession key={props.ownerId + ':' + props.adventureId} {...props} />
  ) : null;
}
function BackupSession({
  ownerId,
  adventureId,
  title,
  getDraft,
  onClose,
}: AdventureBackupDialogProps) {
  const [selection, setSelection] = useState('saved'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const lifetime = useRef(0),
    running = useRef(false),
    controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const generation = ++lifetime.current;
    return () => {
      lifetime.current = generation + 1;
      controller.current?.abort();
    };
  }, []);
  const supported = adventureArchivePicker.supported();
  async function save() {
    if (running.current) return;
    const generation = lifetime.current,
      signal = new AbortController();
    controller.current = signal;
    running.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const guard = () => {
        signal.signal.throwIfAborted();
        if (lifetime.current !== generation)
          throw new DOMException('Sessão encerrada', 'AbortError');
      };
      guard();
      const draft = selection === 'current' && getDraft ? getDraft() : null;
      const result = await exportAdventureArchive({
        ownerId,
        adventureId,
        title,
        draft,
        signal: signal.signal,
        check: guard,
      });
      guard();
      setMessage(result.kind === 'saved' ? 'Backup salvo.' : 'Seleção de arquivo cancelada.');
    } catch {
      if (lifetime.current === generation) {
        if (signal.signal.aborted)
          setMessage('Geração cancelada. Nenhum backup completo foi confirmado.');
        else
          setError(
            'Não foi possível concluir o arquivo. Confira o acesso à aventura e tente uma nova geração.',
          );
      }
    } finally {
      running.current = false;
      if (lifetime.current === generation) setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onClose={onClose}
      title="Backup privado da aventura"
      description="Salve um arquivo completo para restaurar uma nova cópia privada no Estúdio."
      maxWidthClass="max-w-xl"
      footer={
        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose}>
            Fechar
          </Button>
          {busy ? (
            <Button
              key="cancel-generation"
              variant="secondary"
              onClick={() => controller.current?.abort()}
            >
              <X className="icon icon-sm" aria-hidden="true" />
              Cancelar geração
            </Button>
          ) : (
            <Button key="save-backup" disabled={!supported} onClick={() => void save()}>
              <Download className="icon icon-sm" aria-hidden="true" />
              Salvar backup
            </Button>
          )}
        </div>
      }
    >
      <div className={styles.stack}>
        <p>
          O arquivo inclui a aventura inteira: texto salvo, partes, cenas, blocos, planejamento,
          lore local, personas, histórico de versões e ilustrações disponíveis.
        </p>
        <p>
          O vínculo com o universo original será registrado. As fichas do universo não serão
          duplicadas.
        </p>
        <Dropdown
          mode="select"
          label="Texto do backup"
          value={selection}
          onValueChange={setSelection}
          disabled={busy}
          options={[
            { value: 'saved', label: 'Somente estado salvo' },
            ...(getDraft
              ? [{ value: 'current', label: 'Estado salvo e texto aberto como rascunho' }]
              : []),
          ]}
        />
        {getDraft ? (
          <p className={styles.muted}>
            Escolha incluir o texto aberto para guardar também as alterações ainda não salvas. Na
            restauração, o texto salvo fica no manuscrito e o rascunho vira uma versão separada.
          </p>
        ) : (
          <p className={styles.muted}>
            Esta tela inclui somente o estado salvo. Para acrescentar um rascunho, gere o backup no
            editor da cena ou do bloco.
          </p>
        )}
        <p className={styles.muted}>
          O original não será alterado. Se a aventura mudar durante a captura, gere um novo arquivo.
        </p>
        {!supported && (
          <Alert variant="warning" title="Gravação de arquivo indisponível">
            Este navegador não oferece a seleção e gravação necessárias. Abra o Writer em um
            navegador compatível, como o Chrome, em contexto seguro.
          </Alert>
        )}
        {busy && <LoadingState label="Gerando e conferindo o backup..." />}
        {error && (
          <Alert variant="destructive" title="Backup não concluído">
            {error}
          </Alert>
        )}
        {message && (
          <p role="status" aria-live="polite">
            {message}
          </p>
        )}
      </div>
    </Dialog>
  );
}
