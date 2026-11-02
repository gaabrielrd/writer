import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Dialog, LoadingState } from '@/shared/ui';
import type { CampaignLorePickerItem, CampaignLorePickerPage } from '../model/campaignLoreDisplay';
import { validateCampaignLorePickerItem } from '../services/campaignLoreDisplay';
import styles from './CampaignLore.module.css';
export interface CampaignLorePickerProps {
  open: boolean;
  identity: string;
  projectionToken: string;
  disabled?: boolean;
  isActive: () => boolean;
  loadPage: (cursor?: string) => Promise<CampaignLorePickerPage>;
  onSelect: (sourceKey: string) => void;
  onClose: () => void;
  onInvalidated: (cause: unknown) => void;
}
export function CampaignLorePicker(props: CampaignLorePickerProps) {
  const identity = JSON.stringify([props.identity, props.projectionToken, props.open]),
    actor = useRef('');
  // eslint-disable-next-line react-hooks/refs
  actor.current = identity;
  return (
    <Picker
      key={identity}
      {...props}
      isActive={() => actor.current === identity && props.isActive()}
    />
  );
}
function Picker(props: CampaignLorePickerProps) {
  const [items, setItems] = useState<CampaignLorePickerItem[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const alive = useRef(true),
    owner = useRef(0),
    seen = useRef(new Set<string>()),
    latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const active = () => alive.current && latest.current.open && latest.current.isActive();
  async function load(next?: string) {
    const own = ++owner.current;
    setLoading(true);
    try {
      const page = await latest.current.loadPage(next);
      if (!active() || owner.current !== own) return;
      if (
        page.projectionToken !== latest.current.projectionToken ||
        !Array.isArray(page.items) ||
        page.items.length > 50 ||
        (page.nextCursor !== null &&
          (typeof page.nextCursor !== 'string' ||
            !page.nextCursor ||
            (next && seen.current.has(page.nextCursor))))
      )
        throw new Error('As fichas disponíveis mudaram. Consulte os vínculos novamente.');
      page.items.forEach(validateCampaignLorePickerItem);
      if (!next) seen.current.clear();
      if (page.nextCursor) seen.current.add(page.nextCursor);
      setItems((old) =>
        next
          ? [
              ...old,
              ...page.items.filter(
                (item) => !old.some((previous) => previous.sourceKey === item.sourceKey),
              ),
            ]
          : page.items,
      );
      setCursor(page.nextCursor);
      setError('');
    } catch (cause) {
      if (active() && owner.current === own) {
        setItems([]);
        setCursor(null);
        setError(cause instanceof Error ? cause.message : 'Não foi possível conferir as fichas.');
        latest.current.onInvalidated(cause);
      }
    } finally {
      if (active() && owner.current === own) setLoading(false);
    }
  }
  useEffect(() => {
    let current = true;
    queueMicrotask(() => {
      if (current && props.open) void load();
    });
    return () => {
      current = false;
    };
  }, [props.open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog
      open={props.open}
      onClose={() => {
        owner.current++;
        props.onClose();
      }}
      title="Vincular ficha à sessão"
      description="Escolha uma ficha atual autorizada do lore da mesa. O conteúdo não será copiado para a preparação."
      footer={
        <Button variant="outline" onClick={props.onClose}>
          Fechar seleção de ficha
        </Button>
      }
    >
      <div className={styles.form}>
        {loading && <LoadingState label="Consultando fichas disponíveis..." />}
        {error && <Alert variant="warning">{error}</Alert>}
        <Button variant="outline" onClick={() => void load()}>
          Consultar fichas disponíveis
        </Button>
        {!loading && !items.length && !error && (
          <p>
            {cursor
              ? 'Esta janela está vazia; há mais fichas para consultar.'
              : 'Nenhuma ficha disponível nesta consulta.'}
          </p>
        )}
        {items.map((item) => (
          <div className={styles.form} key={item.sourceKey}>
            <p>
              {item.name} {item.legacy && <Badge variant="outline">Legado da mesa</Badge>}
            </p>
            <Button
              disabled={props.disabled}
              variant="outline"
              onClick={() => props.onSelect(item.sourceKey)}
              aria-label={'Vincular ' + item.name}
            >
              Vincular ficha
            </Button>
          </div>
        ))}
        {cursor && (
          <Button disabled={loading} variant="outline" onClick={() => void load(cursor)}>
            Carregar mais fichas
          </Button>
        )}
      </div>
    </Dialog>
  );
}
