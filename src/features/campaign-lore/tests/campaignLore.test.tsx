import { publishInvalidation } from '@/shared/services';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CampaignLorePanel } from '../components/CampaignLorePanel';
import { useCampaignLoreMutation } from '../hooks/useCampaignLoreMutation';
import * as transport from '../services/campaignLoreCallables';
import * as repository from '../services/campaignLoreRecovery';
import { sealLore, toBase64, unsealLore, fromBase64 } from '../services/campaignLoreCrypto';
import { chooseDropdown } from '@/test/dropdown';
import {
  baseId,
  campaignId,
  campaignToken,
  deferred,
  entity,
  envelope,
  header,
  installRecoveryHarness,
  operation,
  resolution,
  result,
  sourceKey,
  targetKey,
  uid,
} from './loreTestHelpers';
import type {
  CampaignLoreOperation,
  CampaignLorePrepared,
  CampaignLoreSaveHeader,
  CampaignLoreResult,
  CampaignLorePage,
  ResolveCampaignLoreInput,
} from '../model/campaignLore';
const auth = vi.hoisted((): { user: { uid: string } | null } => ({ user: { uid: 'owner' } }));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/campaignLoreCallables', () => ({
  listCampaignLore: vi.fn(),
  getCampaignLore: vi.fn(),
  prepareCampaignLoreVariant: vi.fn(),
  saveCampaignLoreVariant: vi.fn(),
  removeCampaignLore: vi.fn(),
  restoreCampaignLore: vi.fn(),
  discardCampaignLoreVariant: vi.fn(),
  resolveCampaignLoreOperation: vi.fn(),
}));
let harness: ReturnType<typeof installRecoveryHarness>, rawKey: string;
const prepared = (input: CampaignLoreSaveHeader): CampaignLorePrepared => ({
  ...envelope,
  ...input,
  action: 'save',
  algorithm: 'AES-GCM',
  key: rawKey,
});
const resolveInput = (input: ResolveCampaignLoreInput) =>
  resolution(
    {
      schemaVersion: 1,
      ownerId: uid,
      header: {
        campaignId: input.campaignId,
        campaignToken: input.campaignToken,
        baseId: input.baseId,
        sourceKey: input.sourceKey,
        operationId: input.operationId,
        expectedRevision: input.expectedRevision,
      },
      action: input.action,
      ...(input.action === 'save' ? { relatedSourceKeys: input.relatedSourceKeys } : {}),
      phase: input.action === 'save' ? 'sealed' : 'metadata-ready',
    },
    input.intent === 'cancel' ? 'canceled' : 'committed',
  );
