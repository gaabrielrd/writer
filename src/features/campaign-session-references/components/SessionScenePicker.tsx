import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Badge, Button, Dialog, Dropdown, LoadingState } from '@/shared/ui';
import type { SessionSceneArchive, SessionSceneCandidate } from '../model/sessionSceneReference';
import { validateSceneCandidate } from '../services/sessionReferenceService';
import styles from './References.module.css';
const stageLabels = {
  planned: 'Planejada',
  draft: 'Rascunho',
  writing: 'Em escrita',
  review: 'Em revisão',
  done: 'Concluída',
};
interface Props {
  active: () => boolean;
  disabled: boolean;
  load: (
    archive: SessionSceneArchive,
    cursor?: string,
  ) => Promise<{ items: SessionSceneCandidate[]; nextCursor: string | null }>;
  onSelect: (key: string) => void;
  onClose: () => void;
  onError: (cause: unknown) => void;
}
export function SessionScenePicker(props: Props) {
  const [archive, setArchive] = useState<SessionSceneArchive>('active'),
    [items, setItems] = useState<SessionSceneCandidate[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const alive = useRef(true),
    owner = useRef(0),
    latest = useRef(props),
    seen = useRef(new Set<string>());
  useLayoutEffect(() => {
    latest.current = props;
  });
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const active = () => alive.current && latest.current.active();
  async function load(next?: string) {
    const own = ++owner.current;
    setLoading(true);
    try {
      const page = await latest.current.load(archive, next);
      if (!active() || own !== owner.current) return;
      page.items.forEach(validateSceneCandidate);
      if (next && page.nextCursor && seen.current.has(page.nextCursor))
        throw new Error('A página de cenas mudou. Consulte novamente.');
      if (!next) seen.current.clear();
      if (page.nextCursor) seen.current.add(page.nextCursor);
      setItems((old) =>
        next
          ? [...old, ...page.items.filter((i) => !old.some((p) => p.sourceKey === i.sourceKey))]
          : page.items,
      );
      setCursor(page.nextCursor);
      setError('');
    } catch (cause) {
      if (active() && own === owner.current) {
        setItems([]);
        setCursor(null);
        setError(cause instanceof Error ? cause.message : 'Não foi possível consultar cenas.');
        latest.current.onError(cause);
      }
    } finally {
      if (active() && own === owner.current) setLoading(false);
    }
  }
  useEffect(() => {
    let current = true;
    queueMicrotask(() => {
      if (current) void load();
    });
    return () => {
      current = false;
    };
  }, [archive]); // eslint-disable-line react-hooks/exhaustive-deps
  function close() {
    owner.current++;
    props.onClose();
  }
  return (
    <Dialog
      open
      onClose={close}
      title="Vincular cena à sessão"
      description="Escolha uma cena da base ativa. O planejamento e os blocos permanecem separados do seu texto."
      footer={
        <Button variant="outline" onClick={close}>
          Fechar seleção de cena
        </Button>
      }
    >
      <div className={styles.stack}>
        <Dropdown
          mode="select"
          label="Cenas disponíveis"
          value={archive}
          options={[
            { value: 'active', label: 'Ativas' },
            { value: 'archived', label: 'Arquivo' },
            { value: 'all', label: 'Todas' },
          ]}
          onValueChange={(value) => {
            if (value === archive) return;
            owner.current++;
            setItems([]);
            setCursor(null);
            seen.current.clear();
            setError('');
            setArchive(value as SessionSceneArchive);
          }}
        />
        <Button variant="outline" onClick={() => void load()}>
          Consultar cenas disponíveis
        </Button>
        {loading && <LoadingState label="Consultando cenas disponíveis..." />}
        {error && <Alert variant="warning">{error}</Alert>}
        {!loading && !items.length && !error && (
          <p>
            {cursor
              ? 'Esta janela está vazia; há mais cenas para consultar.'
              : 'Nenhuma cena disponível nesta consulta.'}
          </p>
        )}
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.sourceKey}>
              <p>
                {item.title} {item.archived && <Badge variant="outline">Arquivo da cena</Badge>}
              </p>
              <p>
                {item.stage === null
                  ? 'Estágio não capturado'
                  : `Estágio: ${Object.hasOwn(stageLabels, item.stage) ? stageLabels[item.stage as keyof typeof stageLabels] : item.stage}`}
              </p>
              <Button
                variant="outline"
                disabled={props.disabled}
                aria-label={'Vincular cena ' + item.title}
                onClick={() => props.onSelect(item.sourceKey)}
              >
                Vincular cena
              </Button>
            </li>
          ))}
        </ul>
        {cursor && (
          <Button disabled={loading} variant="outline" onClick={() => void load(cursor)}>
            Carregar mais cenas
          </Button>
        )}
      </div>
    </Dialog>
  );
}
