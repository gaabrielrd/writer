import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { Alert, Button, Dropdown, LoadingState } from '@/shared/ui';
import type { SaveWorkPreferencesInput, WorkPreferences } from '../model/workProgress';
import { isWorkConflict } from '../model/workProgress';
import { getWorkPreferences, saveWorkPreferences } from '../services/workProgressService';
import { availableTimeZones, deviceTimeZone } from '../services/workTimeZone';
import { useWorkResource } from '../hooks/useWorkResource';
import { useWorkMutation } from '../hooks/useWorkMutation';
import styles from './WorkProgress.module.css';
export function WorkPreferencesPanel({ onTimeZone }: { onTimeZone?: (zone: string) => void }) {
  const { user } = useAuth();
  return user ? <PreferencesSession key={user.uid} uid={user.uid} onTimeZone={onTimeZone} /> : null;
}
function PreferencesSession({
  uid,
  onTimeZone,
}: {
  uid: string;
  onTimeZone?: (zone: string) => void;
}) {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const initialization = useRef<SaveWorkPreferencesInput | null>(null);
  const loaded = useWorkResource('preferences:' + uid, async () => {
    const prefs = await getWorkPreferences();
    if (!active.current || prefs.timeZone) return prefs;
    const input = initialization.current ?? {
      operationId: crypto.randomUUID(),
      expectedRevision: prefs.revision,
      timeZone: deviceTimeZone(),
    };
    initialization.current = input;
    try {
      return await saveWorkPreferences(input);
    } catch (cause) {
      if (active.current && isWorkConflict(cause)) return getWorkPreferences();
      throw cause;
    }
  });
  if (loaded.loading) return <LoadingState label="Carregando fuso horário…" />;
  if (loaded.error || !loaded.value)
    return (
      <Alert variant="warning">
        {loaded.error || 'Preferência indisponível.'}
        <Button variant="secondary" onClick={loaded.retry}>
          Tentar carregar fuso
        </Button>
      </Alert>
    );
  return <PreferencesForm initial={loaded.value} onTimeZone={onTimeZone} />;
}
function PreferencesForm({
  initial,
  onTimeZone,
}: {
  initial: WorkPreferences;
  onTimeZone?: (zone: string) => void;
}) {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const [current, setCurrent] = useState(initial);
  const [zone, setZone] = useState(() => initial.timeZone ?? deviceTimeZone());
  const [options] = useState(() =>
    availableTimeZones().map((value) => ({ value, label: value.replaceAll('_', ' ') })),
  );
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (current?.timeZone) onTimeZone?.(current.timeZone);
  }, [current, onTimeZone]);
  const save = useWorkMutation(saveWorkPreferences, (result) => {
    setCurrent(result);
    setZone(result.timeZone ?? zone);
    setNotice('Fuso horário salvo.');
  });
  const [comparisonError, setComparisonError] = useState('');
  const [comparing, setComparing] = useState(false);
  const feedback = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (save.error || comparisonError) feedback.current?.focus();
  }, [save.error, comparisonError]);
  async function compare() {
    if (comparing) return;
    setComparing(true);
    try {
      const fresh = await getWorkPreferences();
      if (active.current) {
        setCurrent(fresh);
        setComparisonError('');
        setNotice(
          'Fuso atual: ' +
            (fresh.timeZone ?? 'não definido') +
            '. Sua escolha foi preservada. Confira antes de salvar.',
        );
      }
    } catch {
      if (active.current)
        setComparisonError('Não foi possível atualizar a preferência. Tente novamente.');
    } finally {
      if (active.current) setComparing(false);
    }
  }
  return (
    <section className={styles.preferences} aria-label="Fuso horário">
      <Dropdown
        mode="select"
        label="Fuso horário"
        value={zone}
        options={options}
        disabled={save.locked || comparing}
        onValueChange={(value) => {
          setZone(value);
          setNotice('');
        }}
      />
      <p className={styles.hint}>
        Preferência da sua conta. A meta total não reinicia quando o dia ou o fuso muda.
      </p>
      <div ref={feedback} tabIndex={-1}>
        {save.error && <Alert variant="destructive">{save.error}</Alert>}
        {comparisonError && <Alert variant="warning">{comparisonError}</Alert>}
      </div>
      {notice && <p role="status">{notice}</p>}
      <div className={styles.actions}>
        {save.conflict && (
          <Button variant="secondary" disabled={comparing} onClick={() => void compare()}>
            Atualizar preferência
          </Button>
        )}
        <Button
          variant="secondary"
          disabled={save.busy || comparing || !current}
          onClick={() =>
            void save.run(() => ({
              operationId: crypto.randomUUID(),
              expectedRevision: current?.revision ?? 0,
              timeZone: zone,
            }))
          }
        >
          {save.busy
            ? 'Salvando fuso…'
            : save.uncertain
              ? 'Confirmar fuso novamente'
              : 'Salvar fuso'}
        </Button>
      </div>
    </section>
  );
}
