import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createAdventure } from '@/features/adventures';
import { createCampaign } from '@/features/campaigns';
import { UniverseSelect } from '@/features/universes';
import { Alert, Button, Dialog, Input, Textarea } from '@/shared/ui';
import { isDefinitiveCreationFailure } from '../model/project';
import styles from './StudioPage.module.css';

export function ProjectCreationDialog({
  kind,
  open,
  onClose,
  onCreated,
}: {
  kind: 'adventure' | 'campaign';
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const adventure = kind === 'adventure';
  const label = adventure ? 'aventura' : 'campanha';
  const formId = 'create-' + kind;
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [universeId, setUniverseId] = useState<string | null>(null);
  const [operationId, setOperationId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<{ operationId: string; fingerprint: string; definitive: boolean } | null>(
    null,
  );
  const submitting = useRef(false);
  const active = useRef(true);
  const errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (open && error) errorRef.current?.focus();
  }, [error, open]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current || !title.trim()) return;
    const input = {
      title: title.trim(),
      ...(adventure ? { synopsis: text.trim() } : { description: text.trim() }),
      universeId,
    };
    const fingerprint = JSON.stringify(input);
    let requestId = operationId;
    if (pending.current?.definitive && pending.current.fingerprint !== fingerprint) {
      requestId = crypto.randomUUID();
      setOperationId(requestId);
    }
    submitting.current = true;
    setSaving(true);
    setError('');
    pending.current = { operationId: requestId, fingerprint, definitive: false };
    try {
      const project = adventure
        ? await createAdventure({ ...input, operationId: requestId })
        : await createCampaign({ ...input, operationId: requestId });
      if (active.current) onCreated(project.id);
    } catch (cause) {
      if (!active.current) return;
      const definitive = isDefinitiveCreationFailure(cause);
      pending.current = { operationId: requestId, fingerprint, definitive };
      setUncertain(!definitive);
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível confirmar a criação. Tente novamente.',
      );
    } finally {
      submitting.current = false;
      if (active.current) setSaving(false);
    }
  }
  const locked = saving || uncertain;
  return (
    <Dialog
      open={open}
      title={'Criar ' + label}
      description={
        adventure
          ? 'Comece uma aventura autoral e privada.'
          : 'Organize uma campanha privada e independente.'
      }
      onClose={() => {
        if (!saving) onClose();
      }}
      footer={
        <div className={styles.actions}>
          <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>
            Fechar formulário
          </Button>
          <Button type="submit" form={formId} disabled={saving || !title.trim()}>
            {saving ? 'Criando...' : uncertain ? 'Verificar criação' : 'Criar ' + label}
          </Button>
        </div>
      }
    >
      <form id={formId} onSubmit={(event) => void submit(event)} className={styles.form}>
        {error && (
          <Alert ref={errorRef} tabIndex={-1} variant="destructive">
            {error}
          </Alert>
        )}
        {uncertain && (
          <Alert variant="warning">
            A resposta não foi confirmada. Verifique a mesma criação antes de alterar os dados. Ao
            fechar e reabrir este formulário, o pedido será preservado.
          </Alert>
        )}
        <Input
          label={'Título da ' + label}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={300}
          required
          disabled={locked}
        />
        <Textarea
          label={adventure ? 'Sinopse da aventura' : 'Descrição da campanha'}
          hint="Opcional"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={4000}
          rows={4}
          disabled={locked}
        />
        <UniverseSelect
          value={universeId}
          onChange={setUniverseId}
          disabled={locked}
          alwaysShow
          hint={
            adventure
              ? 'Organize a aventura em um universo, ou mantenha o projeto independente.'
              : 'O vínculo organiza a campanha no universo. Sua preparação continua independente.'
          }
        />
        {saving && <p role="status">Criando sua {label}...</p>}
      </form>
    </Dialog>
  );
}
