import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Sun, Moon, BookOpen, UserRoundPen, Plus, MoreHorizontal, Check } from 'lucide-react';
import { useTheme, type Theme, type ThemeAppearance } from '@/shared/theme';
import {
  Button,
  Dropdown,
  Dialog,
  Alert,
  FloatingPanel,
  AnchoredPanel,
  LoadingState,
  ErrorState,
} from '@/shared/ui';
import {
  emptyCatalog,
  MAX_THEMES,
  newTheme,
  paletteIssues,
  type CustomTheme,
  type ThemeCatalog,
} from '../model/customTheme';
import { readThemePreference, saveThemePreference } from '../services/themePreferences';
import {
  subscribeThemes,
  saveCustomTheme,
  removeCustomTheme,
} from '../services/customThemeService';
import { ThemeEditor } from './ThemeEditor';
import styles from './themes.module.css';

const SelectorContext = createContext<ReactNode>(null);
export function CustomThemeSelector() {
  return useContext(SelectorContext);
}
export function CustomThemesProvider({
  uid,
  children,
}: {
  uid: string | null;
  children: ReactNode;
}) {
  return (
    <ThemeSession key={uid ?? 'anonymous'} uid={uid}>
      {children}
    </ThemeSession>
  );
}
function ThemeSession({ uid, children }: { uid: string | null; children: ReactNode }) {
  const {
    theme,
    resolvedTheme,
    customTheme,
    setTheme,
    requestTheme,
    registerThemeRequest,
    setCustomTheme,
    previewTheme,
  } = useTheme();
  const [catalog, setCatalog] = useState<ThemeCatalog>(emptyCatalog);
  const [loading, setLoading] = useState(!!uid),
    [error, setError] = useState('');
  const [retry, setRetry] = useState(0),
    [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<CustomTheme | null>(null),
    [initial, setInitial] = useState('');
  const [collapsed, setCollapsed] = useState(false),
    [comparing, setComparing] = useState(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const [confirmation, setConfirmation] = useState<'close' | 'switch' | null>(null);
  const [removing, setRemoving] = useState<CustomTheme | null>(null);
  const pending = useRef<(() => void) | null>(null);
  const [cached] = useState(() => (uid ? readThemePreference(uid) : null));
  const selection = useRef<CustomTheme | null>(cached);
  const previousCustom = useRef<ThemeAppearance | null>(null);
  const alive = useRef(true);
  const dirty = !!draft && JSON.stringify(draft) !== initial;
  const persist = useCallback(
    (value: CustomTheme | null) => {
      if (!uid) return;
      try {
        saveThemePreference(uid, value);
      } catch {
        setMessage('Tema aplicado. Não foi possível guardar a preferência neste dispositivo.');
      }
    },
    [uid, setMessage],
  );
  useEffect(() => {
    alive.current = true;
    if (selection.current) setCustomTheme(selection.current);
    return () => {
      alive.current = false;
      setCustomTheme(null);
      previewTheme(null);
    };
  }, [setCustomTheme, previewTheme]);
  useEffect(() => {
    if (!customTheme && previousCustom.current) {
      selection.current = null;
      persist(null);
    }
    previousCustom.current = customTheme;
  }, [customTheme, persist]);
  useEffect(() => {
    if (!uid) return;
    return subscribeThemes(
      uid,
      (next) => {
        setCatalog(next);
        setLoading(false);
        setError('');
        const active = selection.current;
        if (active) {
          const updated = next.themes.find((t) => t.id === active.id);
          if (updated) {
            selection.current = updated;
            setCustomTheme(updated);
            persist(updated);
          } else {
            selection.current = null;
            setTheme(active.base);
            persist(null);
            setMessage('O tema ativo foi removido. A base foi restaurada.');
          }
        }
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      },
    );
  }, [uid, retry, setCustomTheme, setTheme, persist]);
  useEffect(() => {
    previewTheme(draft && !comparing ? draft : null);
    return () => previewTheme(null);
  }, [draft, comparing, previewTheme]);
  useEffect(() => {
    if (!dirty) return;
    const leave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [dirty]);
  const closeList = useCallback(() => setOpen(false), []);
  const close = () => {
    setDraft(null);
    setConfirmation(null);
    setComparing(false);
    setCollapsed(false);
    previewTheme(null);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  const guard = (action: () => void) => {
    if (busy) return;
    if (dirty) {
      pending.current = action;
      setConfirmation('switch');
    } else {
      setDraft(null);
      previewTheme(null);
      action();
    }
  };
  useEffect(() => {
    registerThemeRequest((native) =>
      guard(() => {
        selection.current = null;
        setTheme(native);
        persist(null);
        setOpen(false);
        setMessage('');
      }),
    );
    return () => registerThemeRequest(null);
  });
  const applyNative = (native: Theme) => requestTheme(native);
  const apply = (item: CustomTheme) =>
    guard(() => {
      selection.current = item;
      setCustomTheme(item);
      persist(item);
      setOpen(false);
      setMessage('');
    });
  const edit = (item: CustomTheme) =>
    guard(() => {
      setDraft(structuredClone(item));
      setInitial(JSON.stringify(item));
      setCollapsed(false);
      setComparing(false);
      setOpen(false);
      setMessage('');
    });
  const save = async () => {
    if (!draft || !uid || busy) return;
    setBusy(true);
    setMessage('');
    try {
      const saved = await saveCustomTheme(uid, draft, draft.revision === 0 ? null : draft.revision);
      if (!alive.current) return;
      selection.current = saved;
      setCustomTheme(saved);
      persist(saved);
      close();
      setMessage('Tema salvo.');
      const after = pending.current;
      pending.current = null;
      after?.();
    } catch (err) {
      if (alive.current)
        setMessage(err instanceof Error ? err.message : 'Não foi possível salvar o tema.');
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const remove = async () => {
    if (!removing || !uid || busy) return;
    setBusy(true);
    try {
      await removeCustomTheme(uid, removing.id, removing.revision);
      if (!alive.current) return;
      if (selection.current?.id === removing.id) {
        selection.current = null;
        setTheme(removing.base);
        persist(null);
      }
      setRemoving(null);
      setMessage('Tema removido.');
      trigger.current?.focus();
    } catch (err) {
      if (alive.current)
        setMessage(err instanceof Error ? err.message : 'Não foi possível remover o tema.');
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const canSave = !!draft && !!draft.name.trim() && !paletteIssues(draft.palette).length && !busy;
  const selector = (
    <>
      <div role="group" aria-label="Tema visual" className={styles.selector}>
        {(
          [
            { id: 'light', label: 'Claro', Icon: Sun },
            { id: 'dark', label: 'Escuro', Icon: Moon },
            { id: 'sepia', label: 'Sépia', Icon: BookOpen },
          ] as const
        ).map(({ id, label, Icon }) => (
          <Button
            key={id}
            variant="ghost"
            size="icon"
            aria-label={'Tema ' + label}
            title={'Tema ' + label}
            aria-pressed={!customTheme && theme === id}
            onClick={() => applyNative(id)}
          >
            <Icon className="icon icon-sm" aria-hidden="true" />
          </Button>
        ))}
        <Button
          ref={trigger}
          variant="ghost"
          size="icon"
          aria-label="Temas personalizados"
          title={uid ? 'Temas personalizados' : 'Entre na sua conta para criar temas'}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-pressed={!!customTheme}
          disabled={!uid}
          onClick={() => setOpen((value) => !value)}
        >
          <UserRoundPen className="icon icon-sm" aria-hidden="true" />
        </Button>
      </div>
      {open && (
        <AnchoredPanel anchor={trigger} label="Temas personalizados" onClose={closeList}>
          <div className={styles.listTitle}>
            <span>Temas personalizados</span>
            <span>{catalog.themes.length}/5</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className={styles.createTheme}
            disabled={loading || !!error || catalog.themes.length >= MAX_THEMES}
            onClick={() => edit(newTheme(resolvedTheme === 'dark' ? 'dark' : 'light'))}
          >
            <Plus className="icon icon-sm" aria-hidden="true" />
            Criar novo
          </Button>
          {catalog.themes.length >= MAX_THEMES && (
            <p className={styles.description}>Limite de cinco temas. Remova um para criar outro.</p>
          )}
          {loading ? (
            <LoadingState label="Carregando temas…" className="p-3" />
          ) : error ? (
            <ErrorState
              title="Não foi possível carregar os temas"
              description={error}
              className="p-3 my-2"
              onRetry={() => {
                setLoading(true);
                setRetry((r) => r + 1);
              }}
            />
          ) : (
            catalog.themes.map((item) => (
              <div key={item.id} className={styles.listRow}>
                <Button
                  variant="ghost"
                  className={styles.themeName}
                  aria-label={'Aplicar tema ' + item.name}
                  aria-pressed={customTheme?.id === item.id}
                  onClick={() => apply(item)}
                >
                  <span
                    className={styles.swatch}
                    style={{ backgroundColor: item.palette.primary }}
                  />
                  <span>{item.name}</span>
                  {customTheme?.id === item.id && (
                    <Check className="icon icon-sm" aria-hidden="true" />
                  )}
                </Button>
                <Dropdown
                  mode="action"
                  label={'Opções do tema ' + item.name}
                  iconOnly
                  icon={<MoreHorizontal className="icon icon-sm" aria-hidden="true" />}
                  variant="ghost"
                  options={[
                    { value: 'edit', label: 'Editar', onSelect: () => edit(item) },
                    {
                      value: 'remove',
                      label: 'Remover',
                      variant: 'destructive',
                      onSelect: () =>
                        guard(() => {
                          setOpen(false);
                          setRemoving(item);
                        }),
                    },
                  ]}
                />
              </div>
            ))
          )}
        </AnchoredPanel>
      )}
    </>
  );
  return (
    <SelectorContext.Provider value={selector}>
      {children}
      {message && !draft && !removing && (
        <div className={styles.notice} role="status">
          {message}
          <Button variant="ghost" size="sm" onClick={() => setMessage('')}>
            Fechar aviso
          </Button>
        </div>
      )}
      {draft && (
        <FloatingPanel
          title={draft.revision ? 'Editar tema' : 'Criar tema'}
          base={draft.base}
          collapsed={collapsed}
          onCollapse={setCollapsed}
          dirty={dirty}
          onClose={() => {
            if (busy) return;
            if (dirty) setConfirmation('close');
            else close();
          }}
          footer={
            <>
              <Button variant="ghost" disabled={busy} onClick={close}>
                Cancelar
              </Button>
              <Button type="submit" form="custom-theme-editor" disabled={!canSave}>
                {busy ? 'Salvando…' : 'Salvar tema'}
              </Button>
            </>
          }
        >
          <fieldset disabled={busy} className={styles.editorFields}>
            <ThemeEditor
              draft={draft}
              onChange={(next) => {
                setDraft(next);
                setComparing(false);
              }}
              onSubmit={() => void save()}
              formId="custom-theme-editor"
              comparing={comparing}
              onCompare={() => setComparing((value) => !value)}
            />
          </fieldset>
          {message && <Alert variant="destructive">{message}</Alert>}
        </FloatingPanel>
      )}
      <Dialog
        open={!!confirmation}
        onClose={() => {
          setConfirmation(null);
          pending.current = null;
        }}
        title="Alterações no tema"
        description="Escolha o que fazer com os ajustes antes de continuar."
        footer={
          <>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setConfirmation(null);
                pending.current = null;
              }}
            >
              Continuar editando
            </Button>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => {
                const after = pending.current;
                pending.current = null;
                close();
                after?.();
              }}
            >
              Descartar
            </Button>
            <Button type="submit" form="custom-theme-editor" disabled={!canSave}>
              Salvar e continuar
            </Button>
          </>
        }
      >
        <p>Seus ajustes ainda não foram salvos.</p>
      </Dialog>
      <Dialog
        open={!!removing}
        onClose={() => {
          if (!busy) setRemoving(null);
        }}
        title="Remover tema"
        description={'Remover “' + (removing?.name ?? '') + '”?'}
        footer={
          <>
            <Button variant="ghost" disabled={busy} onClick={() => setRemoving(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={busy} onClick={() => void remove()}>
              {busy ? 'Removendo…' : 'Remover tema'}
            </Button>
          </>
        }
      >
        {removing?.id === customTheme?.id && (
          <p>
            O tema está ativo. A base {removing?.base === 'dark' ? 'escura' : 'clara'} será aplicada
            após a remoção.
          </p>
        )}
        {message && <Alert variant="destructive">{message}</Alert>}
      </Dialog>
    </SelectorContext.Provider>
  );
}
