import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from '@/shared/ui';
import { CampaignLoreDisplay, CampaignLorePicker } from '../index';
import type { CampaignLorePickerPage } from '../model/campaignLoreDisplay';
const key = 'b'.repeat(64),
  token = 'c'.repeat(64);
const item = {
  sourceKey: key,
  name: 'Torre antiga',
  category: 'location' as const,
  revision: 0,
  mode: 'base' as const,
  legacy: false,
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
it('renderer puro conserva duas relações para o mesmo alvo e não entrega corpo em retirada', () => {
  const entity = {
    name: 'Lia',
    aliases: [],
    category: 'character' as const,
    summary: '',
    details: 'Texto da mesa',
    structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
    relations: [
      { targetKey: key, targetName: 'Torre', relationType: 'habita', description: 'Vive aqui' },
      {
        targetKey: key,
        targetName: 'Torre',
        relationType: 'protege',
        description: 'Guarda a porta',
      },
    ],
  };
  const view = render(
    <CampaignLoreDisplay
      item={{ sourceKey: 'a'.repeat(64), revision: 3, mode: 'override', legacy: true, entity }}
    />,
  );
  expect(screen.getByText('Outros nomes: Nenhum')).toBeInTheDocument();
  expect(screen.getByText('Torre · habita: Vive aqui')).toBeInTheDocument();
  expect(screen.getByText('Torre · protege: Guarda a porta')).toBeInTheDocument();
  view.rerender(
    <CampaignLoreDisplay
      item={{ sourceKey: 'a'.repeat(64), revision: 4, mode: 'removed', legacy: true, entity: null }}
    />,
  );
  expect(screen.queryByText('Texto da mesa')).not.toBeInTheDocument();
  expect(screen.getByText(/Ficha retirada/)).toBeInTheDocument();
  expect(screen.getByText('Legado da mesa')).toBeInTheDocument();
});
it('picker com loader injetado preserva foco, descarta página tardia ao fechar e permite consulta explícita após erro', async () => {
  const held = deferred<CampaignLorePickerPage>(),
    invalidated = vi.fn(),
    selected = vi.fn();
  const load = vi
    .fn<(cursor?: string) => Promise<CampaignLorePickerPage>>()
    .mockReturnValueOnce(held.promise)
    .mockRejectedValueOnce(new Error('Sem conexão'))
    .mockResolvedValue({ projectionToken: token, items: [item], nextCursor: null });
  function Host() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Escolher material</Button>
        <CampaignLorePicker
          open={open}
          identity="saved-session"
          projectionToken={token}
          isActive={() => true}
          loadPage={load}
          onSelect={selected}
          onClose={() => setOpen(false)}
          onInvalidated={invalidated}
        />
      </>
    );
  }
  render(<Host />);
  const opener = screen.getByRole('button', { name: 'Escolher material' });
  await userEvent.click(opener);
  await userEvent.click(screen.getByRole('button', { name: 'Fechar seleção de ficha' }));
  await waitFor(() => expect(opener).toHaveFocus());
  await act(async () => {
    held.resolve({ projectionToken: token, items: [item], nextCursor: null });
    await held.promise;
  });
  expect(screen.queryByText(item.name)).not.toBeInTheDocument();
  expect(selected).not.toHaveBeenCalled();
  await userEvent.click(opener);
  expect(await screen.findByText('Sem conexão')).toBeInTheDocument();
  expect(invalidated).toHaveBeenCalledOnce();
  await userEvent.click(screen.getByRole('button', { name: 'Consultar fichas disponíveis' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Vincular Torre antiga' }));
  expect(selected).toHaveBeenCalledExactlyOnceWith(key);
  await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));
  await waitFor(() => expect(opener).toHaveFocus());
});
it('nova projeção na página seguinte limpa opções já compostas antes de avisar; cursor não se mistura', async () => {
  const invalidated = vi.fn();
  const load = vi
    .fn<(cursor?: string) => Promise<CampaignLorePickerPage>>()
    .mockResolvedValueOnce({ projectionToken: token, items: [item], nextCursor: 'next' })
    .mockResolvedValueOnce({
      projectionToken: 'd'.repeat(64),
      items: [{ ...item, name: 'Nome novo' }],
      nextCursor: null,
    });
  render(
    <CampaignLorePicker
      open
      identity="scope"
      projectionToken={token}
      isActive={() => true}
      loadPage={load}
      onSelect={vi.fn()}
      onClose={vi.fn()}
      onInvalidated={invalidated}
    />,
  );
  await screen.findByText('Torre antiga');
  await userEvent.click(screen.getByRole('button', { name: 'Carregar mais fichas' }));
  expect(await screen.findByText(/fichas disponíveis mudaram/)).toBeInTheDocument();
  expect(screen.queryByText('Torre antiga')).not.toBeInTheDocument();
  expect(screen.queryByText('Nome novo')).not.toBeInTheDocument();
  expect(invalidated).toHaveBeenCalledOnce();
  expect(load).toHaveBeenLastCalledWith('next');
});
