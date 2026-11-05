import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Link, MemoryRouter } from 'react-router';
import type { AssistedSession } from '@/features/ai-assistant';
import type { loadProjectConception, askPageAssistant } from '../services/pageAssistantService';
import { PageAssistant } from '../components/PageAssistant';
import { useState } from 'react';
const mocks = vi.hoisted(() => ({
  uid: 'owner',
  load: vi.fn<typeof loadProjectConception>(),
  ask: vi.fn<typeof askPageAssistant>(),
  inspect: vi.fn(),
}));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { uid: mocks.uid } }) }));
vi.mock('../services/pageAssistantService', () => ({
  loadProjectConception: mocks.load,
  askPageAssistant: mocks.ask,
  inspectPageAssistantContext: mocks.inspect,
}));
function tree() {
  return (
    <MemoryRouter
      initialEntries={[{ pathname: '/books/project-id', state: { conception: 'project-id' } }]}
    >
      <main id="main-content">
        <Link to="/books/project-id/editor/chapter-id">Abrir editor</Link>
      </main>
      <PageAssistant />
    </MemoryRouter>
  );
}
const session = (): AssistedSession => ({
  id: 'project-id',
  idea: 'Ideia privada',
  messages: [{ role: 'user', text: 'Ideia privada' }],
  brief: 'Ideia privada',
  ready: true,
  revision: 1,
  proposal: null,
  proposalExpiresAt: null,
  cover: null,
  expiresAt: Date.now() + 10000,
  costs: { text: 2, cover: 5 },
});
beforeEach(() => {
  mocks.uid = 'owner';
  vi.clearAllMocks();
  localStorage.clear();
  mocks.load.mockReset().mockResolvedValue(null);
  mocks.inspect.mockResolvedValue({ contextProof: null });
});
it('keeps a late conception read when navigating to the first editor in the same project', async () => {
  let finish!: (value: AssistedSession | null) => void;
  mocks.load.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  render(tree());
  await userEvent.click(screen.getByRole('link', { name: 'Abrir editor' }));
  await act(async () => {
    finish(session());
    await Promise.resolve();
  });
  expect(screen.getByText('Ideia privada')).toBeVisible();
  expect(mocks.load).toHaveBeenCalledTimes(1);
});
it('drops a conception reply from the prior account', async () => {
  let finish!: (value: AssistedSession | null) => void;
  mocks.load
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValueOnce(null);
  const view = render(tree());
  mocks.uid = 'another';
  view.rerender(tree());
  await act(async () => {
    finish(session());
    await Promise.resolve();
  });
  expect(screen.queryByText('Ideia privada')).not.toBeInTheDocument();
});

afterEach(() => vi.restoreAllMocks());
function ActionForm() {
  const [title, setTitle] = useState('Original');
  return (
    <main id="main-content">
      <label htmlFor="project-title">Título do projeto</label>
      <input id="project-title" value={title} onChange={(event) => setTitle(event.target.value)} />
    </main>
  );
}
function actionTree() {
  window.history.replaceState({}, '', '/studio');
  return (
    <MemoryRouter initialEntries={['/studio']}>
      <ActionForm />
      <PageAssistant />
    </MemoryRouter>
  );
}
it('reviews a proposed field value before invoking the original controlled input', async () => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  mocks.ask.mockImplementation((input) =>
    Promise.resolve({
      reply: 'Confira o título.',
      contextProof: null,
      action: {
        id: input.capabilities.find((item) => item.label === 'Título do projeto')!.id,
        value: 'Proposto',
      },
    }),
  );
  render(actionTree());
  await userEvent.click(screen.getByRole('button', { name: /^Assistente da página$/ }));
  await userEvent.type(screen.getByLabelText('Pedido ao assistente da página'), 'Ajuste o título');
  await userEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));
  await screen.findByText('Confira o título.');
  expect(screen.getByLabelText('Título do projeto')).toHaveValue('Original');
  await userEvent.clear(screen.getByLabelText('Texto proposto'));
  await userEvent.type(screen.getByLabelText('Texto proposto'), 'Revisado pelo autor');
  await userEvent.click(screen.getByRole('button', { name: 'Executar: Título do projeto' }));
  expect(screen.getByLabelText('Título do projeto')).toHaveValue('Revisado pelo autor');
  expect(screen.getByRole('complementary', { name: 'Assistente da página' })).toHaveAttribute(
    'data-mode',
    'compact',
  );
});
it('keeps author edits when a captured field changes before execution', async () => {
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  mocks.ask.mockImplementation((input) =>
    Promise.resolve({
      reply: 'Confira o título.',
      contextProof: null,
      action: {
        id: input.capabilities.find((item) => item.label === 'Título do projeto')!.id,
        value: 'Proposto',
      },
    }),
  );
  render(actionTree());
  await userEvent.click(screen.getByRole('button', { name: /^Assistente da página$/ }));
  await userEvent.type(screen.getByLabelText('Pedido ao assistente da página'), 'Ajuste o título');
  await userEvent.click(screen.getByRole('button', { name: 'Enviar pedido' }));
  await screen.findByText('Confira o título.');
  await userEvent.type(screen.getByLabelText('Título do projeto'), ' autoral');
  await userEvent.click(screen.getByRole('button', { name: 'Executar: Título do projeto' }));
  expect(screen.getByLabelText('Título do projeto')).toHaveValue('Original autoral');
  expect(screen.getByRole('alert')).toHaveTextContent('O campo mudou');
  expect(
    screen.queryByRole('button', { name: 'Executar: Título do projeto' }),
  ).not.toBeInTheDocument();
});

it('keeps a question draft while navigating and labels its original context', async () => {
  render(tree());
  await userEvent.type(
    screen.getByLabelText('Pedido ao assistente da página'),
    'Minha pergunta ainda não enviada',
  );
  await userEvent.click(screen.getByRole('link', { name: 'Abrir editor' }));
  expect(screen.getByLabelText('Pedido ao assistente da página')).toHaveValue(
    'Minha pergunta ainda não enviada',
  );
  expect(mocks.ask).not.toHaveBeenCalled();
});

it('sends with Enter, breaks lines with Shift+Enter and keeps an accessible field without a visual label', async () => {
  mocks.ask.mockResolvedValue({ reply: 'Pronto.', contextProof: null, action: null });
  render(actionTree());
  await userEvent.click(screen.getByRole('button', { name: /^Assistente da página$/ }));
  const field = screen.getByRole('textbox', { name: 'Pedido ao assistente da página' });
  expect(screen.queryByText('Pedido ao assistente da página')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Enviar pedido' })).toBeDisabled();
  await userEvent.type(field, 'Primeira linha{Shift>}{Enter}{/Shift}segunda');
  expect(field).toHaveValue('Primeira linha\nsegunda');
  expect(mocks.ask).not.toHaveBeenCalled();
  await userEvent.type(field, '{Enter}');
  await screen.findByText('Pronto.');
  expect(mocks.ask).toHaveBeenCalledOnce();
});
