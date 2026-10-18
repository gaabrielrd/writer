import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampaignDeletionControls } from '../components/CampaignDeletionControls';
import { collectCampaignRecoveryClosures } from '../services/campaignRecoveryClosure';
import {
  readPendingCampaignOperation,
  writePendingCampaignOperation,
  reserveCampaignManagementOperation,
  clearCampaignManagementSnapshot,
} from '../services/campaignManagementRecovery';
import { readCampaignLoreRecovery, forgetCampaignLoreRecovery } from '@/features/campaign-lore';
import { readPendingCampaignNote } from '@/features/campaign-notes';
import { readPendingCampaignSession } from '@/features/campaign-sessions';
import { readPendingSessionReference } from '@/features/campaign-session-references';
import { type DeletionLookup, type DeletionProgress } from '@/features/campaign-deletions';
import { installRecoveryHarness } from './deletionTestBrowser';
const auth = vi.hoisted(() => ({ user: { uid: 'owner' } }));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
const rpc = vi.hoisted(() => ({
  getCampaignDeletionSource: vi.fn(),
  startCampaignDeletion: vi.fn(),
  resolveCampaignDeletionStart: vi.fn(),
  getCampaignDeletion:
    vi.fn<
      (
        input: import('@/features/campaign-deletions').DeletionLookupInput,
      ) => Promise<DeletionLookup>
    >(),
  listCampaignDeletions: vi.fn(),
  advanceCampaignDeletion: vi.fn(),
}));
vi.mock('@/features/campaign-deletions/services/campaignDeletionCallables', () => rpc);
const uid = 'owner',
  campaignId = 'campaign',
  token = 'a'.repeat(64),
  baseId = 'b'.repeat(64),
  sourceKey = 'c'.repeat(64);
