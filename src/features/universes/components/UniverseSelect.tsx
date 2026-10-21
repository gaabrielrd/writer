import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth';
import { Button, Dropdown, ErrorState, LoadingState } from '@/shared/ui';
import { listUniverses } from '../services/universeService';
import type { Universe } from '../model/universe';

export function UniverseSelect({
  value,
  onChange,
  disabled,
  alwaysShow = false,
  hint = 'O lore global fica disponível em todos os livros vinculados.',
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  alwaysShow?: boolean;
  hint?: string;
}) {
  const { user } = useAuth();
  const [attempt, setAttempt] = useState(0);
  const key = `${user?.uid ?? ''}:${attempt}`;
  const [result, setResult] = useState<{ key: string; universes: Universe[]; error?: string }>();
  useEffect(() => {
    let active = true;
    if (!user) return;
    void listUniverses(user.uid)
      .then((universes) => {
        if (active) setResult({ key, universes });
      })
      .catch((cause: unknown) => {
        if (active)
          setResult({
            key,
            universes: [],
            error: cause instanceof Error ? cause.message : 'Falha ao carregar universos.',
          });
      });
    return () => {
      active = false;
    };
  }, [user, key]);
  if (!user) return null;
  if (result?.key !== key) return <LoadingState label="Carregando universos..." />;
  if (result.error)
    return (
      <ErrorState
        title="Não foi possível carregar os universos"
        description={`${result.error} Você pode continuar sem alterar o universo.`}
        action={
          <Button type="button" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>
            Tentar novamente
          </Button>
        }
      />
    );
  const worlds = result.universes.filter((world) => !world.deleting);
  if (!worlds.length && !value && !alwaysShow) return null;
  return (
    <Dropdown
      mode="select"
      searchable
      label="Universo compartilhado"
      value={value ?? ''}
      disabled={disabled}
      onValueChange={(value) => onChange(value || null)}
      hint={hint}
      options={[
        { value: '', label: 'Sem universo' },
        ...worlds.map((world) => ({ value: world.id, label: world.name })),
        ...(value && !worlds.some((world) => world.id === value)
          ? [{ value, label: 'Universo indisponível — remova o vínculo' }]
          : []),
      ]}
    />
  );
}
