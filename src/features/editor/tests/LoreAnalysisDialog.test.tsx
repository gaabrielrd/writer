import { chooseDropdown } from '@/test/dropdown';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoreAnalysisDialog } from '../components/LoreAnalysisDialog';
import * as lore from '@/features/lore';
import * as ai from '@/features/ai-assistant';

vi.mock('@/features/lore', async (original) => ({
  ...(await original<typeof lore>()),
  analyzeChapterLore: vi.fn(),
  prepareBYOKLore: vi.fn(),
  applyLoreAnalysis: vi.fn(),
}));
vi.mock('@/features/ai-assistant', async (original) => ({
  ...(await original<typeof ai>()),
  analyzeLoreWithBYOK: vi.fn(),
  useAIConfig: vi.fn(() => ({ provider: 'firebase_ai' })),
}));
const detected: lore.DetectedLoreEntity = {
  name: 'Arthur',
  category: 'character',
  summary: 'Rei de Avalon',
  details: 'Arthur chegou ao porto.',
  aliases: [],
  evidence: 'Arthur chegou ao porto.',
};
const entity: lore.LoreEntity = {
  ...detected,
  id: 'arthur',
  bookId: 'book',
  relations: [],
  isPublic: true,
  createdAt: 1,
  updatedAt: 1,
  summary: 'Antes',
};
const base = {
  bookId: 'book',
  chapterId: 'chapter',
  content: '<p>Arthur chegou ao porto.</p>',
  entities: [],
  onClose: vi.fn(),
  onApplied: vi.fn(),
  onBusyChange: vi.fn(),
};
function setup(extra: Partial<Parameters<typeof LoreAnalysisDialog>[0]> = {}) {
  const props = { ...base, ...extra };
  return {
    ...render(<LoreAnalysisDialog {...props} />),
    props,
    user: userEvent.setup({ delay: null }),
  };
}
async function analyze(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Analisar capítulo' }));
  await screen.findByLabelText('Sugestão: Arthur');
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ai.useAIConfig).mockReturnValue({ provider: 'firebase_ai' });
  vi.mocked(lore.analyzeChapterLore).mockResolvedValue({
    id: 'ticket',
    provider: 'platform',
    entities: [detected],
  });
  vi.mocked(lore.prepareBYOKLore).mockResolvedValue({
    id: 'ticket',
    provider: 'byok',
    entities: [detected],
  });
  vi.mocked(lore.applyLoreAnalysis).mockResolvedValue({ applied: 1, credits: 4 });
});
describe('revisão do compêndio', () => {
  it('analyzes unsaved current text, reviews and applies selected changes only', async () => {
    const { user } = setup();
    await analyze(user);
    expect(lore.analyzeChapterLore).toHaveBeenCalledWith(
      expect.objectContaining({ text: detected.evidence, content: base.content }),
    );
    expect(lore.applyLoreAnalysis).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Aplicar 1 alteração' }));
    await screen.findByText('Lote aplicado. O compêndio foi atualizado.');
    expect(vi.mocked(lore.applyLoreAnalysis).mock.calls[0]?.slice(0, 2)).toEqual([
      'ticket',
      detected.evidence,
    ]);
    expect(vi.mocked(lore.applyLoreAnalysis).mock.calls[0]?.[2][0]?.input.name).toBe('Arthur');
    expect(vi.mocked(lore.applyLoreAnalysis).mock.calls[0]?.[2][0]?.scope).toBe('local');
    expect(base.onApplied).toHaveBeenCalledWith(4);
    expect(base.onBusyChange.mock.calls).toEqual([[true], [false]]);
  });
  it('canceling does not write or debit', async () => {
    const { user } = setup();
    await analyze(user);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(lore.applyLoreAnalysis).not.toHaveBeenCalled();
    expect(base.onClose).toHaveBeenCalled();
  });
  it('requires explicit resolution when local and global names coincide', async () => {
    const global: lore.LoreEntity = {
      ...entity,
      id: 'universe:world:arthur',
      bookId: undefined,
      universeId: 'world',
    };
    const { user } = setup({ entities: [entity, global], universeId: 'world' });
    await analyze(user);
    expect(screen.getByText('Revisar conflito')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aplicar 0 alterações' })).toBeDisabled();
    await chooseDropdown(
      user,
      screen.getByLabelText('Destino da sugestão'),
      'Atualizar Arthur — global',
    );
    expect(screen.getByText(/afeta todos os livros/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Aplicar 1 alteração' }));
    expect(lore.applyLoreAnalysis).toHaveBeenCalledWith('ticket', detected.evidence, [
      { scope: 'global', entityId: global.id, input: { summary: detected.summary } },
    ]);
  });
  it('edits proposals and can exclude individual fields', async () => {
    const { user } = setup({ entities: [{ ...entity, details: 'Antes' }] });
    await analyze(user);
    await user.click(screen.getByText('Revisar campos'));
    await user.click(screen.getByLabelText('Aplicar Ficha detalhada de Arthur'));
    const summary = screen.getByLabelText('Resumo proposto para Arthur');
    await user.clear(summary);
    await user.type(summary, 'Revisado');
    await user.click(screen.getByRole('button', { name: 'Aplicar 1 alteração' }));
    expect(lore.applyLoreAnalysis).toHaveBeenCalledWith('ticket', detected.evidence, [
      { scope: 'local', entityId: 'arthur', input: { summary: 'Revisado' } },
    ]);
  });
  it('makes new global destination explicit and keeps local as default', async () => {
    const { user } = setup({ universeId: 'world' });
    await analyze(user);
    expect(screen.getByLabelText('Destino da sugestão')).toHaveTextContent(
      'Criar no lore local deste livro',
    );
    await chooseDropdown(
      user,
      screen.getByLabelText('Destino da sugestão'),
      'Criar no lore global do universo',
    );
    expect(screen.getByText(/nova entidade será privada/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Aplicar 1 alteração' }));
    expect(vi.mocked(lore.applyLoreAnalysis).mock.calls[0]?.[2][0]?.scope).toBe('global');
  });
  it('can type and apply multiple aliases without losing the comma while editing', async () => {
    const { user } = setup({ entities: [{ ...entity, aliases: ['Pendragon'] }] });
    await analyze(user);
    await user.click(screen.getByText('Revisar campos'));
    const aliases = screen.getByLabelText('Apelidos proposto para Arthur');
    await user.type(aliases, 'Rei, Pendragon');
    expect(aliases).toHaveValue('Rei, Pendragon');
    await user.click(screen.getByRole('button', { name: 'Aplicar 1 alteração' }));
    expect(vi.mocked(lore.applyLoreAnalysis).mock.calls[0]?.[2][0]?.input.aliases).toEqual([
      'Rei',
      'Pendragon',
    ]);
  });
  it('shows unchanged and empty results without an applicable batch', async () => {
    const { user } = setup({ entities: [{ ...entity, summary: detected.summary }] });
    await analyze(user);
    expect(screen.getByText('Sem alteração')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aplicar 0 alterações' })).toBeDisabled();
    vi.mocked(lore.analyzeChapterLore).mockResolvedValue({
      id: 'empty',
      provider: 'platform',
      entities: [],
    });
    await user.click(screen.getByRole('button', { name: 'Analisar novamente' }));
    await screen.findByText(/Nenhuma entidade encontrada/);
  });
  it('invalidates suggestions after the unsaved text or lore changes', async () => {
    const { user, rerender, props } = setup();
    await analyze(user);
    rerender(<LoreAnalysisDialog {...props} content="<p>Outro texto</p>" />);
    expect(screen.getByText(/O texto, as configurações/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aplicar 1 alteração' })).toBeDisabled();
  });
  it('uses BYOK without platform analysis and displays zero platform cost', async () => {
    vi.mocked(ai.useAIConfig).mockReturnValue({ provider: 'openai_byok', openaiApiKey: 'test' });
    vi.mocked(ai.analyzeLoreWithBYOK).mockResolvedValue([detected]);
    const { user } = setup();
    await analyze(user);
    expect(lore.analyzeChapterLore).not.toHaveBeenCalled();
    expect(lore.prepareBYOKLore).toHaveBeenCalled();
    expect(screen.getByText(/BYOK: sem consumir/)).toBeInTheDocument();
  });
  it('retains the exact payload for retry and locks editing while the response is uncertain', async () => {
    vi.mocked(lore.applyLoreAnalysis).mockRejectedValueOnce(new Error('Rede indisponível'));
    const { user } = setup();
    await analyze(user);
    await user.click(screen.getByRole('button', { name: 'Aplicar 1 alteração' }));
    await screen.findByText(/Rede indisponível/);
    expect(screen.getByLabelText('Destino da sugestão')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Analisar novamente' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Aplicar 1 alteração' }));
    await screen.findByText(/Lote aplicado/);
    expect(vi.mocked(lore.applyLoreAnalysis).mock.calls[0]).toEqual(
      vi.mocked(lore.applyLoreAnalysis).mock.calls[1],
    );
  });
  it('shows provider failure and prevents closing during the atomic apply', async () => {
    vi.mocked(lore.analyzeChapterLore).mockRejectedValueOnce(new Error('Provedor indisponível'));
    const { user } = setup();
    await user.click(screen.getByRole('button', { name: 'Analisar capítulo' }));
    await screen.findByText('Provedor indisponível');
    await analyze(user);
    let resolve!: (value: { applied: number; credits: number }) => void;
    vi.mocked(lore.applyLoreAnalysis).mockReturnValue(
      new Promise((finish) => {
        resolve = finish;
      }),
    );
    await user.click(screen.getByRole('button', { name: 'Aplicar 1 alteração' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Fechar' }));
    expect(base.onClose).not.toHaveBeenCalled();
    resolve({ applied: 1, credits: 4 });
    await waitFor(() => expect(base.onApplied).toHaveBeenCalled());
  });
});