const progress: DeletionProgress = {
  schemaVersion: 1,
  ownerId: uid,
  campaignId,
  campaignToken: token,
  deletionId: 'delete-one',
  state: 'deleted',
  phase: 'complete',
  checkpoint: 8,
  complete: true,
  revoked: true,
  createdAt: 1000,
  updatedAt: 2000,
};
const proof: DeletionLookup = {
  schemaVersion: 1,
  ownerId: uid,
  lookup: { campaignId },
  deletion: progress,
};
type LoreOperation = NonNullable<Awaited<ReturnType<typeof readCampaignLoreRecovery>>>;
const sealed: LoreOperation = {
  schemaVersion: 1,
  ownerId: uid,
  header: {
    campaignId,
    campaignToken: '9'.repeat(64),
    baseId,
    sourceKey,
    operationId: 'protected-A',
    expectedRevision: 0,
  },
  action: 'save',
  phase: 'sealed',
  relatedSourceKeys: [],
  nonce: new Uint8Array(12).buffer,
  ciphertext: new Uint8Array(20).buffer,
};
let browser: ReturnType<typeof installRecoveryHarness>;
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  auth.user = { uid };
  browser = installRecoveryHarness();
  vi.mocked(rpc.getCampaignDeletionSource).mockResolvedValue(null);
  vi.mocked(rpc.getCampaignDeletion).mockImplementation((lookup) =>
    Promise.resolve({ ...proof, lookup }),
  );
  vi.mocked(rpc.listCampaignDeletions).mockResolvedValue({ items: [], nextCursor: null });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function openReview() {
  render(<CampaignDeletionControls campaignId={campaignId} />);
  await userEvent.click(screen.getByRole('button', { name: 'Excluir campanha' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Encerrar controles antigos deste navegador' }),
  );
  await screen.findByText('Rascunho protegido de lore');
}
it('confirmação integrada mostra A e preserva cifra B trocada antes de confirmar, sem RPC ou decrypt', async () => {
  browser.rows.set(browser.key, sealed);
  const decrypt = vi.spyOn(crypto.subtle, 'decrypt');
  await openReview();
  const b = {
    ...sealed,
    header: { ...sealed.header, operationId: 'protected-B' },
    ciphertext: new Uint8Array(24).buffer,
  };
  browser.rows.set(browser.key, b);
  await userEvent.click(
    screen.getByRole('button', { name: 'Confirmar encerramento dos controles' }),
  );
  expect(
    await screen.findByText(/Controles alterados ou indisponíveis foram preservados/),
  ).toBeInTheDocument();
  expect(await readCampaignLoreRecovery(uid, campaignId)).toEqual(b);
  expect(decrypt).not.toHaveBeenCalled();
  expect(rpc.startCampaignDeletion).not.toHaveBeenCalled();
  expect(rpc.advanceCampaignDeletion).not.toHaveBeenCalled();
});
it('fechamento de rascunho antigo não depende de token atual e só confirma depois do IDB oncomplete', async () => {
  browser.rows.set(browser.key, sealed);
  await openReview();
  browser.holdWrites();
  await userEvent.click(
    screen.getByRole('button', { name: 'Confirmar encerramento dos controles' }),
  );
  expect(
    screen.getByRole('button', { name: 'Confirmar encerramento dos controles' }),
  ).toBeDisabled();
  expect(browser.rows.get(browser.key)).toEqual(sealed);
  await act(async () => {
    browser.completeWrite();
    await readCampaignLoreRecovery(uid, campaignId);
  });
  expect(await screen.findByText('1 controle(s) local(is) encerrado(s).')).toBeInTheDocument();
  expect(browser.rows.has(browser.key)).toBe(false);
});
it('abortar exclusão IDB conserva cifra e apresenta fechamento parcial', async () => {
  browser.rows.set(browser.key, sealed);
  await openReview();
  browser.abortWrite();
  await userEvent.click(
    screen.getByRole('button', { name: 'Confirmar encerramento dos controles' }),
  );
  expect(
    await screen.findByText(/Controles alterados ou indisponíveis foram preservados/),
  ).toBeInTheDocument();
  expect(browser.rows.get(browser.key)).toEqual(sealed);
});
it('manter controles na confirmação preserva A integral e nunca pede chave', async () => {
  browser.rows.set(browser.key, sealed);
  await openReview();
  await userEvent.click(screen.getByRole('button', { name: 'Manter controles' }));
  expect(await readCampaignLoreRecovery(uid, campaignId)).toEqual(sealed);
  expect(
    screen.queryByRole('button', { name: 'Confirmar encerramento dos controles' }),
  ).not.toBeInTheDocument();
});
it('gestão A usa snapshot integral sob mesmo lock dos escritores e não apaga B', async () => {
  const a = {
    campaignId,
    operationId: 'A',
    expectedRevision: 1,
    patch: { description: 'Rascunho próprio A' },
  };
  await reserveCampaignManagementOperation(uid, a, false, () => {});
  const result = await collectCampaignRecoveryClosures(uid, proof, () => {});
  expect(result.items[0]?.label).toBe('Alteração dos dados da campanha');
  await clearCampaignManagementSnapshot(uid, a, () => {});
  const b = { ...a, operationId: 'B', patch: { description: 'Rascunho próprio B' } };
  await reserveCampaignManagementOperation(uid, b, false, () => {});
  await expect(result.items[0]!.close()).rejects.toThrow(/mudou/);
  expect(readPendingCampaignOperation(uid, campaignId)).toEqual(b);
});
it('C1 conserva próximo pedido quando snapshot A fica antigo', async () => {
  const a = {
    method: 'saveCampaignNote' as const,
    input: {
      campaignId,
      campaignToken: token,
      noteId: 'A',
      operationId: 'A',
      expectedRevision: 0,
      title: 'Nota',
      content: 'Texto próprio',
    },
  };
  const key = 'writer:campaign-notes:' + JSON.stringify([uid, campaignId]);
  localStorage.setItem(key, JSON.stringify(a));
  const entries = await collectCampaignRecoveryClosures(uid, proof, () => {});
  const b = { ...a, input: { ...a.input, noteId: 'B', operationId: 'B' } };
  localStorage.setItem(key, JSON.stringify(b));
  await expect(entries.items.find((x) => x.key === 'note')!.close()).rejects.toThrow();
  expect(readPendingCampaignNote(uid, campaignId)).toEqual(b);
});
it('B desconhecido só encerra por lookup captureId exato, sem derivação cliente ou replay', async () => {
  const captureId = 'start-B',
    scope = { kind: 'start', adventureId: 'adventure' };
  const key = 'writer:campaign-capture:' + JSON.stringify([uid, scope.kind, scope.adventureId]);
  localStorage.setItem(
    key,
    JSON.stringify({
      method: 'startCampaignCapture',
      input: {
        adventureId: 'adventure',
        operationId: captureId,
        expectedSourceToken: 'd'.repeat(64),
        title: 'Mesa',
        description: 'Descrição',
        universeId: null,
      },
    }),
  );
  const entries = await collectCampaignRecoveryClosures(uid, proof, () => {});
  expect(rpc.getCampaignDeletion).toHaveBeenCalledWith({ captureId });
  await entries.items.find((x) => x.key === 'capture:' + captureId)!.close();
  expect(localStorage.getItem(key)).toBeNull();
  expect(rpc.startCampaignDeletion).not.toHaveBeenCalled();
});
it.each(['null', 'owner', 'lookup'] as const)(
  'prova B %s não apaga controle ou recebe vínculo de outra identidade',
  async (mode) => {
    const key = 'writer:campaign-capture:' + JSON.stringify([uid, 'start', 'adventure']);
    localStorage.setItem(
      key,
      JSON.stringify({
        method: 'startCampaignCapture',
        input: {
          adventureId: 'adventure',
          operationId: 'capture',
          expectedSourceToken: 'd'.repeat(64),
          title: 'Mesa',
          description: 'Descrição',
          universeId: null,
        },
      }),
    );
    vi.mocked(rpc.getCampaignDeletion).mockImplementation((lookup) =>
      Promise.resolve({
        ...proof,
        ownerId: mode === 'owner' ? 'other' : uid,
        lookup: mode === 'lookup' ? { captureId: 'other' } : lookup,
        deletion: mode === 'null' ? null : progress,
      }),
    );
    const entries = await collectCampaignRecoveryClosures(uid, proof, () => {});
    expect(entries.items).toEqual([]);
    expect(localStorage.getItem(key)).not.toBeNull();
  },
);
it('prova inválida falha antes de consultar os journals e guarda UID aguardando lock', async () => {
  await expect(
    collectCampaignRecoveryClosures(uid, { ...proof, ownerId: 'other' }, () => {}),
  ).rejects.toThrow();
  browser.rows.set(browser.key, sealed);
  const entries = await collectCampaignRecoveryClosures(uid, proof, () => {});
  let active = false;
  await expect(
    forgetCampaignLoreRecovery(sealed, () => {
      if (!active) throw new Error('UID mudou');
    }),
  ).rejects.toThrow('UID mudou');
  active = true;
  expect(entries.items).toHaveLength(1);
  expect(browser.rows.get(browser.key)).toEqual(sealed);
});
it('fechamento parcial limpa nota própria mas conserva ciphertext alterado de outra aba', async () => {
  browser.rows.set(browser.key, sealed);
  const a = {
    campaignId,
    operationId: 'management',
    expectedRevision: 1,
    patch: { title: 'Mesa' },
  };
  writePendingCampaignOperation(uid, a);
  await openReview();
  browser.rows.set(browser.key, { ...sealed, header: { ...sealed.header, operationId: 'B' } });
  await userEvent.click(
    screen.getByRole('button', { name: 'Confirmar encerramento dos controles' }),
  );
  expect(await screen.findByText('1 controle(s) local(is) encerrado(s).')).toBeInTheDocument();
  expect(readPendingCampaignOperation(uid, campaignId)).toBeNull();
  expect(browser.rows.has(browser.key)).toBe(true);
});

it.each(['management', 'capture'] as const)(
  'controle %s com input futuro fica preservado e marcado ilegível',
  async (kind) => {
    const key =
      kind === 'management'
        ? 'writer:campaign-management:' + JSON.stringify([uid, campaignId])
        : 'writer:campaign-capture:' + JSON.stringify([uid, 'start', 'adventure']);
    const value =
      kind === 'management'
        ? {
            campaignId,
            operationId: 'A',
            expectedRevision: 1,
            patch: { title: 'Título' },
            schemaVersion: 2,
          }
        : {
            method: 'startCampaignCapture',
            input: {
              adventureId: 'adventure',
              operationId: 'capture',
              expectedSourceToken: 'd'.repeat(64),
              title: 'Mesa',
              description: 'Descrição',
              universeId: null,
              futureField: true,
            },
          };
    localStorage.setItem(key, JSON.stringify(value));
    const entries = await collectCampaignRecoveryClosures(uid, proof, () => {});
    expect(entries.unreadable).toBe(true);
    expect(entries.items).toEqual([]);
    expect(localStorage.getItem(key)).toEqual(JSON.stringify(value));
  },
);
it('fechar confirmação durante IDB pendente não reabre diálogo nem encerra outro controle', async () => {
  browser.rows.set(browser.key, sealed);
  await openReview();
  browser.holdWrites();
  await userEvent.click(
    screen.getByRole('button', { name: 'Confirmar encerramento dos controles' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Manter controles' }));
  await act(async () => {
    browser.releaseWrites();
    await readCampaignLoreRecovery(uid, campaignId);
  });
  expect(
    screen.queryByRole('button', { name: 'Confirmar encerramento dos controles' }),
  ).not.toBeInTheDocument();
  expect(rpc.startCampaignDeletion).not.toHaveBeenCalled();
});

it('encerra controles C3A C3B e resolução remota apenas por metadados sem aplicar operações', async () => {
  const cmpIdentity = {
    schemaVersion: 1,
    ownerId: uid,
    campaignId,
    campaignToken: token,
    comparisonId: 'comparison',
    currentBaseId: baseId,
    candidateBaseId: 'd'.repeat(64),
  };
  const cmp = {
    schemaVersion: 1,
    ownerId: uid,
    scope: { kind: 'known', campaignId, comparisonId: 'comparison' },
    expected: cmpIdentity,
    checkpoint: 3,
  };
  const adoption = {
    schemaVersion: 1,
    ownerId: uid,
    scope: { kind: 'known', campaignId, adoptionId: 'adoption' },
    expected: {
      ...cmpIdentity,
      adoptionId: 'adoption',
      loreGenerationId: 'e'.repeat(64),
      expectedCollectionRevision: 2,
    },
    checkpoint: 7,
  };
  const remote = {
    schemaVersion: 1,
    ownerId: uid,
    input: {
      campaignId,
      campaignToken: token,
      baseId,
      operationId: 'lore-op',
      statusToken: 'f'.repeat(64),
      resolutionId: 'resolution',
      intent: 'cancel',
    },
  };
  const entries = [
    ['writer:campaign-comparison:' + JSON.stringify([uid, campaignId, 'job:comparison']), cmp],
    ['writer:campaign-adoption:' + JSON.stringify([uid, campaignId, 'job:adoption']), adoption],
    ['writer:campaign-lore-resolution:' + JSON.stringify([uid, campaignId]), remote],
  ] as const;
  for (const [key, value] of entries) localStorage.setItem(key, JSON.stringify(value));
  const closures = await collectCampaignRecoveryClosures(uid, proof, () => {});
  expect(closures.unreadable).toBe(false);
  expect(closures.items.map((x) => x.key).sort()).toEqual(
    [
      'adoption:' + JSON.stringify(adoption.scope),
      'comparison:' + JSON.stringify(cmp.scope),
      'remote-lore',
    ].sort(),
  );
  for (const item of closures.items) await item.close();
  for (const [key] of entries) expect(localStorage.getItem(key)).toBeNull();
  expect(rpc.getCampaignDeletion).not.toHaveBeenCalled();
  expect(rpc.startCampaignDeletion).not.toHaveBeenCalled();
});

it('fechar e reabrir encerramento durante lock pendente libera apenas depois do próprio writer', async () => {
  browser.rows.set(browser.key, sealed);
  await openReview();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  browser.holdLock(held);
  await userEvent.click(
    screen.getByRole('button', { name: 'Confirmar encerramento dos controles' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Manter controles' }));
  const b = { ...sealed, header: { ...sealed.header, operationId: 'protected-B' } };
  browser.rows.set(browser.key, b);
  await userEvent.click(
    screen.getByRole('button', { name: 'Encerrar controles antigos deste navegador' }),
  );
  await screen.findByText('Rascunho protegido de lore');
  expect(
    screen.getByRole('button', { name: 'Confirmar encerramento dos controles' }),
  ).toBeDisabled();
  await act(async () => {
    browser.releaseLock();
    release();
    await held;
  });
  expect(await readCampaignLoreRecovery(uid, campaignId)).toEqual(b);
  expect(
    screen.getByRole('button', { name: 'Confirmar encerramento dos controles' }),
  ).toBeEnabled();
  expect(rpc.startCampaignDeletion).not.toHaveBeenCalled();
});
it('controle C4 de outra encarnação preservado permite conferir prova e encerrar rascunho antigo explicitamente', async () => {
  const oldControl = {
    schemaVersion: 1,
    ownerId: uid,
    kind: 'known',
    identity: {
      schemaVersion: 1,
      ownerId: uid,
      campaignId,
      campaignToken: '8'.repeat(64),
      deletionId: 'old-job',
    },
    checkpoint: 50,
  };
  const key = 'writer:campaign-deletion:' + JSON.stringify([uid, campaignId]);
  localStorage.setItem(key, JSON.stringify(oldControl));
  browser.rows.set(browser.key, sealed);
  const decrypt = vi.spyOn(crypto.subtle, 'decrypt');
  await openReview();
  expect(localStorage.getItem(key)).toEqual(JSON.stringify(oldControl));
  await userEvent.click(
    screen.getByRole('button', { name: 'Confirmar encerramento dos controles' }),
  );
  expect(await screen.findByText('1 controle(s) local(is) encerrado(s).')).toBeInTheDocument();
  expect(await readCampaignLoreRecovery(uid, campaignId)).toBeNull();
  expect(localStorage.getItem(key)).toEqual(JSON.stringify(oldControl));
  expect(decrypt).not.toHaveBeenCalled();
  expect(rpc.startCampaignDeletion).not.toHaveBeenCalled();
  expect(rpc.advanceCampaignDeletion).not.toHaveBeenCalled();
});
it('confirmação C4 encerra snapshot de sessão antiga sem repetir RPC ou exibir preparação no diálogo', async () => {
  const key = 'writer:campaign-sessions:' + JSON.stringify([uid, campaignId]);
  const op = {
    schemaVersion: 1,
    ownerId: uid,
    method: 'saveCampaignSession',
    input: {
      campaignId,
      campaignToken: '9'.repeat(64),
      sessionId: 'session-0000000001',
      operationId: 'session-0000000001',
      expectedRevision: 0,
      title: 'Preparação privada',
      summary: 'Texto autoral preservado',
      scheduledDate: null,
      status: 'planned',
    },
  };
  localStorage.setItem(key, JSON.stringify(op));
  render(<CampaignDeletionControls campaignId={campaignId} />);
  await userEvent.click(screen.getByRole('button', { name: 'Excluir campanha' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Encerrar controles antigos deste navegador' }),
  );
  await screen.findByText('Pedido de sessão privada');
  expect(screen.queryByText(op.input.summary)).not.toBeInTheDocument();
  expect(screen.queryByText(op.input.title)).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Confirmar encerramento dos controles' }),
  );
  expect(await screen.findByText('1 controle(s) local(is) encerrado(s).')).toBeInTheDocument();
  expect(readPendingCampaignSession(uid, campaignId)).toBeNull();
  expect(rpc.startCampaignDeletion).not.toHaveBeenCalled();
});
it('snapshot de sessão A não apaga B e controles futuros permanecem ilegíveis no encerramento', async () => {
  const key = 'writer:campaign-sessions:' + JSON.stringify([uid, campaignId]);
  const a = {
    schemaVersion: 1,
    ownerId: uid,
    method: 'deleteCampaignSession',
    input: {
      campaignId,
      campaignToken: token,
      sessionId: 'session-0000000001',
      operationId: 'operation-00000001',
      expectedRevision: 1,
    },
  };
  localStorage.setItem(key, JSON.stringify(a));
  const found = await collectCampaignRecoveryClosures(uid, proof, () => {});
  const b = { ...a, input: { ...a.input, operationId: 'operation-00000002' } };
  localStorage.setItem(key, JSON.stringify(b));
  await expect(found.items.find((item) => item.key === 'session')!.close()).rejects.toThrow(
    /mudou/,
  );
  expect(localStorage.getItem(key)).toEqual(JSON.stringify(b));
  const future = { ...b, schemaVersion: 2 };
  localStorage.setItem(key, JSON.stringify(future));
  const invalid = await collectCampaignRecoveryClosures(uid, proof, () => {});
  expect(invalid.unreadable).toBe(true);
  expect(invalid.items.find((item) => item.key === 'session')).toBeUndefined();
  expect(localStorage.getItem(key)).toEqual(JSON.stringify(future));
});

it('encerramento C4 inclui pedido de vínculo cancelado sem material nem RPC da origem', async () => {
  const key = 'writer:session-references:' + JSON.stringify([uid, campaignId]);
  const control = {
    schemaVersion: 1,
    ownerId: uid,
    intent: 'cancel',
    action: 'add',
    request: {
      campaignId,
      campaignToken: token,
      sessionId: 'session-reference-001',
      expectedSessionRevision: 2,
      referenceId: 'reference-operation-001',
      operationId: 'reference-operation-001',
      expectedReferenceCollectionRevision: 3,
      sourceContext: { baseId: 'a'.repeat(64), projectionToken: 'b'.repeat(64) },
      target: { kind: 'lore', sourceKey: 'c'.repeat(64) },
    },
  };
  localStorage.setItem(key, JSON.stringify(control));
  const otherKey = 'writer:session-references:' + JSON.stringify([uid, 'other']);
  const other = { ...control, request: { ...control.request, campaignId: 'other' } };
  localStorage.setItem(otherKey, JSON.stringify(other));
  render(<CampaignDeletionControls campaignId={campaignId} />);
  await userEvent.click(screen.getByRole('button', { name: 'Excluir campanha' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Encerrar controles antigos deste navegador' }),
  );
  await screen.findByText('Pedido de vínculo de lore da sessão');
  expect(screen.queryByText(control.request.target.sourceKey)).not.toBeInTheDocument();
  await userEvent.click(
    screen.getByRole('button', { name: 'Confirmar encerramento dos controles' }),
  );
  expect(await screen.findByText('1 controle(s) local(is) encerrado(s).')).toBeInTheDocument();
  expect(readPendingSessionReference(uid, campaignId)).toBeNull();
  expect(readPendingSessionReference(uid, 'other')).toEqual(other);
  expect(rpc.startCampaignDeletion).not.toHaveBeenCalled();
});
it('snapshot de vínculo A não apaga cancelamento B e formato futuro fica preservado', async () => {
  const key = 'writer:session-references:' + JSON.stringify([uid, campaignId]);
  const control = {
    schemaVersion: 1,
    ownerId: uid,
    intent: 'apply',
    action: 'remove',
    request: {
      campaignId,
      campaignToken: token,
      sessionId: 'session-reference-001',
      expectedSessionRevision: 1,
      referenceId: 'reference-operation-001',
      operationId: 'reference-operation-002',
      expectedRevision: 1,
      expectedReferenceCollectionRevision: 1,
    },
  };
  localStorage.setItem(key, JSON.stringify(control));
  const found = await collectCampaignRecoveryClosures(uid, proof, () => {});
  const replacement = { ...control, intent: 'cancel' };
  localStorage.setItem(key, JSON.stringify(replacement));
  await expect(
    found.items.find((item) => item.key === 'session-reference')!.close(),
  ).rejects.toThrow(/mudou/);
  expect(localStorage.getItem(key)).toEqual(JSON.stringify(replacement));
  const future = { ...replacement, schemaVersion: 2 };
  localStorage.setItem(key, JSON.stringify(future));
  const invalid = await collectCampaignRecoveryClosures(uid, proof, () => {});
  expect(invalid.unreadable).toBe(true);
  expect(invalid.items.find((item) => item.key === 'session-reference')).toBeUndefined();
  expect(localStorage.getItem(key)).toEqual(JSON.stringify(future));
});
