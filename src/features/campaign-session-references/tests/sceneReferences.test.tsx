import { webcrypto } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chooseDropdown } from '@/test/dropdown';
import { CampaignSessionReferencesPanel } from '../components/CampaignSessionReferencesPanel';
import { CampaignSessionReferenceControls } from '../components/CampaignSessionReferenceControls';
import * as calls from '../services/sessionReferenceCallables';
import * as store from '../services/sessionReferenceRecovery';
import type {
  SessionSceneReadWindow,
  SessionSceneImage,
  AnySessionReferencePage,
} from '../model/sessionSceneReference';
import {
  uid,
  cid,
  scope,
  page,
  envelope,
  context,
  confirmed,
  operation,
  installLocks,
  deferred,
  journalKey,
} from './referenceTestHelpers';
import {
  scene,
  sceneRow,
  sceneKey,
  main,
  extra,
  mainKey,
  extraKey,
  blockPage,
  plan,
  mainBody,
  extraBody,
  image,
} from './sceneReferenceHelpers';
const auth = vi.hoisted((): { user: { uid: string } | null } => ({ user: { uid: 'owner' } }));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/sessionReferenceCallables', () => ({
  listCampaignSessionReferences: vi.fn(),
  addCampaignSessionReference: vi.fn(),
  removeCampaignSessionReference: vi.fn(),
  readCampaignSessionLoreReference: vi.fn(),
  resolveCampaignSessionReferenceOperation: vi.fn(),
  listCampaignSessionSceneBlocks: vi.fn(),
  readCampaignSessionSceneReference: vi.fn(),
  readCampaignSessionSceneImage: vi.fn(),
}));
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  installLocks();
  auth.user = { uid };
  vi.stubGlobal('crypto', webcrypto);
  vi.mocked(calls.listCampaignSessionReferences).mockImplementation((input) =>
    Promise.resolve(
      input.kind === 'scene'
        ? input.view === 'references'
          ? { ...page(), items: [sceneRow] }
          : {
              ...envelope,
              view: 'candidates',
              sourceContext: context,
              items: [scene],
              nextCursor: null,
            }
        : page(),
    ),
  );
  vi.mocked(calls.listCampaignSessionSceneBlocks).mockResolvedValue(blockPage());
  vi.mocked(calls.readCampaignSessionSceneReference).mockImplementation((input) =>
    Promise.resolve(
      input.blockKey === mainKey ? mainBody() : input.blockKey === extraKey ? extraBody() : plan(),
    ),
  );
  vi.mocked(calls.readCampaignSessionSceneImage).mockResolvedValue(image);
  vi.mocked(calls.addCampaignSessionReference).mockImplementation((request) =>
    Promise.resolve(confirmed({ ...operation, request })),
  );
  vi.mocked(calls.removeCampaignSessionReference).mockImplementation((request) =>
    Promise.resolve(confirmed({ ...operation, action: 'remove', request })),
  );
});
const panel = () => (
  <CampaignSessionReferencesPanel scope={scope} readOnly={false} isActive={() => true} />
);
async function scenes() {
  await chooseDropdown(
    userEvent.setup(),
    screen.getByRole('combobox', { name: 'Material da sessão' }),
    'Cenas',
  );
  await screen.findByRole('button', { name: 'Ler cena Portão do inverno' });
}
async function openScene() {
  await scenes();
  await userEvent.click(screen.getByRole('button', { name: 'Ler cena Portão do inverno' }));
  await screen.findByText('Entrar na torre');
}
it('host único mantém lore default e cria scene metadata-only pelo seletor paginado/Arquivo, sem recuperação duplicada', async () => {
  const held = deferred<ReturnType<typeof confirmed>>();
  vi.mocked(calls.addCampaignSessionReference).mockReturnValue(held.promise);
  vi.mocked(calls.listCampaignSessionReferences).mockImplementation((input) =>
    Promise.resolve(
      input.kind === 'scene'
        ? input.view === 'references'
          ? { ...page(), items: [sceneRow] }
          : {
              ...envelope,
              view: 'candidates',
              sourceContext: context,
              items: input.archive === 'archived' ? [{ ...scene, archived: true }] : [],
              nextCursor: input.archive === 'archived' || input.cursor ? null : 'next',
            }
        : page(),
    ),
  );
  render(panel());
  await waitFor(() =>
    expect(calls.listCampaignSessionReferences).toHaveBeenCalledWith({
      ...scope,
      view: 'references',
      limit: 25,
    }),
  );
  await scenes();
  await userEvent.click(screen.getByRole('button', { name: 'Vincular cena' }));
  expect(
    await screen.findByText('Esta janela está vazia; há mais cenas para consultar.'),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Carregar mais cenas' }));
  await chooseDropdown(
    userEvent.setup(),
    screen.getByRole('combobox', { name: 'Cenas disponíveis' }),
    'Arquivo',
  );
  expect(await screen.findByText('Arquivo da cena')).toBeInTheDocument();
  expect(screen.getByText('Estágio não capturado')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Vincular cena Portão do inverno' }));
  await waitFor(() => expect(calls.addCampaignSessionReference).toHaveBeenCalledOnce());
  expect(
    screen.getAllByText(
      'Há um pedido de vínculo aguardando confirmação. O controle original foi preservado.',
    ),
  ).toHaveLength(1);
  const pending = store.readPendingSessionReference(uid, cid)!;
  expect(pending.action === 'add' && pending.request.target).toEqual({
    kind: 'scene',
    sourceKey: sceneKey,
  });
  expect(localStorage.getItem(journalKey)).not.toMatch(/Portão|stage|archived/);
  await act(async () => {
    held.resolve(confirmed(pending));
    await held.promise;
  });
  expect(calls.readCampaignSessionLoreReference).not.toHaveBeenCalled();
});
it('consulta plano sem principal duplicado, respeita ordem dos blocos, lê um por vez e imagem só por ação explícita', async () => {
  render(panel());
  await openScene();
  expect(screen.getByText('Campo não capturado nesta base.')).toBeInTheDocument();
  const blockButtons = within(
    screen.getByRole('region', { name: 'Blocos capturados da cena' }),
  ).getAllByRole('button', { name: /Ler bloco/ });
  expect(blockButtons.map((n) => n.getAttribute('aria-label'))).toEqual([
    'Ler bloco Pista secreta',
    'Ler bloco Texto principal',
  ]);
  expect(calls.readCampaignSessionSceneReference).toHaveBeenCalledOnce();
  expect(screen.queryByText('Principal único 🐉')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Ler bloco Texto principal' }));
  expect(await screen.findAllByText('Principal único 🐉')).toHaveLength(1);
  expect(screen.getByText('Descrição da ilustração: Portão sob neve')).toBeInTheDocument();
  expect(calls.readCampaignSessionSceneImage).not.toHaveBeenCalled();
  const imageOpener = screen.getByRole('button', { name: 'Ver ilustração do bloco' });
  await userEvent.click(imageOpener);
  expect(await screen.findByRole('img', { name: 'Portão sob neve' })).toHaveAttribute(
    'src',
    image.dataUrl,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Fechar ilustração' }));
  await waitFor(() => expect(imageOpener).toHaveFocus());
  await userEvent.click(screen.getByRole('button', { name: 'Ler bloco Pista secreta' }));
  expect(await screen.findByText('Segredo do mestre')).toBeInTheDocument();
  expect(screen.queryByText('Principal único 🐉')).not.toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Fechar cena vinculada' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Ler cena Portão do inverno' })).toHaveFocus(),
  );
});
it('blocos após janela vazia são acessíveis e Arquivo exige seleção explícita sem carregar corpos', async () => {
  vi.mocked(calls.listCampaignSessionSceneBlocks).mockImplementation((input) =>
    Promise.resolve(
      input.archive === 'archived'
        ? blockPage([{ ...extra, archived: true, ownArchived: true }])
        : input.cursor
          ? blockPage([main])
          : blockPage([], 'next-block'),
    ),
  );
  render(panel());
  await openScene();
  expect(
    await screen.findByText('Esta janela está vazia; há mais blocos para consultar.'),
  ).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Carregar mais blocos' }));
  await screen.findByRole('button', { name: 'Ler bloco Texto principal' });
  await chooseDropdown(
    userEvent.setup(),
    screen.getByRole('combobox', { name: 'Blocos disponíveis' }),
    'Arquivo',
  );
  expect(
    await screen.findByRole('button', { name: 'Ler bloco Pista secreta' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Ler bloco Texto principal' }),
  ).not.toBeInTheDocument();
  expect(
    vi
      .mocked(calls.readCampaignSessionSceneReference)
      .mock.calls.every(([r]) => r.blockKey === undefined),
  ).toBe(true);
});
it('trocar bloco ou fechar imagem invalida respostas tardias sem voltar a renderizar corpo ou mídia anterior', async () => {
  const body = deferred<SessionSceneReadWindow>(),
    media = deferred<SessionSceneImage>();
  vi.mocked(calls.readCampaignSessionSceneReference).mockImplementation((input) =>
    input.blockKey === extraKey
      ? body.promise
      : Promise.resolve(input.blockKey ? mainBody() : plan()),
  );
  vi.mocked(calls.readCampaignSessionSceneImage).mockReturnValue(media.promise);
  render(panel());
  await openScene();
  await userEvent.click(screen.getByRole('button', { name: 'Ler bloco Pista secreta' }));
  await userEvent.click(screen.getByRole('button', { name: 'Ler bloco Texto principal' }));
  await screen.findByText('Principal único 🐉');
  await act(async () => {
    body.resolve(extraBody());
    await body.promise;
  });
  expect(screen.queryByText('Segredo do mestre')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Ver ilustração do bloco' }));
  await userEvent.click(screen.getByRole('button', { name: 'Fechar ilustração' }));
  await act(async () => {
    media.resolve(image);
    await media.promise;
  });
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});
it('mudança observada em página de blocos limpa plano/lista/corpo e proíbe compor contexto novo silenciosamente', async () => {
  vi.mocked(calls.listCampaignSessionSceneBlocks)
    .mockResolvedValueOnce(blockPage([main], 'next'))
    .mockResolvedValueOnce({
      ...blockPage(),
      sourceContext: { ...context, projectionToken: 'f'.repeat(64) },
    });
  render(panel());
  await openScene();
  await userEvent.click(screen.getByRole('button', { name: 'Ler bloco Texto principal' }));
  await screen.findByText('Principal único 🐉');
  await userEvent.click(screen.getByRole('button', { name: 'Carregar mais blocos' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(screen.queryByText('Principal único 🐉')).not.toBeInTheDocument();
  expect(screen.queryByText('Entrar na torre')).not.toBeInTheDocument();
});
it('pedido scene recupera fora da sessão; intenção cancelada persiste sem chamar leitor ou reenviar ADD', async () => {
  const pending = {
    ...operation,
    request: { ...operation.request, target: { kind: 'scene' as const, sourceKey: sceneKey } },
  };
  localStorage.setItem(journalKey, JSON.stringify(pending));
  vi.mocked(calls.resolveCampaignSessionReferenceOperation).mockImplementation((input) =>
    Promise.resolve({
      schemaVersion: 1,
      ownerId: uid,
      campaignId: cid,
      campaignToken: scope.campaignToken,
      sessionId: scope.sessionId,
      kind: 'canceled',
      action: input.action,
      request: input.request,
    } as never),
  );
  render(<CampaignSessionReferenceControls campaignId={cid} />);
  await userEvent.click(screen.getByRole('button', { name: 'Encerrar pedido de vínculo' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar encerramento do vínculo' }));
  await waitFor(() => expect(store.readPendingSessionReference(uid, cid)).toBeNull());
  expect(calls.addCampaignSessionReference).not.toHaveBeenCalled();
  expect(calls.readCampaignSessionSceneReference).not.toHaveBeenCalled();
});
it('selecionar a opção atual nos três filtros preserva contexto, seletor, plano e bloco sem novo GET', async () => {
  render(panel());
  await screen.findByRole('button', { name: 'Vincular ficha' });
  const initialCalls = vi.mocked(calls.listCampaignSessionReferences).mock.calls.length;
  await chooseDropdown(
    userEvent.setup(),
    screen.getByRole('combobox', { name: 'Material da sessão' }),
    'Fichas',
  );
  expect(screen.getByRole('button', { name: 'Vincular ficha' })).toBeInTheDocument();
  expect(calls.listCampaignSessionReferences).toHaveBeenCalledTimes(initialCalls);
  await scenes();
  await userEvent.click(screen.getByRole('button', { name: 'Vincular cena' }));
  await screen.findByRole('button', { name: 'Vincular cena Portão do inverno' });
  const candidateCalls = vi.mocked(calls.listCampaignSessionReferences).mock.calls.length;
  await chooseDropdown(
    userEvent.setup(),
    screen.getByRole('combobox', { name: 'Cenas disponíveis' }),
    'Ativas',
  );
  expect(
    screen.getByRole('button', { name: 'Vincular cena Portão do inverno' }),
  ).toBeInTheDocument();
  expect(calls.listCampaignSessionReferences).toHaveBeenCalledTimes(candidateCalls);
  await userEvent.click(screen.getByRole('button', { name: 'Fechar seleção de cena' }));
  await userEvent.click(screen.getByRole('button', { name: 'Ler cena Portão do inverno' }));
  await screen.findByText('Entrar na torre');
  await userEvent.click(screen.getByRole('button', { name: 'Ler bloco Texto principal' }));
  await screen.findByText('Principal único 🐉');
  const reads = vi.mocked(calls.readCampaignSessionSceneReference).mock.calls.length,
    lists = vi.mocked(calls.listCampaignSessionSceneBlocks).mock.calls.length;
  await chooseDropdown(
    userEvent.setup(),
    screen.getByRole('combobox', { name: 'Blocos disponíveis' }),
    'Ativos',
  );
  expect(screen.getByText('Entrar na torre')).toBeInTheDocument();
  expect(screen.getByText('Principal único 🐉')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ler bloco Texto principal' })).toBeInTheDocument();
  expect(calls.readCampaignSessionSceneReference).toHaveBeenCalledTimes(reads);
  expect(calls.listCampaignSessionSceneBlocks).toHaveBeenCalledTimes(lists);
});
it('cena ausente fica neutra e removível; resposta em voo de outra conta não expõe planejamento', async () => {
  vi.mocked(calls.listCampaignSessionReferences).mockImplementation((input) =>
    Promise.resolve(
      input.kind === 'scene'
        ? {
            ...page(),
            items: [
              { id: sceneRow.id, revision: 1, createdAt: 1000, updatedAt: 1000, available: false },
            ],
          }
        : page(),
    ),
  );
  const view = render(panel());
  await chooseDropdown(
    userEvent.setup(),
    screen.getByRole('combobox', { name: 'Material da sessão' }),
    'Cenas',
  );
  expect(await screen.findByText('Material indisponível')).toBeInTheDocument();
  expect(screen.queryByText(scene.title)).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Remover vínculo 1' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar remoção do vínculo' }));
  await waitFor(() => expect(calls.removeCampaignSessionReference).toHaveBeenCalledOnce());
  view.unmount();
  const held = deferred<AnySessionReferencePage>();
  vi.mocked(calls.listCampaignSessionReferences).mockReturnValue(held.promise);
  const mounted = render(panel());
  auth.user = { uid: 'another-owner' };
  mounted.rerender(panel());
  await act(async () => {
    held.resolve({ ...page(), items: [sceneRow] });
    await held.promise;
  });
  expect(screen.queryByText(scene.title)).not.toBeInTheDocument();
});
