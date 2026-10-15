import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useSceneAutosave } from '../hooks/useSceneAutosave';
import { getScene, updateScene } from '../services/sceneService';
import { readSceneDraft, sceneDraftKey, writeSceneDraft } from '../services/sceneDraftStorage';
import { document, mutation, target, conflict, deferred } from './sceneFixtures';
vi.mock('../services/sceneService', () => ({ getScene: vi.fn(), updateScene: vi.fn() }));
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(updateScene).mockResolvedValue({
    ...mutation,
    scene: { ...mutation.scene, revision: 2 },
  });
  vi.mocked(getScene).mockResolvedValue({
    ...document,
    revision: 3,
    content: '<p>Texto remoto</p>',
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
const advance = async (ms = 600) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
it('não grava ao abrir; debounce 600ms usa CAS e apaga somente rascunho confirmado', async () => {
  const { result } = renderHook(() => useSceneAutosave('owner', document));
  expect(result.current.status).toBe('saved');
  await advance(1000);
  expect(updateScene).not.toHaveBeenCalled();
  act(() => result.current.change('<p>Texto novo</p>'));
  expect(result.current.status).toBe('dirty');
  expect(readSceneDraft(sceneDraftKey('owner', target, 'scene'))?.content).toBe(
    '<p>Texto novo</p>',
  );
  await advance(599);
  expect(updateScene).not.toHaveBeenCalled();
  await advance(1);
  expect(updateScene).toHaveBeenCalledWith(
    expect.objectContaining({ expectedRevision: 1, patch: { content: '<p>Texto novo</p>' } }),
  );
  expect(result.current.status).toBe('saved');
  expect(result.current.document.revision).toBe(2);
  expect(readSceneDraft(sceneDraftKey('owner', target, 'scene'))).toBeNull();
});
it('serializa mudanças durante requisição e envia depois a revisão confirmada', async () => {
  const wait = deferred<typeof mutation>();
  vi.mocked(updateScene)
    .mockReturnValueOnce(wait.promise)
    .mockResolvedValueOnce({ ...mutation, scene: { ...mutation.scene, revision: 3 } });
  const { result } = renderHook(() => useSceneAutosave('owner', document));
  act(() => result.current.change('Primeiro'));
  await advance();
  expect(result.current.status).toBe('saving');
  act(() => result.current.change('Segundo'));
  await advance();
  expect(updateScene).toHaveBeenCalledTimes(1);
  await act(async () => {
    wait.resolve({ ...mutation, scene: { ...mutation.scene, revision: 2 } });
    await wait.promise;
  });
  expect(result.current.status).toBe('dirty');
  await advance();
  expect(updateScene).toHaveBeenLastCalledWith(
    expect.objectContaining({ expectedRevision: 2, patch: { content: 'Segundo' } }),
  );
  expect(result.current.status).toBe('saved');
});
it('retenta resposta incerta com mesmo pedido e mantém nova escrita para depois', async () => {
  vi.mocked(updateScene).mockRejectedValueOnce(
    Object.assign(new Error('Resposta incerta'), { code: 'functions/unavailable' }),
  );
  const { result } = renderHook(() => useSceneAutosave('owner', document));
  act(() => result.current.change('Primeiro'));
  await advance();
  const first = vi.mocked(updateScene).mock.calls.at(0)?.[0];
  expect(first).toBeDefined();
  expect(result.current.status).toBe('error');
  act(() => result.current.change('Segundo'));
  await advance();
  expect(updateScene).toHaveBeenCalledTimes(1);
  await act(async () => result.current.save());
  expect(vi.mocked(updateScene).mock.calls.at(1)?.[0]).toEqual(first);
  await advance();
  expect(updateScene).toHaveBeenLastCalledWith(
    expect.objectContaining({ patch: { content: 'Segundo' }, expectedRevision: 2 }),
  );
});
it('conflito guarda local, compara remoto e exige escolha para novo CAS', async () => {
  vi.mocked(updateScene).mockRejectedValueOnce(conflict());
  const { result } = renderHook(() => useSceneAutosave('owner', document));
  act(() => result.current.change('Meu texto'));
  await advance();
  expect(result.current.status).toBe('conflict');
  await advance(3000);
  expect(updateScene).toHaveBeenCalledTimes(1);
  await act(async () => result.current.compare());
  expect(result.current.remote?.content).toContain('Texto remoto');
  expect(result.current.content).toBe('Meu texto');
  act(() => result.current.resolve(true));
  await advance();
  expect(updateScene).toHaveBeenLastCalledWith(
    expect.objectContaining({ expectedRevision: 3, patch: { content: 'Meu texto' } }),
  );
});
it('escolher remoto é explícito e limpa o rascunho sem gravar por cima', async () => {
  vi.mocked(updateScene).mockRejectedValueOnce(conflict());
  const { result } = renderHook(() => useSceneAutosave('owner', document));
  act(() => result.current.change('Local'));
  await advance();
  await act(async () => result.current.compare());
  act(() => result.current.resolve(false));
  expect(result.current.content).toContain('Texto remoto');
  expect(result.current.status).toBe('saved');
  await advance();
  expect(updateScene).toHaveBeenCalledTimes(1);
  expect(readSceneDraft(sceneDraftKey('owner', target, 'scene'))).toBeNull();
});
it('oferece recuperação sem substituir texto remotamente; mesma revisão permite salvar', async () => {
  writeSceneDraft(sceneDraftKey('owner', target, 'scene'), {
    content: 'Rascunho',
    revision: 1,
    savedAt: 100,
  });
  const { result } = renderHook(() => useSceneAutosave('owner', document));
  expect(result.current.content).toBe(document.content);
  expect(result.current.recovery?.content).toBe('Rascunho');
  await advance();
  expect(updateScene).not.toHaveBeenCalled();
  act(() => result.current.recover());
  await advance();
  expect(updateScene).toHaveBeenCalledWith(
    expect.objectContaining({ patch: { content: 'Rascunho' } }),
  );
});
it('recuperação de revisão antiga exige comparação antes do salvamento', async () => {
  writeSceneDraft(sceneDraftKey('owner', target, 'scene'), {
    content: 'Rascunho',
    revision: 1,
    savedAt: 100,
  });
  const { result } = renderHook(() => useSceneAutosave('owner', { ...document, revision: 2 }));
  act(() => result.current.recover());
  expect(result.current.status).toBe('conflict');
  await advance();
  expect(updateScene).not.toHaveBeenCalled();
  expect(result.current.error).toContain('Compare');
});
it('descartar recuperação conserva confirmado e não escreve', async () => {
  writeSceneDraft(sceneDraftKey('owner', target, 'scene'), {
    content: 'Rascunho',
    revision: 1,
    savedAt: 100,
  });
  const { result } = renderHook(() => useSceneAutosave('owner', document));
  act(() => result.current.discardRecovery());
  expect(result.current.recovery).toBeNull();
  expect(result.current.content).toBe(document.content);
  await advance();
  expect(updateScene).not.toHaveBeenCalled();
});
it('ignora resposta após saída e conserva o rascunho local', async () => {
  const wait = deferred<typeof mutation>();
  vi.mocked(updateScene).mockReturnValueOnce(wait.promise);
  const { result, unmount } = renderHook(() => useSceneAutosave('owner', document));
  act(() => result.current.change('Saída'));
  await advance();
  unmount();
  await act(async () => {
    wait.resolve(mutation);
    await wait.promise;
  });
  expect(readSceneDraft(sceneDraftKey('owner', target, 'scene'))?.content).toBe('Saída');
});
it('alerta falha de armazenamento e recusa comparação de outro projeto', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  vi.mocked(getScene).mockResolvedValue({
    ...document,
    project: { ...document.project, id: 'other' },
  });
  const { result } = renderHook(() => useSceneAutosave('owner', document));
  act(() => result.current.change('Não perder'));
  expect(result.current.storageError).toBe(true);
  await act(async () => result.current.compare());
  expect(result.current.remote).toBeNull();
  expect(result.current.error).toContain('rascunho foi preservado');
});
it('aceita revisão de metadados confirmados e salva texto com novo CAS', async () => {
  const { result } = renderHook(() => useSceneAutosave('owner', document));
  act(() => result.current.acceptMetadata({ ...mutation.scene, revision: 4 }));
  act(() => result.current.change('Texto'));
  await advance();
  expect(updateScene).toHaveBeenCalledWith(expect.objectContaining({ expectedRevision: 4 }));
});
it('salvar sem mudança e escolhas sem dados não causam writes; erro definitivo permite pedido corrigido', async () => {
  const { result } = renderHook(() => useSceneAutosave('owner', document));
  act(() => {
    result.current.recover();
    result.current.resolve(true);
  });
  await act(async () => result.current.save());
  expect(updateScene).not.toHaveBeenCalled();
  vi.mocked(updateScene).mockRejectedValueOnce(
    Object.assign(new Error('Tamanho excedido'), { code: 'functions/invalid-argument' }),
  );
  act(() => result.current.change('Grande'));
  await advance();
  act(() => result.current.change('Pequeno'));
  await act(async () => result.current.save());
  expect(updateScene).toHaveBeenLastCalledWith(
    expect.objectContaining({ patch: { content: 'Pequeno' } }),
  );
});

it('confirmação da aba A não remove rascunho B escrito durante a requisição', async () => {
  const wait = deferred<typeof mutation>();
  vi.mocked(updateScene).mockReturnValueOnce(wait.promise);
  const { result } = renderHook(() => useSceneAutosave('owner', document));
  act(() => result.current.change('Texto A'));
  await advance();
  writeSceneDraft(sceneDraftKey('owner', target, 'scene'), {
    content: 'Texto B',
    revision: 2,
    savedAt: 2,
  });
  await act(async () => {
    wait.resolve({ ...mutation, scene: { ...mutation.scene, revision: 2 } });
    await wait.promise;
  });
  expect(result.current.status).toBe('saved');
  expect(readSceneDraft(sceneDraftKey('owner', target, 'scene'))?.content).toBe('Texto B');
});

it('reserva a cena antes do primeiro await e aceita restauração sem autosave ou CAS antigo', async () => {
  const wait = deferred<void>();
  const { result } = renderHook(() => useSceneAutosave('owner', document));
  let work!: Promise<void>;
  act(() => {
    work = result.current.runExclusive(async () => {
      await wait.promise;
      result.current.acceptConfirmedContent({
        content: '<p>Restaurado</p>',
        revision: 7,
        wordCount: 1,
        bodyHash: 'restored-hash',
        bodyBytes: 17,
      });
    });
    result.current.change('Tentativa durante restauração');
  });
  expect(result.current.content).toBe(document.content);
  await expect(result.current.runExclusive(() => Promise.resolve())).rejects.toThrow(
    /Confirme o salvamento/,
  );
  await act(async () => {
    wait.resolve();
    await work;
  });
  expect(result.current.content).toBe('<p>Restaurado</p>');
  expect(result.current.document).toMatchObject({
    revision: 7,
    content: '<p>Restaurado</p>',
    wordCount: 1,
    bodyHash: 'restored-hash',
    bodyBytes: 17,
  });
  await advance(1000);
  expect(updateScene).not.toHaveBeenCalled();
  act(() => result.current.change('Próxima edição'));
  await advance();
  expect(updateScene).toHaveBeenCalledWith(
    expect.objectContaining({ expectedRevision: 7, patch: { content: 'Próxima edição' } }),
  );
});
it('não reserva histórico com texto local ou gravação de cena ainda pendentes', async () => {
  const wait = deferred<typeof mutation>();
  vi.mocked(updateScene).mockReturnValue(wait.promise);
  const { result } = renderHook(() => useSceneAutosave('owner', document));
  act(() => result.current.change('Texto pendente'));
  await expect(result.current.runExclusive(() => Promise.resolve())).rejects.toThrow(
    /Confirme o salvamento/,
  );
  await advance();
  await expect(result.current.runExclusive(() => Promise.resolve())).rejects.toThrow(
    /Confirme o salvamento/,
  );
  await act(async () => {
    wait.resolve({ ...mutation, scene: { ...mutation.scene, revision: 2 } });
    await wait.promise;
  });
});
