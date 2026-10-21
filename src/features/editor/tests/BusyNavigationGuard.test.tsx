import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, Link, MemoryRouter, RouterProvider } from 'react-router';
import { expect, it } from 'vitest';
import { BusyNavigationGuard } from '../components/BusyNavigationGuard';

function Editor() {
  const [busy, setBusy] = useState(true);
  return (
    <>
      <BusyNavigationGuard busy={busy} />
      <h1>Editor</h1>
      <Link to="/">Home</Link>
      <button onClick={() => setBusy(false)}>Terminar aceite</button>
    </>
  );
}
it('impede navegacao enquanto incorpora sugestao e libera depois', async () => {
  const router = createMemoryRouter(
    [
      { path: '/editor', element: <Editor /> },
      { path: '/', element: <h1>Biblioteca</h1> },
    ],
    { initialEntries: ['/editor'] },
  );
  render(<RouterProvider router={router} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('link', { name: 'Home' }));
  expect(screen.getByRole('heading', { name: 'Editor' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Terminar aceite' }));
  await user.click(screen.getByRole('link', { name: 'Home' }));
  expect(await screen.findByRole('heading', { name: 'Biblioteca' })).toBeInTheDocument();
});
it('protege fechamento de aba mesmo fora do data router e remove listener', () => {
  const { rerender } = render(
    <MemoryRouter>
      <BusyNavigationGuard busy />
    </MemoryRouter>,
  );
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  rerender(
    <MemoryRouter>
      <BusyNavigationGuard busy={false} />
    </MemoryRouter>,
  );
  const after = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(after);
  expect(after.defaultPrevented).toBe(false);
});

it('avisa sobre pergunta volátil e só sai após descarte explícito', async () => {
  const router = createMemoryRouter(
    [
      {
        path: '/editor',
        element: (
          <>
            <BusyNavigationGuard
              busy={false}
              unsavedMessage="A pergunta está só na memória e será descartada."
              discardLabel="Sair e descartar pergunta"
            />
            <Link to="/">Home</Link>
          </>
        ),
      },
      { path: '/', element: <h1>Biblioteca</h1> },
    ],
    { initialEntries: ['/editor'] },
  );
  render(<RouterProvider router={router} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole('link', { name: 'Home' }));
  expect(screen.getByRole('dialog', { name: 'Texto ainda não confirmado' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Continuar escrevendo' }));
  expect(screen.queryByRole('heading', { name: 'Biblioteca' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('link', { name: 'Home' }));
  await user.click(screen.getByRole('button', { name: 'Sair e descartar pergunta' }));
  expect(await screen.findByRole('heading', { name: 'Biblioteca' })).toBeInTheDocument();
});
it('falha de armazenamento bloqueia descarte enquanto preserva o texto', async () => {
  const router = createMemoryRouter(
    [
      {
        path: '/editor',
        element: (
          <>
            <BusyNavigationGuard
              busy={false}
              unsavedMessage="Rascunho não confirmado."
              allowDiscard={false}
            />
            <Link to="/">Home</Link>
          </>
        ),
      },
      { path: '/', element: <h1>Biblioteca</h1> },
    ],
    { initialEntries: ['/editor'] },
  );
  render(<RouterProvider router={router} />);
  await userEvent.setup().click(screen.getByRole('link', { name: 'Home' }));
  expect(screen.getByRole('button', { name: 'Sair sem guardar' })).toBeDisabled();
});
