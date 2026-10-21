import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SessionScenePicker } from '../components/SessionScenePicker';
import { scene } from './sceneReferenceHelpers';
it('consultar a primeira página novamente conserva continuação válida e estágios traduzidos sem invalidar seleção', async () => {
  const load = vi.fn().mockResolvedValue({
      items: [
        { ...scene, stage: 'planned' },
        { ...scene, sourceKey: 'a'.repeat(64), title: 'Cena em escrita', stage: 'writing' },
        { ...scene, sourceKey: 'b'.repeat(64), title: 'Cena livre', stage: 'Inverno distante' },
      ],
      nextCursor: 'stable-second',
    }),
    invalidated = vi.fn();
  render(
    <SessionScenePicker
      active={() => true}
      disabled={false}
      load={load}
      onSelect={vi.fn()}
      onClose={vi.fn()}
      onError={invalidated}
    />,
  );
  await screen.findByRole('button', { name: 'Vincular cena Portão do inverno' });
  await userEvent.click(screen.getByRole('button', { name: 'Consultar cenas disponíveis' }));
  expect(
    await screen.findByRole('button', { name: 'Vincular cena Portão do inverno' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Carregar mais cenas' })).toBeEnabled();
  expect(invalidated).not.toHaveBeenCalled();
  expect(load).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Estágio: Planejada')).toBeInTheDocument();
  expect(screen.getByText('Estágio: Em escrita')).toBeInTheDocument();
  expect(screen.getByText('Estágio: Inverno distante')).toBeInTheDocument();
});
