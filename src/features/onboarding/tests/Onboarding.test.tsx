import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { OnboardingProvider } from '../context/OnboardingProvider';
import {
  OnboardingExperience,
  OnboardingPreferences,
  PersonalizedWelcome,
} from '../components/Onboarding';
import { defaultProfile, type WriterProfile } from '../model/profile';
const mocks = vi.hoisted(() => ({ load: vi.fn(), save: vi.fn(), uid: 'writer' }));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { uid: mocks.uid } }) }));
vi.mock('../services/profileService', () => ({
  loadWriterProfile: mocks.load,
  saveWriterProfile: mocks.save,
}));
function tree() {
  return (
    <MemoryRouter>
      <OnboardingProvider>
        <PersonalizedWelcome />
        <OnboardingPreferences />
        <OnboardingExperience />
      </OnboardingProvider>
    </MemoryRouter>
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.uid = 'writer';
  mocks.load.mockResolvedValue(null);
  mocks.save.mockImplementation((_uid: string, revision: number, input: object) =>
    Promise.resolve({ ...input, schemaVersion: 1, revision: revision + 1 }),
  );
});
it('saves the selected campaign profile only after confirmation and starts its tour', async () => {
  render(tree());
  await screen.findByRole('dialog', { name: 'Vamos organizar seu espaço de criação' });
  expect(mocks.save).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Campanhas' }));
  await userEvent.click(screen.getByRole('button', { name: 'Salvar e continuar' }));
  await screen.findByRole('dialog', { name: 'Guia do Writer' });
  expect(mocks.save).toHaveBeenCalledWith(
    'writer',
    0,
    expect.objectContaining({
      interests: ['campaign'],
      questionnaire: 'completed',
      tour: 'active',
    }),
  );
  expect(screen.getByText('Prepare a próxima sessão da sua mesa.')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Todos os projetos' })).toHaveAttribute(
    'href',
    '/studio/projects',
  );
});
it('skips durably without starting a tour or creating content', async () => {
  render(tree());
  await screen.findByRole('dialog', { name: 'Vamos organizar seu espaço de criação' });
  await userEvent.click(screen.getByRole('button', { name: 'Pular por enquanto' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(mocks.save).toHaveBeenCalledWith(
    'writer',
    0,
    expect.objectContaining({ questionnaire: 'skipped', tour: 'paused' }),
  );
});
it('loads a saved profile without repeating the questionnaire and can resume a paused guide', async () => {
  const profile: WriterProfile = {
    ...defaultProfile,
    interests: ['book'],
    schemaVersion: 1,
    revision: 3,
    step: 1,
  };
  mocks.load.mockResolvedValue(profile);
  render(tree());
  await screen.findByText('Sua próxima página começa aqui.');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Retomar guia' }));
  await screen.findByRole('dialog', { name: 'Guia do Writer' });
  expect(mocks.save).toHaveBeenCalledWith(
    'writer',
    3,
    expect.objectContaining({ tour: 'active', step: 1 }),
  );
});
it('keeps the questionnaire and user choices on a save conflict', async () => {
  mocks.save.mockRejectedValue(new Error('Perfil mudou em outra aba'));
  render(tree());
  await screen.findByRole('dialog', { name: 'Vamos organizar seu espaço de criação' });
  await userEvent.click(screen.getByRole('button', { name: 'Livros' }));
  await userEvent.click(screen.getByRole('button', { name: 'Salvar e continuar' }));
  await screen.findAllByText('Perfil mudou em outra aba');
  expect(screen.getByRole('button', { name: 'Livros' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('dialog')).toBeVisible();
});
it('does not adopt a late profile response from another account', async () => {
  let resolve!: (profile: WriterProfile) => void;
  mocks.load
    .mockImplementationOnce(
      () =>
        new Promise<WriterProfile>((done) => {
          resolve = done;
        }),
    )
    .mockResolvedValueOnce(null);
  const view = render(tree());
  await waitFor(() => expect(mocks.load).toHaveBeenCalledWith('writer'));
  mocks.uid = 'other';
  view.rerender(tree());
  resolve({ ...defaultProfile, interests: ['campaign'], schemaVersion: 1, revision: 7 });
  await screen.findByRole('dialog', { name: 'Vamos organizar seu espaço de criação' });
  expect(screen.queryByText('Prepare a próxima sessão da sua mesa.')).not.toBeInTheDocument();
});

it('walks back and forward through the complete guide without creating content and returns focus on completion', async () => {
  mocks.load.mockResolvedValue({
    ...defaultProfile,
    interests: ['book'],
    guidance: 'guided',
    questionnaire: 'completed',
    tour: 'active',
    schemaVersion: 1,
    revision: 1,
  });
  render(
    <MemoryRouter>
      <OnboardingProvider>
        <main id="main-content" tabIndex={-1} data-writer-tour="workspace">
          Meu manuscrito
        </main>
        <OnboardingExperience />
      </OnboardingProvider>
    </MemoryRouter>,
  );
  await screen.findByRole('dialog', { name: 'Guia do Writer' });
  expect(screen.getByRole('button', { name: 'Voltar' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Próxima dica' }));
  await screen.findByText('Seu primeiro percurso · 2 de 6');
  await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
  await screen.findByText('Seu primeiro percurso · 1 de 6');
  for (let step = 2; step <= 6; step++) {
    await userEvent.click(screen.getByRole('button', { name: 'Próxima dica' }));
    await screen.findByText(`Seu primeiro percurso · ${step} de 6`);
  }
  await userEvent.click(screen.getByRole('button', { name: 'Concluir guia' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(mocks.save).toHaveBeenLastCalledWith(
    'writer',
    8,
    expect.objectContaining({ tour: 'completed', step: 5 }),
  );
  expect(screen.getByText('Meu manuscrito')).toHaveFocus();
});
it('pauses from Escape while retaining the current step and returning focus to writing', async () => {
  mocks.load.mockResolvedValue({
    ...defaultProfile,
    interests: ['campaign'],
    guidance: 'guided',
    tour: 'active',
    step: 2,
    schemaVersion: 1,
    revision: 5,
  });
  render(
    <MemoryRouter>
      <OnboardingProvider>
        <main id="main-content" tabIndex={-1}>
          Preparação preservada
        </main>
        <OnboardingExperience />
      </OnboardingProvider>
    </MemoryRouter>,
  );
  const guide = await screen.findByRole('dialog', { name: 'Guia do Writer' });
  guide.focus();
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(mocks.save).toHaveBeenLastCalledWith(
    'writer',
    5,
    expect.objectContaining({ tour: 'paused', step: 2 }),
  );
  expect(screen.getByText('Preparação preservada')).toHaveFocus();
});
it('recovers a failed profile read and supports explicit combined interests', async () => {
  mocks.load.mockRejectedValueOnce(new Error('Sem conexão'));
  render(tree());
  await screen.findByRole('button', { name: 'Tentar carregar perfil' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Tentar carregar perfil' }));
  await screen.findByRole('dialog', { name: 'Vamos organizar seu espaço de criação' });
  await userEvent.click(screen.getByRole('button', { name: 'Livros' }));
  await userEvent.click(screen.getByRole('button', { name: 'Livros' }));
  expect(screen.getByRole('button', { name: 'Livros' })).toHaveAttribute('aria-pressed', 'false');
  await userEvent.click(screen.getByRole('button', { name: 'Quero fazer de tudo' }));
  await userEvent.click(screen.getByRole('button', { name: 'Salvar e continuar' }));
  await screen.findByRole('dialog', { name: 'Guia do Writer' });
  expect(mocks.save).toHaveBeenLastCalledWith(
    'writer',
    0,
    expect.objectContaining({ interests: ['book', 'adventure', 'campaign'] }),
  );
});
