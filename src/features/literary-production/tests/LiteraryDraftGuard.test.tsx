import { useEffect, useState } from 'react';
import { expect, it } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, RouterProvider, MemoryRouter } from 'react-router';
import { LiteraryDraftGuard } from '../components/LiteraryDraftGuard';
function Work({
  pending = false,
  confirmation,
}: {
  pending?: boolean;
  confirmation?: Promise<void>;
}) {
  const [value, setValue] = useState('Rascunho privado'),
    [saving, setSaving] = useState(pending),
    [dirty, setDirty] = useState(true);
  useEffect(() => {
    let active = true;
    void confirmation?.then(() => {
      if (active) {
        setDirty(false);
        setSaving(false);
      }
    });
    return () => {
      active = false;
    };
  }, [confirmation]);
  return (
    <>
      <LiteraryDraftGuard dirty={dirty} pending={saving} />
      <label>
        Texto editorial
        <input value={value} onChange={(event) => setValue(event.target.value)} />
      </label>
      <Link to="/other">Outra área</Link>
    </>
  );
}
const mount = (props: { pending?: boolean; confirmation?: Promise<void> } = {}) => {
  const router = createMemoryRouter(
    [
      { path: '/work', element: <Work {...props} /> },
      { path: '/other', element: <h1>Outro destino</h1> },
    ],
    { initialEntries: ['/work'] },
  );
  render(<RouterProvider router={router} />);
  return router;
};
it('Escape cancels navigation and preserves the draft; leaving discards it only after an explicit choice', async () => {
  const router = mount();
  fireEvent.change(screen.getByLabelText('Texto editorial'), {
    target: { value: 'Meu texto ainda não salvo' },
  });
  await userEvent.click(screen.getByRole('link', { name: 'Outra área' }));
  await screen.findByRole('dialog', { name: 'Descartar alterações editoriais?' });
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(router.state.location.pathname).toBe('/work');
  expect(screen.getByLabelText('Texto editorial')).toHaveValue('Meu texto ainda não salvo');
  await userEvent.click(screen.getByRole('link', { name: 'Outra área' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Continuar nesta área' }));
  expect(router.state.location.pathname).toBe('/work');
  await userEvent.click(screen.getByRole('link', { name: 'Outra área' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Descartar e sair' }));
  await screen.findByRole('heading', { name: 'Outro destino' });
  expect(router.state.location.pathname).toBe('/other');
});
it('a pending save cannot be discarded, and the originally blocked navigation proceeds only after confirmation', async () => {
  let confirm!: () => void;
  const confirmation = new Promise<void>((resolve) => {
    confirm = resolve;
  });
  const router = mount({ pending: true, confirmation });
  await userEvent.click(screen.getByRole('link', { name: 'Outra área' }));
  await screen.findByRole('dialog', { name: 'Salvamento a confirmar' });
  expect(screen.queryByRole('button', { name: 'Descartar e sair' })).not.toBeInTheDocument();
  const unload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(unload);
  expect(unload.defaultPrevented).toBe(true);
  expect(router.state.location.pathname).toBe('/work');
  await act(async () => {
    confirm();
    await confirmation;
  });
  await screen.findByRole('heading', { name: 'Outro destino' });
  expect(router.state.location.pathname).toBe('/other');
  const after = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(after);
  expect(after.defaultPrevented).toBe(false);
});
it('reload protection also works without a data router and is removed when there is no remaining work', () => {
  const { rerender, unmount } = render(
    <MemoryRouter>
      <LiteraryDraftGuard dirty pending={false} />
    </MemoryRouter>,
  );
  const first = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(first);
  expect(first.defaultPrevented).toBe(true);
  rerender(
    <MemoryRouter>
      <LiteraryDraftGuard dirty={false} pending={false} />
    </MemoryRouter>,
  );
  const clean = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(clean);
  expect(clean.defaultPrevented).toBe(false);
  rerender(
    <MemoryRouter>
      <LiteraryDraftGuard dirty={false} pending />
    </MemoryRouter>,
  );
  const pending = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(pending);
  expect(pending.defaultPrevented).toBe(true);
  unmount();
  const after = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(after);
  expect(after.defaultPrevented).toBe(false);
});
