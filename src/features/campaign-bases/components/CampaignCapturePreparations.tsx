import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@/features/auth';
import { Alert, Button, Card, LoadingState } from '@/shared/ui';
import type { CampaignCaptureProgress } from '../model/campaignBase';
import { listPendingCampaignCaptureControls } from '../services/campaignCaptureRecovery';
import * as api from '../services/campaignBaseService';
import { CampaignCaptureDialog } from './CampaignCaptureDialog';
import styles from './CampaignBases.module.css';
export interface CampaignCapturePreparationsProps {
  adventureId?: string;
  onActivated?: (campaignId: string) => void;
}
export function CampaignCapturePreparations(props: CampaignCapturePreparationsProps) {
  const { user } = useAuth();
  return user ? (
    <Preparations
      key={JSON.stringify([user.uid, props.adventureId])}
      ownerId={user.uid}
      {...props}
    />
  ) : null;
}
function Preparations({
  adventureId,
  onActivated,
  ownerId,
}: CampaignCapturePreparationsProps & { ownerId: string }) {
  const navigate = useNavigate(),
    [items, setItems] = useState<CampaignCaptureProgress[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0),
    [selected, setSelected] = useState<{ adventureId: string; captureId?: string } | null>(null),
    [open, setOpen] = useState(false);
  const [local, setLocal] = useState(() =>
    listPendingCampaignCaptureControls(ownerId, adventureId),
  );
  const active = useRef(true),
    busy = useRef(false),
    seen = useRef(new Set<string>());
  useLayoutEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const load = useCallback(
    async (more: boolean, next: string | null = null) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const page = await api.listCampaignCaptures({
          ...(adventureId ? { adventureId } : {}),
          cursor: next,
          limit: 25,
        });
        if (!active.current) return;
        api.assertCampaignResponseBudget(page);
        const values = page.items.map((item) => api.validateCampaignCapture(item));
        if (values.some((item) => adventureId && item.request.adventureId !== adventureId))
          throw new Error('A preparação não pertence a esta aventura.');
        if (!more) seen.current.clear();
        if (
          page.nextCursor !== null &&
          (typeof page.nextCursor !== 'string' || seen.current.has(page.nextCursor))
        )
          throw new Error('Não foi possível continuar a lista de preparações.');
        if (page.nextCursor) seen.current.add(page.nextCursor);
        setItems((current) => [
          ...new Map(
            [...(more ? current : []), ...values].map((item) => [item.captureId, item]),
          ).values(),
        ]);
        setCursor(page.nextCursor);
        setError('');
      } catch (cause) {
        if (active.current) setError(api.captureErrorMessage(cause));
      } finally {
        busy.current = false;
        if (active.current) setLoading(false);
      }
    },
    [adventureId],
  );
  useEffect(() => {
    queueMicrotask(() => {
      if (active.current) void load(false);
    });
  }, [attempt, load]);
  if (!items.length && !loading && !error && !cursor && !local.items.length && !local.unreadable)
    return null;
  return (
    <Card className={styles.stack + ' ' + styles.preparations}>
      <h2>Campanhas em preparação</h2>
      <p>
        Preparações privadas. Retome ou cancele para concluir a limpeza, mesmo quando a aventura não
        estiver mais disponível.
      </p>
      {loading && <LoadingState label="Carregando preparações…" />}
      {local.unreadable && (
        <Alert variant="warning">
          Um pedido local não pôde ser lido. Ele permanece preservado; nenhum pedido substituto será
          enviado para esse alvo.
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          {error}
          <Button
            disabled={loading}
            onClick={() => {
              setLoading(true);
              void load(items.length > 0, cursor);
            }}
          >
            Tentar novamente
          </Button>
        </Alert>
      )}
      <ul className={styles.items}>
        {items.map((item) => (
          <li key={item.captureId}>
            <Button
              variant="outline"
              onClick={() => {
                const startPending = listPendingCampaignCaptureControls(
                  ownerId,
                  adventureId,
                ).items.some(
                  (control) =>
                    control.scope.kind === 'start' && control.captureId === item.captureId,
                );
                setSelected({
                  adventureId: item.request.adventureId,
                  ...(!startPending ? { captureId: item.captureId } : {}),
                });
                setOpen(true);
              }}
            >
              {item.request.title} ·{' '}
              {item.state === 'aborted'
                ? 'Interrompida'
                : item.state === 'deleting'
                  ? 'Limpeza pendente'
                  : item.state === 'prepared'
                    ? 'Pronta para ativar'
                    : 'Em preparação'}
            </Button>
          </li>
        ))}
      </ul>
      {local.items
        .filter((control) => !items.some((item) => item.captureId === control.captureId))
        .map((control, index) => (
          <Button
            key={JSON.stringify(control.scope)}
            variant="outline"
            onClick={() => {
              setSelected({
                adventureId: control.adventureId,
                ...(control.scope.kind === 'capture' ? { captureId: control.scope.captureId } : {}),
              });
              setOpen(true);
            }}
          >
            Confirmar pedido pendente {index + 1}
          </Button>
        ))}
      {cursor && (
        <Button
          variant="secondary"
          disabled={loading}
          onClick={() => {
            setLoading(true);
            void load(true, cursor);
          }}
        >
          Carregar mais preparações
        </Button>
      )}
      {selected && (
        <CampaignCaptureDialog
          open={open}
          onClose={() => {
            setOpen(false);
            setLocal(listPendingCampaignCaptureControls(ownerId, adventureId));
            setLoading(true);
            setAttempt((n) => n + 1);
          }}
          adventureId={selected.adventureId}
          initialCaptureId={selected.captureId}
          onActivated={(id) => {
            setOpen(false);
            if (onActivated) onActivated(id);
            else void navigate('/campaigns/' + encodeURIComponent(id));
          }}
        />
      )}
    </Card>
  );
}
