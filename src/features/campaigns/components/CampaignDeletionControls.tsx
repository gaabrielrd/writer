import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth';
import {
  CampaignDeletionDialog,
  CampaignDeletionPreparations as DeletionPreparations,
  validateLookup,
  type DeletionLookup,
  type DeletionProgress,
} from '@/features/campaign-deletions';
import { Alert, Button, Dialog, LoadingState } from '@/shared/ui';
import {
  collectCampaignRecoveryClosures,
  type CampaignRecoveryClosure,
} from '../services/campaignRecoveryClosure';
interface Props {
  campaignId: string;
  onRevoked?: (progress: DeletionProgress) => void;
  renderTrigger?: (open: () => void) => ReactNode;
}
export function CampaignDeletionControls(props: Props) {
  const { user } = useAuth();
  return user ? (
    <ControlsSession key={user.uid + ':' + props.campaignId} uid={user.uid} {...props} />
  ) : null;
}
function ControlsSession({ uid, campaignId, onRevoked, renderTrigger }: Props & { uid: string }) {
  const [open, setOpen] = useState(false),
    recovery = useClosures(uid);
  return (
    <>
      {renderTrigger ? (
        renderTrigger(() => setOpen(true))
      ) : (
        <Button variant="destructive" onClick={() => setOpen(true)}>
          Excluir campanha
        </Button>
      )}
      <CampaignDeletionDialog
        campaignId={campaignId}
        open={open}
        onClose={() => setOpen(false)}
        onRevoked={onRevoked}
        onReviewRecovery={recovery.review}
      />
      {recovery.dialog}
    </>
  );
}
export function CampaignDeletionPreparations() {
  const { user } = useAuth();
  return user ? <PreparationSession key={user.uid} uid={user.uid} /> : null;
}
function PreparationSession({ uid }: { uid: string }) {
  const recovery = useClosures(uid);
  return (
    <>
      <DeletionPreparations onReviewRecovery={recovery.review} />
      {recovery.dialog}
    </>
  );
}
function useClosures(uid: string) {
  const { user } = useAuth(),
    actor = useRef(user?.uid),
    alive = useRef(true),
    generation = useRef(0),
    reserved = useRef(false),
    [proof, setProof] = useState<DeletionLookup | null>(null),
    [items, setItems] = useState<CampaignRecoveryClosure[]>([]),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  // eslint-disable-next-line react-hooks/refs
  actor.current = user?.uid;
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function check(own: number) {
    if (!alive.current || actor.current !== uid || generation.current !== own)
      throw new Error('A sessão desta confirmação foi encerrada. Os controles foram preservados.');
  }
  function review(value: DeletionLookup) {
    const snapshot = structuredClone(value);
    validateLookup(snapshot, uid, snapshot.lookup);
    if (!snapshot.deletion || !('campaignId' in snapshot.lookup))
      throw new Error('A exclusão precisa ser comprovada.');
    const own = ++generation.current;
    setProof(snapshot);
    setItems([]);
    setLoading(true);
    setError('');
    setNotice('');
    void collectCampaignRecoveryClosures(uid, snapshot, () => check(own))
      .then((result) => {
        check(own);
        setItems(result.items);
        if (result.unreadable)
          setError(
            'Alguns controles não puderam ser lidos e serão preservados. Os demais podem ser encerrados.',
          );
      })
      .catch((cause: unknown) => {
        if (alive.current && actor.current === uid && generation.current === own)
          setError(
            cause instanceof Error ? cause.message : 'Não foi possível conferir os controles.',
          );
      })
      .finally(() => {
        if (alive.current && actor.current === uid && generation.current === own) setLoading(false);
      });
  }
  function close() {
    generation.current++;
    setProof(null);
    setItems([]);
    setLoading(false);
  }
  async function forget() {
    if (reserved.current || !proof) return;
    reserved.current = true;
    const own = generation.current,
      snapshots = [...items];
    setBusy(true);
    setNotice('');
    let closed = 0;
    const failed: CampaignRecoveryClosure[] = [];
    try {
      check(own);
      validateLookup(proof, uid, proof.lookup);
      if (!proof.deletion) throw new Error('A exclusão não foi comprovada.');
      for (const entry of snapshots) {
        check(own);
        try {
          await entry.close();
          check(own);
          closed++;
        } catch {
          check(own);
          failed.push(entry);
        }
      }
      check(own);
      setItems(failed);
      setNotice(closed + ' controle(s) local(is) encerrado(s).');
      if (failed.length)
        setError(
          'Controles alterados ou indisponíveis foram preservados. Consulte novamente antes de outra confirmação.',
        );
    } catch (cause) {
      if (alive.current && actor.current === uid && generation.current === own)
        setError(cause instanceof Error ? cause.message : 'Os controles foram preservados.');
    } finally {
      reserved.current = false;
      if (alive.current && actor.current === uid) setBusy(false);
    }
  }
  return {
    review,
    dialog: (
      <Dialog
        open={proof !== null}
        onClose={close}
        title="Encerrar controles da campanha excluída?"
        description="Esta escolha apaga os pedidos e rascunhos preservados neste navegador. Não recupera texto nem afirma se cada pedido chegou a ser aplicado."
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              Manter controles
            </Button>
            <Button
              variant="destructive"
              disabled={loading || busy || !items.length}
              onClick={() => void forget()}
            >
              Confirmar encerramento dos controles
            </Button>
          </>
        }
      >
        {loading && <LoadingState label="Conferindo controles deste navegador..." />}
        {error && <Alert variant="warning">{error}</Alert>}
        {notice && <p role="status">{notice}</p>}
        {!loading && !items.length && !notice && (
          <p>Nenhum controle local disponível para encerramento.</p>
        )}
        <ul>
          {items.map((entry) => (
            <li key={entry.key}>{entry.label}</li>
          ))}
        </ul>
      </Dialog>
    ),
  };
}
