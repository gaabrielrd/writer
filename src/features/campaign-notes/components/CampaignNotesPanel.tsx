import { getInvalidationGeneration, subscribeInvalidation } from '@/shared/services';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/features/auth';
import { Alert, Button, Card, Dialog, Input, LoadingState, Textarea } from '@/shared/ui';
import type {
  CampaignNote,
  CampaignNotesEnvelope,
  CampaignNoteSummary,
  CampaignNoteMutationResult,
  PendingCampaignNoteOperation,
} from '../model/campaignNote';
import { useCampaignNoteMutation } from '../hooks/useCampaignNoteMutation';
import * as api from '../services/campaignNotesService';
import { readPendingCampaignNote } from '../services/campaignNotesRecovery';
import styles from './CampaignNotes.module.css';
export interface CampaignNotesPanelProps {
  campaignId: string;
}
interface NoteForm {
  id: string;
  revision: number;
  title: string;
  content: string;
  open: boolean;
  stale: boolean;
  savedTitle: string;
  savedContent: string;
}
const noteForm = (note: CampaignNote): NoteForm => ({
  id: note.id,
  revision: note.revision,
  title: note.title,
  content: note.content,
  savedTitle: note.title,
  savedContent: note.content,
  open: true,
  stale: false,
});
function inputError(title: string, content: string): string {
  if (!title.trim()) return 'Informe um título para a nota.';
  if (title.trim().length > 300) return 'O título pode ter até 300 caracteres.';
  if (content.length > 150000 || new TextEncoder().encode(content).byteLength > 512 * 1024)
    return 'O texto ultrapassa o limite da nota. Seus campos foram mantidos sem truncamento.';
  if (new TextDecoder().decode(new TextEncoder().encode(content)) !== content)
    return 'O texto contém um caractere incompatível. Corrija-o para salvar sem alterar o conteúdo.';
  return '';
}
export function CampaignNotesPanel(props: CampaignNotesPanelProps) {
  const { user } = useAuth();
  const [, pulse] = useState(0),
    scope = { actorId: user?.uid ?? '', scope: 'campaign:' + props.campaignId },
    stamp = user?.uid ? getInvalidationGeneration(scope) : 0;
  useLayoutEffect(() => {
    if (!user?.uid) return;
    return subscribeInvalidation(
      { actorId: user?.uid ?? '', scope: 'campaign:' + props.campaignId },
      () => pulse((n) => n + 1),
    );
  }, [user?.uid, props.campaignId]);
  return user ? (
    <NotesSession
      key={JSON.stringify([user.uid, props.campaignId, stamp])}
      uid={user.uid}
      {...props}
    />
  ) : null;
}
function NotesSession({ uid, campaignId }: { uid: string; campaignId: string }) {
  const pulseScope = { actorId: uid, scope: 'campaign:' + campaignId },
    stamp = useRef(getInvalidationGeneration(pulseScope));
  const pulseActive = useCallback(
    () =>
      getInvalidationGeneration({ actorId: uid, scope: 'campaign:' + campaignId }) ===
      stamp.current,
    [uid, campaignId],
  );
  const [initialToken] = useState(() => {
    try {
      return readPendingCampaignNote(uid, campaignId)?.input.campaignToken;
    } catch {
      return undefined;
    }
  });
  const [form, setForm] = useState<NoteForm | null>(null),
    formRef = useRef(form),
    [deleting, setDeleting] = useState<CampaignNoteSummary | null>(null),
    [notice, setNotice] = useState(''),
    [readError, setReadError] = useState(''),
    [readBusy, setReadBusy] = useState(false),
    [epoch, setEpoch] = useState(0),
    [readCampaignChanged, setReadCampaignChanged] = useState(false),
    [tokenValue, setTokenValue] = useState<string | undefined>(initialToken);
  const alive = useRef(true),
    readGeneration = useRef(0),
    token = useRef<string | undefined>(initialToken),
    collection = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    formRef.current = form;
  });
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const observe = useCallback(
    (value: CampaignNotesEnvelope) => {
      api.validateNoteEnvelope(value, uid, campaignId, token.current);
      if (collection.current !== undefined && value.collectionRevision < collection.current)
        throw new Error(
          'A resposta pertence a uma revisão anterior da lista. Recarregue as notas.',
        );
      token.current = value.campaignToken;
      collection.current = value.collectionRevision;
      setTokenValue(value.campaignToken);
    },
    [uid, campaignId],
  );
  function confirmed(value: CampaignNoteMutationResult, operation: PendingCampaignNoteOperation) {
    observe(value);
    setEpoch((n) => n + 1);
    setNotice('deleted' in value ? 'Nota excluída.' : 'Nota salva.');
    if ('note' in value) {
      const current = formRef.current;
      if (
        !current ||
        (current.id === value.note.id &&
          operation.method === 'saveCampaignNote' &&
          current.title.trim() === operation.input.title.trim() &&
          current.content === ('content' in operation.input ? operation.input.content : undefined))
      )
        setForm({ ...noteForm(value.note), open: current?.open ?? true });
      else if (current.id === value.note.id) setForm({ ...current, stale: true });
    } else {
      setDeleting(null);
      const current = formRef.current;
      if (current?.id === value.noteId) {
        if (current.title !== current.savedTitle || current.content !== current.savedContent)
          setForm({ ...current, stale: true });
        else setForm(null);
      }
    }
  }
  const controller = useCampaignNoteMutation(campaignId, {
    onConfirmed: confirmed,
    onRejected: (operation) => {
      if (operation.method === 'saveCampaignNote' && !formRef.current)
        setForm({
          id: operation.input.noteId,
          revision: operation.input.expectedRevision,
          title: operation.input.title,
          content: operation.input.content,
          savedTitle: '',
          savedContent: '',
          open: true,
          stale: false,
        });
    },
    getCollectionRevision: () => collection.current,
  });
  const locked =
    controller.busy ||
    Boolean(controller.pending) ||
    controller.blocked ||
    controller.conflict ||
    readCampaignChanged ||
    controller.campaignChanged;
  const openNew = () => {
    if (locked || readBusy || !token.current) return;
    readGeneration.current++;
    setNotice('');
    setReadError('');
    const id = crypto.randomUUID();
    setForm({
      id,
      revision: 0,
      title: '',
      content: '',
      savedTitle: '',
      savedContent: '',
      open: true,
      stale: false,
    });
  };
  async function readNote(noteId: string, discard = false) {
    if (
      controller.isReserved() ||
      !token.current ||
      (!discard && (controller.conflict || readCampaignChanged))
    )
      return;
    const generation = ++readGeneration.current,
      observedToken = token.current;
    setReadBusy(true);
    setReadError('');
    try {
      const value = await api.getCampaignNote({ campaignId, campaignToken: observedToken, noteId });
      if (!alive.current || !pulseActive() || readGeneration.current !== generation) return;
      const previous = collection.current;
      observe(value);
      if (previous !== value.collectionRevision) setEpoch((n) => n + 1);
      if (value.note) {
        api.validateCampaignNote(value.note, uid, campaignId, noteId);
        setForm(noteForm(value.note));
      } else {
        setForm(null);
        setNotice('Esta nota foi removida ou não está disponível.');
      }
      if (discard) controller.clearConflict();
    } catch (cause) {
      if (!alive.current || !pulseActive() || readGeneration.current !== generation) return;
      setReadError(api.notesMessage(cause));
      if (api.noteErrorReason(cause) === 'campaign-changed') setReadCampaignChanged(true);
    } finally {
      if (alive.current && pulseActive() && readGeneration.current === generation)
        setReadBusy(false);
    }
  }
  function closeForm() {
    readGeneration.current++;
    setReadBusy(false);
    const current = formRef.current;
    const next =
      current && (controller.isReserved() || controller.conflict || current.stale)
        ? { ...current, open: false }
        : null;
    formRef.current = next;
    setForm(next);
  }
  const dirty = Boolean(
    form && (form.title !== form.savedTitle || form.content !== form.savedContent),
  );
  const validation = form ? inputError(form.title, form.content) : '';
  const reopen = () => {
    if (controller.isReserved()) return;
    readGeneration.current++;
    setForm(null);
    setDeleting(null);
    token.current = undefined;
    collection.current = undefined;
    setTokenValue(undefined);
    setReadCampaignChanged(false);
    setReadError('');
    controller.clearConflict();
    setEpoch((n) => n + 1);
  };
  const listEnabled =
    !controller.pending &&
    !controller.blocked &&
    !controller.campaignChanged &&
    !readCampaignChanged;
  return (
    <Card className={styles.panel}>
      <div className={styles.actions}>
        <h2>Notas próprias da campanha</h2>
        <Button disabled={locked || readBusy || !tokenValue || Boolean(form)} onClick={openNew}>
          <Plus className="icon icon-sm" aria-hidden="true" />
          Nova nota
        </Button>
      </div>
      <p>
        Suas anotações particulares desta mesa, separadas do material capturado. Comece com um texto
        seu; nenhuma ficha ou passagem da aventura é copiada para cá.
      </p>
      {notice && <p role="status">{notice}</p>}
      {controller.error && <Alert variant="destructive">{controller.error}</Alert>}
      {readError && <Alert variant="destructive">{readError}</Alert>}
      {!controller.locksAvailable && (
        <Alert variant="warning">
          Este navegador não permite reservar alterações com segurança. A leitura permanece
          disponível; seus campos não serão apagados.
        </Alert>
      )}
      {controller.pending && (
        <Alert variant="warning">
          Há um pedido desta campanha aguardando confirmação. O pedido original foi preservado,
          inclusive após fechar ou recarregar.
          <Button disabled={controller.busy} onClick={() => void controller.recover()}>
            Confirmar pedido pendente
          </Button>
        </Alert>
      )}
      {controller.blocked && (
        <Alert variant="warning">
          O pedido preservado precisa ser recuperado neste navegador antes de qualquer nova
          alteração.
        </Alert>
      )}
      {controller.conflict && !controller.campaignChanged && !form && (
        <Alert variant="warning">
          A nota mudou antes de confirmar a exclusão. Nenhum novo pedido será enviado sem conferir a
          versão atual.
          <Button
            disabled={controller.isReserved() || readBusy}
            onClick={() => {
              const id = deleting?.id;
              setDeleting(null);
              if (id) void readNote(id, true);
              else {
                controller.clearConflict();
                setEpoch((n) => n + 1);
              }
            }}
          >
            Descartar exclusão e conferir notas atuais
          </Button>
        </Alert>
      )}
      {(readCampaignChanged || controller.campaignChanged) && (
        <Alert variant="warning">
          A identidade desta campanha mudou. O pedido antigo não será transferido para a campanha
          nova.
          <Button disabled={controller.isReserved()} onClick={reopen}>
            Descartar alterações e reabrir notas
          </Button>
        </Alert>
      )}
      {form && !form.open && (
        <Button
          variant="outline"
          onClick={() => setForm((current) => (current ? { ...current, open: true } : null))}
        >
          Rever alterações da nota
        </Button>
      )}
      {listEnabled ? (
        <NotesList
          key={epoch}
          uid={uid}
          campaignId={campaignId}
          initialToken={tokenValue}
          observe={observe}
          minimumRevision={() => collection.current}
          disabled={locked || readBusy || Boolean(form)}
          onEdit={(id) => void readNote(id)}
          onDelete={setDeleting}
          onReload={() => setEpoch((n) => n + 1)}
          onCampaignChanged={() => setReadCampaignChanged(true)}
        />
      ) : (
        <p>Confirme o pedido preservado para continuar com as notas desta campanha.</p>
      )}
      {readBusy && <LoadingState label="Carregando nota própria…" />}
      <Dialog
        open={Boolean(form?.open)}
        onClose={closeForm}
        title={form?.revision ? 'Editar nota própria' : 'Nova nota própria'}
        description="Texto simples e privado, escrito por você. O salvamento é manual."
        footer={
          <div className={styles.actions}>
            <Button variant="outline" disabled={controller.busy} onClick={closeForm}>
              {controller.pending ? 'Fechar e manter pedido' : 'Cancelar'}
            </Button>
            <Button
              disabled={
                !form ||
                locked ||
                readBusy ||
                form.stale ||
                !dirty ||
                Boolean(validation) ||
                !controller.locksAvailable
              }
              onClick={() => {
                if (!form || !token.current) return;
                const id = form.revision === 0 ? form.id : crypto.randomUUID();
                void controller.execute({
                  method: 'saveCampaignNote',
                  input: {
                    campaignId,
                    campaignToken: token.current,
                    noteId: form.id,
                    operationId: id,
                    expectedRevision: form.revision,
                    title: form.title,
                    content: form.content,
                  },
                });
              }}
            >
              Salvar nota
            </Button>
          </div>
        }
      >
        {form && (
          <div className={styles.form}>
            {!controller.locksAvailable && (
              <Alert variant="warning">
                Este navegador não permite reservar alterações com segurança. Seus campos foram
                mantidos e nenhuma alteração será enviada.
              </Alert>
            )}
            {controller.error && <Alert variant="destructive">{controller.error}</Alert>}
            {controller.pending && (
              <Alert variant="warning">
                O pedido preservado ainda não foi confirmado. Seus campos permanecem aqui.
                <Button disabled={controller.busy} onClick={() => void controller.recover()}>
                  Confirmar pedido pendente
                </Button>
              </Alert>
            )}
            {(controller.conflict || form.stale) &&
              !controller.campaignChanged &&
              !readCampaignChanged && (
                <Alert variant="warning">
                  Esta nota mudou desde a versão que você abriu. Seu texto foi preservado; descarte
                  explicitamente estas alterações para conferir a nota atual.
                  <Button
                    disabled={controller.isReserved() || readBusy}
                    onClick={() => void readNote(form.id, true)}
                  >
                    Descartar alterações e carregar nota atual
                  </Button>
                </Alert>
              )}
            {(controller.campaignChanged || readCampaignChanged) && (
              <Button disabled={controller.isReserved()} onClick={reopen}>
                Descartar alterações e reabrir notas
              </Button>
            )}
            <Input
              label="Título da nota"
              required
              value={form.title}
              maxLength={300}
              disabled={locked || readBusy || form.stale}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
            <Textarea
              label="Texto da nota"
              value={form.content}
              rows={12}
              disabled={locked || readBusy || form.stale}
              onChange={(event) => setForm({ ...form, content: event.target.value })}
            />
            <p className={styles.meta}>
              {form.content.length.toLocaleString('pt-BR')} de 150.000 caracteres. Texto vazio é
              permitido.
            </p>
            {validation && form.title && <Alert variant="warning">{validation}</Alert>}
          </div>
        )}
      </Dialog>
      <Dialog
        open={Boolean(deleting)}
        onClose={() => {
          if (!controller.busy) setDeleting(null);
        }}
        title="Excluir nota própria"
        description="Esta exclusão é permanente. Não há arquivo nem restauração de notas."
        footer={
          <div className={styles.actions}>
            <Button variant="outline" disabled={controller.busy} onClick={() => setDeleting(null)}>
              Cancelar exclusão
            </Button>
            <Button
              variant="destructive"
              disabled={locked || !deleting || !controller.locksAvailable}
              onClick={() => {
                if (deleting && token.current)
                  void controller.execute({
                    method: 'deleteCampaignNote',
                    input: {
                      campaignId,
                      campaignToken: token.current,
                      noteId: deleting.id,
                      operationId: crypto.randomUUID(),
                      expectedRevision: deleting.revision,
                    },
                  });
              }}
            >
              Confirmar exclusão
            </Button>
          </div>
        }
      >
        {deleting && <p className={styles.text}>Excluir “{deleting.title}”?</p>}
        {controller.error && <Alert variant="destructive">{controller.error}</Alert>}
        {controller.pending && (
          <Button disabled={controller.busy} onClick={() => void controller.recover()}>
            Confirmar pedido pendente
          </Button>
        )}
        {controller.conflict && (
          <Alert variant="warning">
            A nota mudou; feche esta confirmação e recarregue a lista antes de excluir.
          </Alert>
        )}
      </Dialog>
    </Card>
  );
}
interface ListProps {
  uid: string;
  campaignId: string;
  initialToken?: string;
  observe: (value: CampaignNotesEnvelope) => void;
  minimumRevision: () => number | undefined;
  disabled: boolean;
  onEdit: (id: string) => void;
  onDelete: (note: CampaignNoteSummary) => void;
  onReload: () => void;
  onCampaignChanged: () => void;
}
function NotesList({
  uid,
  campaignId,
  initialToken,
  observe,
  minimumRevision,
  disabled,
  onEdit,
  onDelete,
  onReload,
  onCampaignChanged,
}: ListProps) {
  const pulseScope = { actorId: uid, scope: 'campaign:' + campaignId },
    stamp = useRef(getInvalidationGeneration(pulseScope));
  const pulseActive = useCallback(
    () =>
      getInvalidationGeneration({ actorId: uid, scope: 'campaign:' + campaignId }) ===
      stamp.current,
    [uid, campaignId],
  );
  const [items, setItems] = useState<CampaignNoteSummary[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [stale, setStale] = useState(false),
    [initial] = useState(initialToken);
  const active = useRef(true),
    busy = useRef(false),
    pageToken = useRef(initial),
    revision = useRef<number | undefined>(undefined),
    seen = useRef(new Set<string>()),
    latest = useRef({ observe, minimumRevision, onCampaignChanged });
  useLayoutEffect(() => {
    latest.current = { observe, minimumRevision, onCampaignChanged };
  });
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const load = useCallback(
    async (next: string | null) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const value = await api.listCampaignNotes({
          campaignId,
          ...(pageToken.current ? { campaignToken: pageToken.current } : {}),
          cursor: next,
          limit: 25,
        });
        if (!active.current || !pulseActive()) return;
        api.validateNoteEnvelope(value, uid, campaignId, pageToken.current);
        if (revision.current !== undefined && revision.current !== value.collectionRevision)
          throw Object.assign(new Error('A lista mudou. Recarregue para continuar.'), {
            details: { reason: 'cursor-invalidated' },
          });
        const minimum = latest.current.minimumRevision();
        if (minimum !== undefined && value.collectionRevision < minimum)
          throw Object.assign(new Error('A lista mudou. Recarregue para continuar.'), {
            details: { reason: 'cursor-invalidated' },
          });
        if (
          !Array.isArray(value.items) ||
          value.items.length > 50 ||
          (value.nextCursor !== null &&
            (typeof value.nextCursor !== 'string' || seen.current.has(value.nextCursor)))
        )
          throw new Error('A página de notas não pôde ser confirmada.');
        value.items.forEach(api.validateNoteSummary);
        latest.current.observe(value);
        pageToken.current = value.campaignToken;
        revision.current = value.collectionRevision;
        if (value.nextCursor) seen.current.add(value.nextCursor);
        setItems((current) => [
          ...new Map([...current, ...value.items].map((item) => [item.id, item])).values(),
        ]);
        setCursor(value.nextCursor);
        setError('');
      } catch (cause) {
        if (!active.current || !pulseActive()) return;
        setError(api.notesMessage(cause));
        if (['cursor-invalidated', 'campaign-changed'].includes(api.noteErrorReason(cause) ?? '')) {
          setItems([]);
          setCursor(null);
          setStale(true);
          if (api.noteErrorReason(cause) === 'campaign-changed') latest.current.onCampaignChanged();
        }
      } finally {
        busy.current = false;
        if (active.current && pulseActive()) setLoading(false);
      }
    },
    [uid, campaignId, pulseActive],
  );
  useEffect(() => {
    queueMicrotask(() => {
      if (active.current) void load(null);
    });
  }, [load, initial]);
  return (
    <div>
      {loading && <LoadingState label="Carregando notas próprias…" />}
      {error && (
        <Alert variant="destructive">
          {error}
          <Button
            variant="outline"
            disabled={loading || disabled}
            onClick={() => {
              if (stale) onReload();
              else {
                setLoading(true);
                void load(cursor);
              }
            }}
          >
            {stale ? 'Recarregar lista' : 'Tentar novamente'}
          </Button>
        </Alert>
      )}
      <ul className={styles.list}>
        {items.map((note) => (
          <li key={note.id}>
            <div className={styles.actions}>
              <Button variant="outline" disabled={disabled} onClick={() => onEdit(note.id)}>
                {note.title}
              </Button>
              <Button
                variant="outline"
                disabled={disabled}
                onClick={() => onDelete(note)}
                aria-label={'Excluir nota ' + note.title}
              >
                <Trash2 className="icon icon-sm" aria-hidden="true" />
                Excluir nota
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {!loading && !error && !items.length && !cursor && (
        <p>Nenhuma nota própria nesta campanha.</p>
      )}
      {cursor && (
        <Button
          variant="secondary"
          disabled={loading || disabled}
          onClick={() => {
            setLoading(true);
            void load(cursor);
          }}
        >
          Carregar mais notas
        </Button>
      )}
    </div>
  );
}
