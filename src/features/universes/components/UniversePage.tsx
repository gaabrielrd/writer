import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router';
import { Globe, Plus } from 'lucide-react';
import { useAuth } from '@/features/auth';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  EmptyState,
  ErrorState,
  Input,
  LoadingState,
  PageHeader,
  Textarea,
} from '@/shared/ui';
import {
  createUniverse,
  deleteUniverse,
  listUniverses,
  updateUniverse,
} from '../services/universeService';
import type { Universe } from '../model/universe';
import styles from './UniversePage.module.css';

function UniverseForm({
  world,
  onClose,
  onSaved,
}: {
  world?: Universe;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(world?.name ?? '');
  const [description, setDescription] = useState(world?.description ?? '');
  const [creationId] = useState(() => crypto.randomUUID());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving || !name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const input = { name: name.trim(), description: description.trim() };
      if (world) await updateUniverse(world.id, input);
      else await createUniverse(input, creationId);
      onSaved();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog
      open
      title={world ? 'Editar universo' : 'Criar universo'}
      onClose={() => {
        if (!saving) onClose();
      }}
      footer={
        <>
          <Button type="button" variant="secondary" disabled={saving} onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="universe-form" disabled={saving || !name.trim()}>
            {saving ? 'Salvando...' : 'Salvar universo'}
          </Button>
        </>
      }
    >
      <form id="universe-form" className={styles.form} onSubmit={(event) => void submit(event)}>
        <Input
          label="Nome do universo"
          value={name}
          maxLength={200}
          required
          disabled={saving}
          onChange={(event) => setName(event.target.value)}
        />
        <Textarea
          label="Descrição do universo"
          value={description}
          maxLength={4000}
          rows={3}
          disabled={saving}
          onChange={(event) => setDescription(event.target.value)}
        />
        {error && <Alert variant="destructive">{error}</Alert>}
      </form>
    </Dialog>
  );
}

export function UniversePage() {
  const { user, loading: authLoading } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const key = `${user?.uid ?? ''}:${attempt}`;
  const [result, setResult] = useState<{ key: string; worlds: Universe[]; error?: string }>();
  const [form, setForm] = useState<{ key: string; world?: Universe }>();
  const [removing, setRemoving] = useState<{ key: string; world: Universe }>();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  useEffect(() => {
    let active = true;
    if (!user) return;
    void listUniverses(user.uid)
      .then((worlds) => {
        if (active) setResult({ key, worlds });
      })
      .catch((cause: unknown) => {
        if (active)
          setResult({
            key,
            worlds: [],
            error: cause instanceof Error ? cause.message : 'Falha ao carregar universos.',
          });
      });
    return () => {
      active = false;
    };
  }, [user, key]);
  if (authLoading) return <LoadingState label="Carregando sessão..." />;
  if (!user) return <Navigate to="/login" replace />;
  const refresh = () => setAttempt((n) => n + 1);
  async function remove() {
    if (!removing || busy) return;
    setBusy(true);
    setActionError('');
    try {
      await deleteUniverse(removing.world.id);
      setRemoving(undefined);
      refresh();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Não foi possível excluir.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.page}>
      <PageHeader
        title="Lore compartilhado"
        description="Organize universos e mantenha suas fichas em comum entre livros."
        actions={
          <Button onClick={() => setForm({ key })}>
            <Plus className="icon icon-sm" aria-hidden="true" />
            Novo universo
          </Button>
        }
      />
      {result?.key !== key ? (
        <LoadingState label="Carregando universos..." />
      ) : result.error ? (
        <ErrorState
          title="Não foi possível carregar os universos"
          description={result.error}
          action={
            <Button variant="secondary" onClick={refresh}>
              Tentar novamente
            </Button>
          }
        />
      ) : !result.worlds.length ? (
        <EmptyState
          title="Nenhum universo cadastrado"
          description="Crie um universo para compartilhar personagens, locais e conceitos entre seus livros."
          action={<Button onClick={() => setForm({ key })}>Criar primeiro universo</Button>}
        />
      ) : (
        <div className={styles.list}>
          {result.worlds.map((world) => (
            <article key={world.id} className={styles.row}>
              <div>
                <h2>
                  <Globe className="icon" aria-hidden="true" /> {world.name}
                </h2>
                <p>{world.description}</p>
                <Badge variant="secondary">
                  {world.bookCount}{' '}
                  {world.bookCount === 1 ? 'livro vinculado' : 'livros vinculados'}
                </Badge>
                {world.deleting && (
                  <p>A exclusão foi iniciada. Tente excluir novamente para concluir.</p>
                )}
              </div>
              <div className={styles.actions}>
                {!world.deleting && (
                  <>
                    <Link to={`/universes/${encodeURIComponent(world.id)}/lore`}>
                      <Button variant="secondary">Abrir lore</Button>
                    </Link>
                    <Button variant="ghost" onClick={() => setForm({ key, world })}>
                      Editar universo
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  onClick={() => {
                    setRemoving({ key, world });
                    setActionError('');
                  }}
                >
                  Excluir universo
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}
      {form?.key === key && (
        <UniverseForm world={form.world} onClose={() => setForm(undefined)} onSaved={refresh} />
      )}
      {removing?.key === key && (
        <Dialog
          open
          title={`Excluir universo ${removing.world.name}?`}
          onClose={() => {
            if (!busy) setRemoving(undefined);
          }}
          footer={
            <>
              <Button variant="secondary" disabled={busy} onClick={() => setRemoving(undefined)}>
                Cancelar
              </Button>
              <Button
                variant="danger"
                disabled={busy || removing.world.bookCount > 0}
                onClick={() => void remove()}
              >
                Confirmar exclusão
              </Button>
            </>
          }
        >
          <p>
            {removing.world.bookCount > 0
              ? 'Desvincule todos os livros nas configurações de cada obra antes de excluir este universo.'
              : 'Todas as entidades deste universo serão removidas. Esta ação não pode ser desfeita.'}
          </p>
          {removing.world.bookCount > 0 && <Link to="/">Abrir Meus Livros</Link>}
          {actionError && <Alert variant="destructive">{actionError}</Alert>}
        </Dialog>
      )}
    </div>
  );
}
