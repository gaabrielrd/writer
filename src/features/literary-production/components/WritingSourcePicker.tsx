import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Dropdown } from '@/shared/ui';
import { listLiteraryPlans } from '../services/literaryPlanningService';
import type { LiteraryPlanPage } from '../model/planning';
import styles from './EditorialContractPanel.module.css';
export function WritingSourcePicker({
  bookId,
  value,
  onChange,
  disabled = false,
}: {
  bookId: string;
  value: string[] | undefined;
  onChange: (ids: string[] | undefined) => void;
  disabled?: boolean;
}) {
  const [page, setPage] = useState<LiteraryPlanPage | null>(null);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<string | null>(null);
  const epoch = useRef(0),
    working = useRef(false);
  useEffect(() => {
    epoch.current += 1;
    return () => {
      epoch.current += 1;
    };
  }, [bookId]);
  const load = async (afterId: string | null = null) => {
    if (working.current || disabled) return;
    const current = epoch.current;
    working.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await listLiteraryPlans(bookId, afterId);
      if (epoch.current === current)
        setPage((previous) => ({
          ...result,
          items: afterId ? [...(previous?.items ?? []), ...result.items] : result.items,
        }));
    } catch (cause) {
      if (epoch.current === current)
        setError(cause instanceof Error ? cause.message : 'Fontes indisponíveis.');
    } finally {
      if (epoch.current === current) {
        working.current = false;
        setBusy(false);
      }
    }
  };
  return (
    <details className={styles.decisionForm}>
      <summary>Planejamento usado pela IA</summary>
      <p>
        {value === undefined
          ? 'Automático: visão do livro e fichas vinculadas à unidade e ao ato.'
          : value.length
            ? 'As próximas chamadas usarão os planejamentos escolhidos.'
            : 'As próximas chamadas usarão o guia do livro, sem fichas adicionais.'}
      </p>
      {error && <Alert variant="destructive">{error}</Alert>}
      <Dropdown
        mode="select"
        label="Seleção de planejamento"
        value={value === undefined ? 'automatic' : 'explicit'}
        disabled={disabled || busy}
        options={[
          { value: 'automatic', label: 'Automática por unidade' },
          { value: 'explicit', label: 'Escolher fontes' },
        ]}
        onValueChange={(mode) => onChange(mode === 'automatic' ? undefined : [])}
      />
      {value !== undefined && (
        <>
          <Button variant="outline" disabled={disabled || busy} onClick={() => void load()}>
            Consultar planejamentos
          </Button>
          {page && (
            <Dropdown
              mode="select"
              label="Planejamento para o contexto"
              value={selected}
              disabled={disabled || busy}
              options={page.items.map((plan) => ({ value: plan.id, label: plan.title }))}
              onValueChange={setSelected}
            />
          )}
          <Button
            variant="outline"
            disabled={
              disabled || busy || !selected || value.includes(selected) || value.length >= 8
            }
            onClick={() => {
              onChange([...value, selected]);
              setSelected('');
            }}
          >
            Incluir no contexto
          </Button>
          <ul>
            {value.map((id) => (
              <li key={id}>
                {page?.items.find((plan) => plan.id === id)?.title ?? 'Planejamento selecionado'}
                <Button
                  variant="ghost"
                  disabled={disabled || busy}
                  onClick={() => onChange(value.filter((item) => item !== id))}
                >
                  Remover fonte
                </Button>
              </li>
            ))}
          </ul>
          {page?.nextAfterId && (
            <Button
              variant="outline"
              disabled={disabled || busy}
              onClick={() => void load(page.nextAfterId)}
            >
              Mais planejamentos
            </Button>
          )}
        </>
      )}
    </details>
  );
}
