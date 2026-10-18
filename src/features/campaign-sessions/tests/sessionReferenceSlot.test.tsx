import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button, Dialog } from '@/shared/ui';
import {
  CampaignSessionsPanel,
  type CampaignSessionReferenceSlot,
} from '../components/CampaignSessionsPanel';
import * as calls from '../services/campaignSessionCallables';
import { uid, campaignId, envelope, session, summary, installLocks } from './sessionTestHelpers';
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { uid: 'owner' } }) }));
vi.mock('../services/campaignSessionCallables', () => ({
  listCampaignSessions: vi.fn(),
  getCampaignSession: vi.fn(),
  saveCampaignSession: vi.fn(),
  moveCampaignSession: vi.fn(),
  deleteCampaignSession: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  installLocks();
  vi.mocked(calls.listCampaignSessions).mockResolvedValue({
    ...envelope,
    items: [summary(session)],
    nextCursor: null,
  });
  vi.mocked(calls.getCampaignSession).mockResolvedValue({ ...envelope, session });
});
function Material({ slot }: { slot: CampaignSessionReferenceSlot }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Consultar material salvo</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Material privado"
        description="Somente leitura"
        footer={<Button onClick={() => setOpen(false)}>Fechar material</Button>}
      >
        <p>{slot.isActive() ? 'Sessão atual' : 'Sessão encerrada'}</p>
      </Dialog>
    </>
  );
}
it('slot contém somente identidade salva e dialog aninhado preserva dirty e foco sem salvar sessão', async () => {
  let observed!: CampaignSessionReferenceSlot;
  const slots = vi.fn((slot: CampaignSessionReferenceSlot) => {
    observed = slot;
    return <Material slot={slot} />;
  });
  render(<CampaignSessionsPanel campaignId={campaignId} renderReferences={slots} />);
  expect(slots).not.toHaveBeenCalled();
  await userEvent.click(
    await screen.findByRole('button', { name: 'Editar sessão Primeiro encontro' }),
  );
  const author = await screen.findByRole('textbox', { name: 'Preparação da sessão' });
  expect(Object.keys(observed).sort()).toEqual(
    ['campaignId', 'campaignToken', 'sessionId', 'sessionRevision', 'readOnly', 'isActive'].sort(),
  );
  expect(observed).toMatchObject({
    campaignId,
    campaignToken: envelope.campaignToken,
    sessionId: session.id,
    sessionRevision: 1,
    readOnly: false,
  });
  expect(uid).toBe(envelope.ownerId);
  await userEvent.type(author, ' rascunho ainda não enviado');
  const opener = screen.getByRole('button', { name: 'Consultar material salvo' });
  await userEvent.click(opener);
  expect(await screen.findByText('Sessão atual')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Fechar material' }));
  await waitFor(() => expect(opener).toHaveFocus());
  expect(author).toHaveValue(session.summary + ' rascunho ainda não enviado');
  expect(calls.getCampaignSession).toHaveBeenCalledOnce();
  expect(calls.saveCampaignSession).not.toHaveBeenCalled();
  const old = observed;
  await userEvent.click(screen.getByRole('button', { name: 'Fechar preparação' }));
  expect(old.isActive()).toBe(false);
  await userEvent.click(screen.getByRole('button', { name: 'Rever preparação da sessão' }));
  expect(await screen.findByRole('textbox', { name: 'Preparação da sessão' })).toHaveValue(
    session.summary + ' rascunho ainda não enviado',
  );
});
it('sessão nova sem confirmação não monta slot e criar rascunho não consulta material', async () => {
  const slots = vi.fn(() => null);
  render(<CampaignSessionsPanel campaignId={campaignId} renderReferences={slots} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Nova sessão' }));
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Título da sessão' }),
    'Nova preparação',
  );
  expect(slots).not.toHaveBeenCalled();
  expect(calls.getCampaignSession).not.toHaveBeenCalled();
  expect(calls.saveCampaignSession).not.toHaveBeenCalled();
});
