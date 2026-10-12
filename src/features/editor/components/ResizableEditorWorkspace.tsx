import {
  useCallback,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Alert, Button, ResizeHandle } from '@/shared/ui';
import { DEFAULT_PANEL_PERCENT } from '../model/workspacePreferences';
import { workspaceGeometry } from '../model/workspaceGeometry';
import {
  readWorkspacePreferences,
  saveWorkspacePreferences,
  subscribeWorkspacePreferences,
} from '../services/workspacePreferencesStorage';
import styles from './ResizableEditorWorkspace.module.css';

export interface ResizableEditorWorkspaceProps {
  uid: string;
  panelOpen: boolean;
  panel: ReactNode;
  children: ReactNode;
}

export function ResizableEditorWorkspace({
  uid,
  panelOpen,
  panel,
  children,
}: ResizableEditorWorkspaceProps) {
  const container = useRef<HTMLElement>(null);
  const panelId = useId();
  const stored = useSyncExternalStore(
    useCallback((callback) => subscribeWorkspacePreferences(uid, callback), [uid]),
    useCallback(() => readWorkspacePreferences(uid).panelPercent, [uid]),
    () => DEFAULT_PANEL_PERCENT,
  );
  const [local, setLocal] = useState<{ uid: string; value: number; stored: number }>();
  const [storageError, setStorageError] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 0, viewport: 0 });
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => {
      const width = element.getBoundingClientRect().width;
      const viewport = window.innerWidth;
      setSize((previous) =>
        previous.width === width && previous.viewport === viewport ? previous : { width, viewport },
      );
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  const bounds = workspaceGeometry(size.width, size.viewport);
  const preferred = local?.uid === uid && local.stored === stored ? local.value : stored;
  const percent = Math.min(bounds.max, Math.max(bounds.min, preferred));
  const commit = (value: number) => {
    const saved = saveWorkspacePreferences(uid, { panelPercent: value });
    setStorageError(saved ? null : uid);
    if (saved) setLocal(undefined);
  };

  return (
    <section
      ref={container}
      className={styles.workspace}
      aria-label="Espaço de escrita"
      data-editor-workspace
      data-stacked={bounds.stacked}
    >
      <div className={styles.manuscript}>
        {storageError === uid && (
          <Alert variant="warning" title="Preferência de largura não salva">
            A largura continua aplicada nesta sessão. Não foi possível salvar neste navegador.
            <Button variant="secondary" size="sm" onClick={() => commit(percent)}>
              Tentar novamente
            </Button>
          </Alert>
        )}
        {children}
      </div>
      {panelOpen && !bounds.stacked && (
        <ResizeHandle
          label="Largura do painel lateral"
          controls={panelId}
          containerRef={container}
          value={percent}
          min={bounds.min}
          max={bounds.max}
          defaultValue={DEFAULT_PANEL_PERCENT}
          onValueChange={(value) => setLocal({ uid, value, stored })}
          onValueCommit={commit}
        />
      )}
      <div
        id={panelId}
        className={styles.panel}
        hidden={!panelOpen}
        style={bounds.stacked ? undefined : { width: `${(bounds.available * percent) / 100}px` }}
      >
        {panel}
      </div>
    </section>
  );
}