beforeEach(() => {
  vi.resetAllMocks();
  auth.user = { uid };
  harness = installRecoveryHarness();
  rawKey = toBase64(crypto.getRandomValues(new Uint8Array(32)).buffer);
  vi.mocked(transport.listCampaignLore).mockResolvedValue({
    ...envelope,
    items: [
      {
        sourceKey,
        name: entity.name,
        category: entity.category,
        revision: 0,
        legacy: false,
        mode: 'base',
      },
    ],
    nextCursor: null,
  });
  vi.mocked(transport.getCampaignLore).mockResolvedValue(result());
  vi.mocked(transport.prepareCampaignLoreVariant).mockImplementation((input) =>
    Promise.resolve(prepared(input)),
  );
  vi.mocked(transport.saveCampaignLoreVariant).mockImplementation(async () => {
    const op = (await repository.readLoreOperation(uid, campaignId))!;
    const body = await unsealLore(op, rawKey);
    return {
      ...result(1),
      item: {
        ...result(1).item!,
        entity: {
          ...body,
          relations: body.relations.map((r) => ({ ...r, targetName: 'Alvo autorizado' })),
        },
      },
    };
  });
  vi.mocked(transport.resolveCampaignLoreOperation).mockImplementation((input) =>
    Promise.resolve(resolveInput(input)),
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function hookOptions() {
  return {
    uid,
    campaignId,
    baseId,
    isActive: () => true,
    accessVersion: () => 0,
    onConfirmed: vi.fn(),
    onRecovered: vi.fn(),
    onClosed: vi.fn(),
    onGateDenied: vi.fn(),
    observe: vi.fn(),
  };
}
async function readyHook(options = hookOptions()) {
  const hook = renderHook(() => useCampaignLoreMutation(options));
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  return { ...hook, options };
}
async function seedSealed(): Promise<CampaignLoreOperation> {
  const binary = await sealLore(operation, entity, rawKey);
  const op = { ...operation, ...binary, phase: 'sealed' as const };
  harness.rows.set(harness.key, op);
  return op;
}
it('reserva descriptor antes da chave e só envia sealed durável; confirma e fecha sem texto no journal', async () => {
  const h = await readyHook();
  vi.mocked(transport.prepareCampaignLoreVariant).mockImplementation(async (input) => {
    expect((await repository.readLoreOperation(uid, campaignId))?.phase).toBe('preparing');
    return prepared(input);
  });
  vi.mocked(transport.saveCampaignLoreVariant).mockImplementation(async (input) => {
    const saved = await repository.readLoreOperation(uid, campaignId);
    expect(saved?.phase).toBe('sealed');
    expect(input).not.toHaveProperty('entity');
    expect(await unsealLore(saved!, rawKey)).toEqual(entity);
    return result(1);
  });
  vi.mocked(transport.resolveCampaignLoreOperation).mockImplementation(async (input) => {
    const journal = await repository.readLoreOperation(uid, campaignId);
    expect(journal?.phase).toBe('confirmed');
    expect(journal).not.toHaveProperty('ciphertext');
    return resolveInput(input);
  });
  await act(() => h.result.current.execute('save', header, entity));
  expect(h.options.onConfirmed).toHaveBeenCalledWith(result(1));
  expect(harness.rows.size).toBe(0);
});
it('abort IDB depois do put impede prepare e save, mantendo campos do chamador', async () => {
  const h = await readyHook();
  harness.abortWrite();
  await act(() => h.result.current.execute('save', header, entity));
  expect(transport.prepareCampaignLoreVariant).not.toHaveBeenCalled();
  expect(transport.saveCampaignLoreVariant).not.toHaveBeenCalled();
  expect(entity.details).toContain('Segredo');
  expect(h.result.current.error).toMatch(/cancelada/);
});
it('captura payload e relações antes do primeiro await; duas abas não substituem reserva', async () => {
  const first = await readyHook(),
    second = await readyHook(),
    gate = deferred<CampaignLorePrepared>();
  vi.mocked(transport.prepareCampaignLoreVariant).mockReturnValue(gate.promise);
  const draft = {
    ...entity,
    structuredDetails: { ...entity.structuredDetails },
    relations: [{ targetKey, relationType: 'Aliada', description: 'segredo da relação' }],
  };
  let sending!: Promise<void>;
  act(() => {
    sending = first.result.current.execute('save', header, draft);
  });
  await waitFor(() => expect(transport.prepareCampaignLoreVariant).toHaveBeenCalledOnce());
  draft.details = 'Outro texto';
  draft.relations[0]!.description = 'alterado após clique';
  await act(() =>
    second.result.current.execute('save', { ...header, operationId: 'second-op' }, entity),
  );
  expect(transport.prepareCampaignLoreVariant).toHaveBeenCalledOnce();
  await act(async () => {
    gate.resolve(prepared({ ...header, relatedSourceKeys: [targetKey] }));
    await sending;
  });
  expect(transport.saveCampaignLoreVariant).toHaveBeenCalledOnce();
  const call = vi.mocked(transport.saveCampaignLoreVariant).mock.calls[0]![0];
  const plain = await unsealLore(
    {
      ...operation,
      relatedSourceKeys: [targetKey],
      nonce: (await import('../services/campaignLoreCrypto')).fromBase64(call.sealed.nonce),
      ciphertext: (await import('../services/campaignLoreCrypto')).fromBase64(
        call.sealed.ciphertext,
      ),
    },
    rawKey,
  );
  expect(plain.details).toBe(entity.details);
  expect(plain.relations[0]!.description).toBe('segredo da relação');
});
it('reload sealed antes do primeiro commit recupera os mesmos bytes; conflito não rebasa revisão', async () => {
  const op = await seedSealed(),
    h = await readyHook();
  vi.mocked(transport.saveCampaignLoreVariant).mockRejectedValueOnce(
    Object.assign(new Error('Outra edição mudou a ficha.'), {
      details: { reason: 'revision-conflict' },
    }),
  );
  await act(() => h.result.current.recover());
  expect(h.options.onRecovered).toHaveBeenCalledWith(entity, op);
  expect((await repository.readLoreOperation(uid, campaignId))?.header.expectedRevision).toBe(0);
  const first = vi.mocked(transport.saveCampaignLoreVariant).mock.calls[0]![0];
  await act(() => h.result.current.recover());
  expect(transport.saveCampaignLoreVariant).toHaveBeenLastCalledWith(first);
  expect(transport.getCampaignLore).not.toHaveBeenCalled();
  expect(harness.rows.size).toBe(0);
});
it('ACK perdido preserva confirmed sem cifra; reload repete somente resolve confirm', async () => {
  const h = await readyHook();
  vi.mocked(transport.resolveCampaignLoreOperation).mockRejectedValueOnce(new Error('Sem conexão'));
  await act(() => h.result.current.execute('save', header, entity));
  expect(h.result.current.pending?.phase).toBe('confirmed');
  h.unmount();
  vi.clearAllMocks();
  vi.mocked(transport.resolveCampaignLoreOperation).mockImplementation((input) =>
    Promise.resolve(resolveInput(input)),
  );
  const next = await readyHook();
  await act(() => next.result.current.recover());
  expect(transport.prepareCampaignLoreVariant).not.toHaveBeenCalled();
  expect(transport.saveCampaignLoreVariant).not.toHaveBeenCalled();
  expect(transport.resolveCampaignLoreOperation).toHaveBeenCalledWith({
    ...header,
    action: 'save',
    relatedSourceKeys: [],
    intent: 'confirm',
  });
  expect(harness.rows.size).toBe(0);
});
it('gate negado antes da chave não mostra/decripta texto e resolve funciona só com controles', async () => {
  await seedSealed();
  const h = await readyHook();
  vi.mocked(transport.prepareCampaignLoreVariant).mockRejectedValue(
    Object.assign(new Error('Origem indisponível'), { code: 'functions/permission-denied' }),
  );
  await act(() => h.result.current.recover());
  expect(h.options.onRecovered).not.toHaveBeenCalled();
  expect(transport.saveCampaignLoreVariant).not.toHaveBeenCalled();
  expect(harness.rows.size).toBe(1);
  await act(() => h.result.current.cancel());
  expect(transport.resolveCampaignLoreOperation).toHaveBeenCalledWith({
    ...header,
    action: 'save',
    relatedSourceKeys: [],
    intent: 'cancel',
  });
  expect(harness.rows.size).toBe(0);
});
it('revogação detectada durante decrypt impede exibição e novo envio', async () => {
  await seedSealed();
  let version = 0;
  const options = { ...hookOptions(), accessVersion: () => version };
  const h = await readyHook(options);
  const decrypt = crypto.subtle.decrypt.bind(crypto.subtle),
    gate = deferred<ArrayBuffer>();
  let original!: ArrayBuffer;
  vi.spyOn(crypto.subtle, 'decrypt').mockImplementation(async (...args) => {
    original = await decrypt(...args);
    return gate.promise;
  });
  let running!: Promise<void>;
  act(() => {
    running = h.result.current.recover();
  });
  await waitFor(() => expect(original).toBeDefined());
  version++;
  await act(async () => {
    gate.resolve(original);
    await running;
  });
  expect(options.onRecovered).not.toHaveBeenCalled();
  expect(transport.saveCampaignLoreVariant).not.toHaveBeenCalled();
  expect(harness.rows.size).toBe(1);
});
it('troca UID enquanto aguarda Web Lock não persiste pedido da conta anterior', async () => {
  let active = true;
  const h = await readyHook({ ...hookOptions(), isActive: () => active }),
    gate = deferred<void>();
  harness.holdLock(gate.promise);
  let running!: Promise<void>;
  act(() => {
    running = h.result.current.execute('save', header, entity);
  });
  active = false;
  gate.resolve();
  harness.releaseLock();
  await act(() => running);
  expect(harness.rows.size).toBe(0);
  expect(transport.prepareCampaignLoreVariant).not.toHaveBeenCalled();
});
it.each(['remove', 'restore', 'discard'] as const)(
  'recupera %s por metadata-ready sem GET/lista/chave',
  async (action) => {
    const op: CampaignLoreOperation = {
      schemaVersion: 1,
      ownerId: uid,
      header,
      action,
      phase: 'metadata-ready',
    };
    harness.rows.set(harness.key, op);
    const response = {
      ...result(1),
      item: {
        ...result(1).item!,
        legacy: false,
        mode:
          action === 'remove'
            ? ('removed' as const)
            : action === 'discard'
              ? ('base' as const)
              : ('override' as const),
        ...(action === 'remove' ? { entity: null, entityHash: null } : {}),
      },
    };
    vi.mocked(transport.removeCampaignLore).mockResolvedValue(response);
    vi.mocked(transport.restoreCampaignLore).mockResolvedValue(response);
    vi.mocked(transport.discardCampaignLoreVariant).mockResolvedValue(response);
    const h = await readyHook();
    await act(() => h.result.current.recover());
    expect(h.options.onConfirmed).toHaveBeenCalledWith(response);
    expect(transport.getCampaignLore).not.toHaveBeenCalled();
    expect(transport.prepareCampaignLoreVariant).not.toHaveBeenCalled();
  },
);
it('mantém diálogo fechado após Escape durante preparo e confirmação tardia', async () => {
  const gate = deferred<CampaignLorePrepared>();
  vi.mocked(transport.prepareCampaignLoreVariant).mockReturnValue(gate.promise);
  render(<CampaignLorePanel campaignId={campaignId} baseId={baseId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Lia' }));
  await userEvent.click(screen.getByRole('button', { name: 'Salvar variante da mesa' }));
  await waitFor(() => expect(transport.prepareCampaignLoreVariant).toHaveBeenCalledOnce());
  await userEvent.keyboard('{Escape}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  const input = vi.mocked(transport.prepareCampaignLoreVariant).mock.calls[0]![0];
  await act(async () => {
    gate.resolve(prepared(input));
    await gate.promise;
  });
  await waitFor(() => expect(transport.resolveCampaignLoreOperation).toHaveBeenCalledOnce());
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('lista vazia com cursor permite página seguinte e não revela corpo antes de abrir', async () => {
  vi.mocked(transport.listCampaignLore)
    .mockResolvedValueOnce({ ...envelope, items: [], nextCursor: 'next' })
    .mockResolvedValueOnce({
      ...envelope,
      items: [
        { sourceKey, name: 'Lia', category: 'character', legacy: false, mode: 'base', revision: 0 },
      ],
      nextCursor: null,
    });
  render(<CampaignLorePanel campaignId={campaignId} baseId={baseId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Carregar mais lore da mesa' }));
  expect(await screen.findByRole('button', { name: 'Lia' })).toBeInTheDocument();
  expect(screen.queryByText(/Segredo/)).not.toBeInTheDocument();
  expect(transport.listCampaignLore).toHaveBeenLastCalledWith({
    campaignId,
    baseId,
    campaignToken,
    view: 'active',
    cursor: 'next',
  });
});
it('resposta atrasada de leitura após trocar UID não monta editor antigo', async () => {
  const gate = deferred<ReturnType<typeof result>>();
  vi.mocked(transport.getCampaignLore).mockReturnValue(gate.promise);
  const view = render(<CampaignLorePanel campaignId={campaignId} baseId={baseId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Lia' }));
  auth.user = { uid: 'other' };
  view.rerender(<CampaignLorePanel campaignId={campaignId} baseId={baseId} />);
  await act(async () => {
    gate.resolve(result());
    await gate.promise;
  });
  expect(screen.queryByRole('textbox', { name: 'Detalhes da ficha' })).not.toBeInTheDocument();
  expect(screen.queryByText(/Segredo/)).not.toBeInTheDocument();
});
it('falha transitória ao voltar à janela preserva campos, bloqueia envio e permite nova conferência', async () => {
  render(<CampaignLorePanel campaignId={campaignId} baseId={baseId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Lia' }));
  const details = screen.getByRole('textbox', { name: 'Detalhes da ficha' });
  await userEvent.clear(details);
  await userEvent.type(details, 'Rascunho ainda não enviado');
  vi.mocked(transport.getCampaignLore).mockRejectedValueOnce(
    Object.assign(new Error('Rede indisponível'), { code: 'functions/unavailable' }),
  );
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Detalhes da ficha' })).toHaveValue(
      'Rascunho ainda não enviado',
    ),
  );
  expect(screen.getByRole('button', { name: 'Salvar variante da mesa' })).toBeDisabled();
  expect(transport.saveCampaignLoreVariant).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Conferir acesso novamente' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Salvar variante da mesa' })).toBeEnabled(),
  );
  expect(screen.getByRole('textbox', { name: 'Detalhes da ficha' })).toHaveValue(
    'Rascunho ainda não enviado',
  );
});
it('resposta com texto diferente não confirma nem apaga o pedido cifrado', async () => {
  const h = await readyHook();
  vi.mocked(transport.saveCampaignLoreVariant).mockResolvedValue({
    ...result(1),
    item: {
      ...result(1).item!,
      entity: { ...result(1).item!.entity!, details: 'Outro texto inesperado' },
    },
  });
  await act(() => h.result.current.execute('save', header, entity));
  expect(h.options.onConfirmed).not.toHaveBeenCalled();
  expect(h.result.current.pending?.phase).toBe('sealed');
  expect(transport.resolveCampaignLoreOperation).not.toHaveBeenCalled();
  expect(await unsealLore((await repository.readLoreOperation(uid, campaignId))!, rawKey)).toEqual(
    entity,
  );
});
it('permite abrir uma ficha em leitura mesmo sem Web Locks', async () => {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  render(<CampaignLorePanel campaignId={campaignId} baseId={baseId} />);
  const button = await screen.findByRole('button', { name: 'Lia' });
  expect(button).toBeEnabled();
  await userEvent.click(button);
  expect(screen.getByRole('textbox', { name: 'Detalhes da ficha' })).toHaveValue(entity.details);
  expect(screen.getByRole('button', { name: 'Salvar variante da mesa' })).toBeDisabled();
  expect(transport.prepareCampaignLoreVariant).not.toHaveBeenCalled();
});
it('mantém o botão de origem focável durante GET e retorna foco ao fechar por teclado', async () => {
  const gate = deferred<ReturnType<typeof result>>();
  vi.mocked(transport.getCampaignLore).mockReturnValueOnce(gate.promise);
  render(<CampaignLorePanel campaignId={campaignId} baseId={baseId} />);
  const opener = await screen.findByRole('button', { name: 'Lia' });
  await userEvent.click(opener);
  expect(opener).toBeEnabled();
  await act(async () => {
    gate.resolve(result());
    await gate.promise;
  });
  const close = screen.getByRole('button', { name: 'Fechar ficha' });
  close.focus();
  await userEvent.keyboard('{Enter}');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(opener).toHaveFocus());
});
it.each(['refresh', 'next'] as const)(
  'projeção nova da lista invalida prepare antigo antes de decrypt ou exibição (%s)',
  async (mode) => {
    await seedSealed();
    if (mode === 'next')
      vi.mocked(transport.listCampaignLore).mockResolvedValueOnce({
        ...envelope,
        items: [
          {
            sourceKey,
            name: entity.name,
            category: entity.category,
            revision: 0,
            legacy: false,
            mode: 'base',
          },
        ],
        nextCursor: 'next',
      });
    render(<CampaignLorePanel campaignId={campaignId} baseId={baseId} />);
    await screen.findByRole('button', { name: 'Lia' });
    const listing = deferred<Awaited<ReturnType<typeof transport.listCampaignLore>>>(),
      key = deferred<CampaignLorePrepared>();
    vi.mocked(transport.listCampaignLore).mockReturnValueOnce(listing.promise);
    vi.mocked(transport.prepareCampaignLoreVariant).mockReturnValueOnce(key.promise);
    await userEvent.click(
      screen.getByRole('button', {
        name: mode === 'next' ? 'Carregar mais lore da mesa' : 'Atualizar lore da mesa',
      }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Recuperar pedido de lore' }));
    await waitFor(() => expect(transport.prepareCampaignLoreVariant).toHaveBeenCalledOnce());
    const decrypt = vi.spyOn(crypto.subtle, 'decrypt');
    await act(async () => {
      listing.resolve({
        ...envelope,
        projectionToken: '9'.repeat(64),
        items: [],
        nextCursor: null,
      });
      await listing.promise;
    });
    await act(async () => {
      key.resolve(prepared({ ...header, relatedSourceKeys: [] }));
      await key.promise;
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Recuperar pedido de lore' })).toBeEnabled(),
    );
    expect(decrypt).not.toHaveBeenCalled();
    expect(transport.saveCampaignLoreVariant).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Detalhes da ficha' })).not.toBeInTheDocument();
    expect((await repository.readLoreOperation(uid, campaignId))?.phase).toBe('sealed');
  },
);
it('edita a ficha inteira, preserva aliases com vírgulas e envia as relações escolhidas sem nomes no pedido', async () => {
  const user = userEvent.setup();
  render(<CampaignLorePanel campaignId={campaignId} baseId={baseId} />);
  await user.click(await screen.findByRole('button', { name: 'Lia' }));
  async function fill(label: string, text: string) {
    const input = screen.getByRole('textbox', { name: label });
    await user.clear(input);
    await user.paste(text);
  }
  await fill('Nome da ficha', '  Torre da mesa  ');
  await chooseDropdown(user, screen.getByRole('combobox', { name: 'Categoria da ficha' }), 'Local');
  await fill('Resumo da ficha', '  Abrigo dos viajantes  ');
  expect(screen.getByRole('textbox', { name: 'Outro nome 1' })).toHaveValue('Lia, a guia');
  await fill('Outro nome 1', '  Torre, do norte  ');
  await user.click(screen.getByRole('button', { name: 'Adicionar outro nome' }));
  await fill('Outro nome 2', '  Farol, da lua  ');
  await user.click(screen.getByRole('button', { name: 'Adicionar outro nome' }));
  await fill('Outro nome 3', 'Nome temporário');
  await user.click(screen.getByRole('button', { name: 'Remover outro nome 3' }));
  expect(screen.queryByRole('textbox', { name: 'Outro nome 3' })).not.toBeInTheDocument();
  await fill('Detalhes da ficha', '  Escada 🐉\nporta secreta  ');
  await fill('Aparência', '  Pedra azul\n  ');
  await fill('Personalidade', '  Acolhedora  ');
  await fill('História', '  Antiga vigília  ');
  await fill('Anotações da ficha', '  Pista da mesa  ');
  const secondKey = '8'.repeat(64),
    guard = {
      sourceKey: targetKey,
      name: 'Guardião autorizado',
      category: 'character' as const,
      revision: 0,
      legacy: false,
      mode: 'base' as const,
    },
    key = { ...guard, sourceKey: secondKey, name: 'Chave autorizada' };
  vi.mocked(transport.listCampaignLore)
    .mockResolvedValueOnce({
      ...envelope,
      items: [{ ...guard, sourceKey, name: 'A própria ficha' }, guard],
      nextCursor: 'picker-page2',
    })
    .mockResolvedValueOnce({ ...envelope, items: [guard, key], nextCursor: null });
  await user.click(screen.getByRole('button', { name: 'Selecionar ficha para relação' }));
  expect(await screen.findByRole('button', { name: 'Guardião autorizado' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'A própria ficha' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Carregar mais fichas para relação' }));
  expect(await screen.findByRole('button', { name: 'Chave autorizada' })).toBeInTheDocument();
  expect(screen.getAllByRole('button', { name: 'Guardião autorizado' })).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Chave autorizada' }));
  await fill('Tipo da relação 1', '  Protege  ');
  await fill('Descrição da relação 1', 'A porta da torre');
  vi.mocked(transport.listCampaignLore).mockResolvedValueOnce({
    ...envelope,
    items: [key],
    nextCursor: null,
  });
  await user.click(screen.getByRole('button', { name: 'Selecionar ficha para relação' }));
  await user.click(await screen.findByRole('button', { name: 'Chave autorizada' }));
  await fill('Tipo da relação 2', '  Abre  ');
  await fill('Descrição da relação 2', '  Uma porta 🗝️\nfechada  ');
  await user.click(screen.getByRole('button', { name: 'Remover relação 1' }));
  expect(screen.getByRole('textbox', { name: 'Tipo da relação 1' })).toHaveValue('  Abre  ');
  expect(screen.queryByRole('textbox', { name: 'Tipo da relação 2' })).not.toBeInTheDocument();
  vi.mocked(transport.listCampaignLore).mockResolvedValue({
    ...envelope,
    collectionRevision: 1,
    items: [],
    nextCursor: null,
  });
  await user.click(screen.getByRole('button', { name: 'Salvar variante da mesa' }));
  await waitFor(() => expect(transport.resolveCampaignLoreOperation).toHaveBeenCalledOnce());
  const request = vi.mocked(transport.saveCampaignLoreVariant).mock.calls[0]![0];
  const sent = await unsealLore(
    {
      ...operation,
      header: { ...header, operationId: request.operationId },
      relatedSourceKeys: [secondKey],
      nonce: fromBase64(request.sealed.nonce),
      ciphertext: fromBase64(request.sealed.ciphertext),
    },
    rawKey,
  );
  expect(sent).toEqual({
    name: 'Torre da mesa',
    aliases: ['Torre, do norte', 'Farol, da lua'],
    category: 'location',
    summary: 'Abrigo dos viajantes',
    details: '  Escada 🐉\nporta secreta  ',
    structuredDetails: {
      appearance: '  Pedra azul\n  ',
      personality: '  Acolhedora  ',
      history: '  Antiga vigília  ',
      notes: '  Pista da mesa  ',
    },
    relations: [
      { targetKey: secondKey, relationType: 'Abre', description: '  Uma porta 🗝️\nfechada  ' },
    ],
  });
  expect(JSON.stringify(request)).not.toContain('Chave autorizada');
  expect(screen.getByRole('textbox', { name: 'História' })).toHaveValue('  Antiga vigília  ');
});
it('seletor de relações recupera erro de rede, percorre janela vazia e ignora resposta após fechar', async () => {
  const user = userEvent.setup();
  render(<CampaignLorePanel campaignId={campaignId} baseId={baseId} />);
  await user.click(await screen.findByRole('button', { name: 'Lia' }));
  vi.mocked(transport.listCampaignLore)
    .mockRejectedValueOnce(
      Object.assign(new Error('Seleção sem rede'), { code: 'functions/unavailable' }),
    )
    .mockResolvedValueOnce({ ...envelope, items: [], nextCursor: 'empty-next' })
    .mockResolvedValueOnce({
      ...envelope,
      items: [
        {
          sourceKey: targetKey,
          name: 'Ficha do destino',
          category: 'concept',
          revision: 0,
          legacy: false,
          mode: 'base',
        },
      ],
      nextCursor: null,
    });
  await user.click(screen.getByRole('button', { name: 'Selecionar ficha para relação' }));
  expect(await screen.findByText('Seleção sem rede')).toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: 'Detalhes da ficha' })).toHaveValue(entity.details);
  await user.click(screen.getByRole('button', { name: 'Tentar selecionar novamente' }));
  expect(await screen.findByText('Há outras páginas de fichas.')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Carregar mais fichas para relação' }));
  await user.click(await screen.findByRole('button', { name: 'Ficha do destino' }));
  expect(screen.getByRole('textbox', { name: 'Tipo da relação 1' })).toHaveValue('');
  await user.click(screen.getByRole('button', { name: 'Remover relação 1' }));
  const late = deferred<CampaignLorePage>();
  vi.mocked(transport.listCampaignLore).mockReturnValueOnce(late.promise);
  await user.click(screen.getByRole('button', { name: 'Selecionar ficha para relação' }));
  await user.click(screen.getByRole('button', { name: 'Fechar seleção' }));
  await act(async () => {
    late.resolve({
      ...envelope,
      items: [
        {
          sourceKey: targetKey,
          name: 'Resposta já fechada',
          category: 'concept',
          revision: 0,
          legacy: false,
          mode: 'base',
        },
      ],
      nextCursor: null,
    });
    await late.promise;
  });
  expect(screen.queryByRole('button', { name: 'Resposta já fechada' })).not.toBeInTheDocument();
  expect(transport.saveCampaignLoreVariant).not.toHaveBeenCalled();
});
it('perda de acesso na seleção de relações limpa a ficha sem enviar variante', async () => {
  render(<CampaignLorePanel campaignId={campaignId} baseId={baseId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Lia' }));
  vi.mocked(transport.listCampaignLore).mockRejectedValueOnce(
    Object.assign(new Error('Ficha indisponível'), { code: 'functions/permission-denied' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Selecionar ficha para relação' }));
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: 'Detalhes da ficha' })).not.toBeInTheDocument(),
  );
  expect(screen.getByText(/Esta ficha ou sua base não está disponível/)).toBeInTheDocument();
  expect(transport.saveCampaignLoreVariant).not.toHaveBeenCalled();
});
it('retira com confirmação, restaura a variante anterior e descarta integralmente sem reiniciar revisão', async () => {
  const user = userEvent.setup(),
    original = result().item!.entity!;
  let state: CampaignLoreResult = {
    ...result(1),
    item: { ...result(1).item!, entity: { ...original, details: 'Variante da mesa anterior' } },
  };
  const page = (view?: 'active' | 'removed'): CampaignLorePage => ({
    ...state,
    items:
      (view === 'removed') === (state.item!.mode === 'removed')
        ? [
            {
              sourceKey,
              name: 'Lia',
              category: 'character',
              revision: state.item!.revision,
              legacy: false,
              mode: state.item!.mode,
            },
          ]
        : [],
    nextCursor: null,
  });
  vi.mocked(transport.listCampaignLore).mockImplementation((input) =>
    Promise.resolve(page(input.view)),
  );
  vi.mocked(transport.getCampaignLore).mockImplementation(() => Promise.resolve(state));
  vi.mocked(transport.removeCampaignLore).mockImplementation(() => {
    state = {
      ...state,
      collectionRevision: 2,
      item: {
        ...state.item!,
        revision: 2,
        legacy: false,
        mode: 'removed',
        entity: null,
        entityHash: null,
      },
    };
    return Promise.resolve(state);
  });
  vi.mocked(transport.restoreCampaignLore).mockImplementation(() => {
    state = {
      ...state,
      collectionRevision: 3,
      item: {
        ...state.item!,
        revision: 3,
        legacy: false,
        mode: 'override',
        entity: { ...original, details: 'Variante da mesa anterior' },
        entityHash: 'f'.repeat(64),
      },
    };
    return Promise.resolve(state);
  });
  vi.mocked(transport.discardCampaignLoreVariant).mockImplementation(() => {
    state = {
      ...state,
      collectionRevision: 4,
      item: {
        ...state.item!,
        revision: 4,
        legacy: false,
        mode: 'base',
        entity: original,
        entityHash: 'f'.repeat(64),
      },
    };
    return Promise.resolve(state);
  });
  render(<CampaignLorePanel campaignId={campaignId} baseId={baseId} />);
  await user.click(await screen.findByRole('button', { name: 'Lia' }));
  await user.click(screen.getByRole('button', { name: 'Retirar ficha da mesa' }));
  await user.click(screen.getByRole('button', { name: 'Voltar à ficha' }));
  expect(transport.removeCampaignLore).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Retirar ficha da mesa' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar retirada' }));
  await waitFor(() => expect(transport.resolveCampaignLoreOperation).toHaveBeenCalledTimes(1));
  await chooseDropdown(
    user,
    screen.getByRole('combobox', { name: 'Fichas do lore da mesa' }),
    'Retiradas',
  );
  await user.click(await screen.findByRole('button', { name: 'Lia' }));
  expect(screen.queryByRole('textbox', { name: 'Detalhes da ficha' })).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Restaurar ficha' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar restauração' }));
  await waitFor(() => expect(transport.resolveCampaignLoreOperation).toHaveBeenCalledTimes(2));
  expect(screen.getByRole('textbox', { name: 'Detalhes da ficha' })).toHaveValue(
    'Variante da mesa anterior',
  );
  await user.click(screen.getByRole('button', { name: 'Descartar variante' }));
  expect(screen.getByText(/Todos os campos da variante serão perdidos/)).toBeInTheDocument();
  await user.keyboard('{Escape}');
  expect(transport.discardCampaignLoreVariant).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Descartar variante' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar descarte' }));
  await waitFor(() => expect(transport.resolveCampaignLoreOperation).toHaveBeenCalledTimes(3));
  expect(screen.getByRole('textbox', { name: 'Detalhes da ficha' })).toHaveValue(entity.details);
  expect(transport.removeCampaignLore).toHaveBeenCalledWith(
    expect.objectContaining({ expectedRevision: 1 }),
  );
  expect(transport.restoreCampaignLore).toHaveBeenCalledWith(
    expect.objectContaining({ expectedRevision: 2 }),
  );
  expect(transport.discardCampaignLoreVariant).toHaveBeenCalledWith(
    expect.objectContaining({ expectedRevision: 3 }),
  );
  expect(screen.queryByRole('button', { name: 'Descartar variante' })).not.toBeInTheDocument();
});
it('encerramento por escolha explícita conserva o pedido ao voltar ou Escape e limpa somente após confirmar', async () => {
  await seedSealed();
  const user = userEvent.setup();
  render(<CampaignLorePanel campaignId={campaignId} baseId={baseId} />);
  await user.click(
    await screen.findByRole('button', { name: 'Encerrar pedido sem recuperar texto' }),
  );
  await user.click(screen.getByRole('button', { name: 'Manter pedido' }));
  expect(transport.resolveCampaignLoreOperation).not.toHaveBeenCalled();
  expect((await repository.readLoreOperation(uid, campaignId))?.phase).toBe('sealed');
  await user.click(screen.getByRole('button', { name: 'Encerrar pedido sem recuperar texto' }));
  await user.keyboard('{Escape}');
  expect(transport.resolveCampaignLoreOperation).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Encerrar pedido sem recuperar texto' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar encerramento' }));
  await waitFor(() =>
    expect(
      screen.queryByRole('button', { name: 'Recuperar pedido de lore' }),
    ).not.toBeInTheDocument(),
  );
  expect(await repository.readLoreOperation(uid, campaignId)).toBeNull();
  expect(transport.resolveCampaignLoreOperation).toHaveBeenCalledWith({
    ...header,
    action: 'save',
    relatedSourceKeys: [],
    intent: 'cancel',
  });
  expect(transport.prepareCampaignLoreVariant).not.toHaveBeenCalled();
  expect(transport.saveCampaignLoreVariant).not.toHaveBeenCalled();
});
it('recuperação escolhida após reload abre somente o texto decifrado autorizado e confirma o mesmo pedido', async () => {
  await seedSealed();
  render(<CampaignLorePanel campaignId={campaignId} baseId={baseId} />);
  await screen.findByRole('button', { name: 'Lia' });
  vi.mocked(transport.listCampaignLore).mockResolvedValue({
    ...envelope,
    collectionRevision: 1,
    items: [],
    nextCursor: null,
  });
  await userEvent.click(screen.getByRole('button', { name: 'Recuperar pedido de lore' }));
  expect(await screen.findByRole('textbox', { name: 'Detalhes da ficha' })).toHaveValue(
    entity.details,
  );
  await waitFor(() => expect(transport.resolveCampaignLoreOperation).toHaveBeenCalledOnce());
  expect(transport.prepareCampaignLoreVariant).toHaveBeenCalledWith({
    ...header,
    relatedSourceKeys: [],
  });
  expect(transport.saveCampaignLoreVariant).toHaveBeenCalledWith(
    expect.objectContaining({ operationId: header.operationId, expectedRevision: 0 }),
  );
  expect(await repository.readLoreOperation(uid, campaignId)).toBeNull();
});
it('confirmar encerramento original de A não cancela nem apaga cifra B criada em outra aba', async () => {
  const a = await seedSealed();
  render(<CampaignLorePanel campaignId={campaignId} baseId={baseId} />);
  await userEvent.click(
    await screen.findByRole('button', { name: 'Encerrar pedido sem recuperar texto' }),
  );
  await repository.clearLoreOperation(a);
  const b = { ...a, header: { ...a.header, operationId: 'new-cipher-B' } };
  await repository.reserveLoreOperation({
    ...b,
    phase: 'preparing',
    nonce: undefined,
    ciphertext: undefined,
  });
  await repository.replaceLoreOperation(b, 'preparing');
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar encerramento' }));
  await waitFor(() =>
    expect(screen.getByText(/controle local mudou em outra aba/i)).toBeInTheDocument(),
  );
  expect(transport.resolveCampaignLoreOperation).not.toHaveBeenCalled();
  expect(await repository.readLoreOperation(uid, campaignId)).toEqual(b);
});

it('lore suporta sessão ausente/login/perda e pulso invalida edição sem decifrar ou enviar', async () => {
  auth.user = null;
  const view = render(<CampaignLorePanel campaignId={campaignId} baseId={baseId} />);
  expect(transport.listCampaignLore).not.toHaveBeenCalled();
  auth.user = { uid };
  view.rerender(<CampaignLorePanel campaignId={campaignId} baseId={baseId} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Lia' }));
  await userEvent.type(
    screen.getByRole('textbox', { name: 'Detalhes da ficha' }),
    'Texto privado em edição',
  );
  vi.mocked(transport.listCampaignLore).mockRejectedValue(new Error('Campanha indisponível'));
  act(() => publishInvalidation({ actorId: uid, scope: 'campaign:' + campaignId }));
  await waitFor(() =>
    expect(screen.queryByRole('textbox', { name: 'Detalhes da ficha' })).not.toBeInTheDocument(),
  );
  expect(transport.saveCampaignLoreVariant).not.toHaveBeenCalled();
  auth.user = null;
  view.rerender(<CampaignLorePanel campaignId={campaignId} baseId={baseId} />);
  expect(screen.queryByRole('heading', { name: 'Lore da mesa' })).not.toBeInTheDocument();
});
