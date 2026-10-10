import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AIActionMenu } from '../components/AIActionMenu';
import * as aiClientModule from '../services/aiClient';
import * as creditsServiceModule from '../services/creditsService';
import * as byokStorageModule from '../services/byokStorage';

vi.mock('../services/aiClient');
vi.mock('../services/creditsService');
vi.mock('../services/byokStorage');

describe('AIActionMenu component', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(creditsServiceModule.deductCredit).mockResolvedValue(9);
    vi.mocked(byokStorageModule.getBYOKConfig).mockReturnValue({
      provider: 'firebase_ai',
    });
  });

  it('abre o menu, executa acao de continuar cena e insere no texto', async () => {
    vi.mocked(aiClientModule.generateAIResponse).mockResolvedValueOnce(
      'Os ventos sussurravam antigos segredos.',
    );
    vi.mocked(creditsServiceModule.deductCredit).mockResolvedValueOnce(9);

    const onInsertText = vi.fn();
    const onReplaceSelection = vi.fn();
    const onCreditDeducted = vi.fn();

    render(
      <AIActionMenu
        selectedText=""
        onGetContextText={() => 'Uma cena com conteúdo suficiente.'}
        userId="user-1"
        userCredits={10}
        onInsertText={onInsertText}
        onReplaceSelection={onReplaceSelection}
        onCreditDeducted={onCreditDeducted}
        onOpenBYOKSettings={vi.fn()}
      />,
    );

    const openBtn = screen.getByRole('button', {
      name: /Abrir Assistente Criativo de IA/i,
    });
    fireEvent.click(openBtn);

    const continueCard = screen.getByRole('button', {
      name: /Continuar Cena/i,
    });
    fireEvent.click(continueCard);

    await waitFor(() => {
      expect(screen.getByText('Os ventos sussurravam antigos segredos.')).toBeInTheDocument();
    });

    expect(creditsServiceModule.deductCredit).not.toHaveBeenCalled();
    const insertBtn = screen.getByRole('button', {
      name: /Inserir no Texto/i,
    });
    fireEvent.click(insertBtn);

    await waitFor(() =>
      expect(onInsertText).toHaveBeenCalledWith('Os ventos sussurravam antigos segredos.'),
    );
    expect(creditsServiceModule.deductCredit).toHaveBeenCalledWith('user-1', 1);
    expect(onCreditDeducted).toHaveBeenCalledWith(9);
  });

  it('substitui selecao quando ha texto selecionado', async () => {
    vi.mocked(aiClientModule.generateAIResponse).mockResolvedValueOnce(
      'Texto reescrito com elegância.',
    );

    const onInsertText = vi.fn();
    const onReplaceSelection = vi.fn();

    render(
      <AIActionMenu
        selectedText="Texto original simples."
        userId="user-1"
        userCredits={10}
        onInsertText={onInsertText}
        onReplaceSelection={onReplaceSelection}
        onOpenBYOKSettings={vi.fn()}
      />,
    );

    const openBtn = screen.getByRole('button', {
      name: /Abrir Assistente Criativo de IA/i,
    });
    fireEvent.click(openBtn);

    const improveCard = screen.getByRole('button', {
      name: /Aprimorar Estilo/i,
    });
    fireEvent.click(improveCard);

    await waitFor(() => {
      expect(screen.getByText('Texto reescrito com elegância.')).toBeInTheDocument();
    });

    const replaceBtn = screen.getByRole('button', {
      name: /Substituir Seleção/i,
    });
    fireEvent.click(replaceBtn);

    await waitFor(() =>
      expect(onReplaceSelection).toHaveBeenCalledWith('Texto reescrito com elegância.'),
    );
  });

  it('executa acao de coerencia com lore e instrucao personalizada', async () => {
    vi.mocked(aiClientModule.generateAIResponse).mockResolvedValueOnce(
      'Coerência analisada com sucesso.',
    );

    render(
      <AIActionMenu
        selectedText="Cena de teste"
        userId="user-1"
        userCredits={10}
        onInsertText={vi.fn()}
        onReplaceSelection={vi.fn()}
        onOpenBYOKSettings={vi.fn()}
      />,
    );

    const openBtn = screen.getByRole('button', {
      name: /Abrir Assistente Criativo de IA/i,
    });
    fireEvent.click(openBtn);

    const consistencyCard = screen.getByRole('button', {
      name: /Coerência com Lore/i,
    });
    fireEvent.click(consistencyCard);

    await waitFor(() => {
      expect(screen.getByText('Coerência analisada com sucesso.')).toBeInTheDocument();
    });
  });

  it('executa prompt customizado e lida com copiar texto', async () => {
    vi.mocked(aiClientModule.generateAIResponse).mockResolvedValueOnce(
      'Resposta personalizada gerada.',
    );

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock,
      },
    });

    render(
      <AIActionMenu
        selectedText="Texto inicial"
        userId="user-1"
        userCredits={10}
        onInsertText={vi.fn()}
        onReplaceSelection={vi.fn()}
        onOpenBYOKSettings={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: /Abrir Assistente Criativo de IA/i,
      }),
    );

    const customInput = screen.getByLabelText(/instrução personalizada/i);
    fireEvent.change(customInput, { target: { value: 'Torne o clima tenso' } });

    const executeBtn = screen.getByRole('button', { name: 'Executar' });
    fireEvent.click(executeBtn);

    await waitFor(() => {
      expect(screen.getByText('Resposta personalizada gerada.')).toBeInTheDocument();
    });

    const copyBtn = screen.getByRole('button', { name: /Copiar/i });
    fireEvent.click(copyBtn);

    await waitFor(() => expect(screen.getByText('Copiado!')).toBeInTheDocument());
    expect(writeTextMock).toHaveBeenCalledWith('Resposta personalizada gerada.');
  });

  it('notifica falta de creditos quando saldo e 0 e nao usa BYOK', () => {
    const onShowOutOfCredits = vi.fn();

    render(
      <AIActionMenu
        selectedText="Texto"
        userId="user-1"
        userCredits={0}
        onShowOutOfCredits={onShowOutOfCredits}
        onInsertText={vi.fn()}
        onReplaceSelection={vi.fn()}
        onOpenBYOKSettings={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: /Abrir Assistente Criativo de IA/i,
      }),
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: /Continuar Cena/i,
      }),
    );

    expect(onShowOutOfCredits).toHaveBeenCalled();
  });

  it('permite abrir configuracoes BYOK pelo rodape', () => {
    const onOpenBYOKSettings = vi.fn();

    render(
      <AIActionMenu
        selectedText="Texto"
        userId="user-1"
        userCredits={10}
        onInsertText={vi.fn()}
        onReplaceSelection={vi.fn()}
        onOpenBYOKSettings={onOpenBYOKSettings}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: /Abrir Assistente Criativo de IA/i,
      }),
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: /Configurar Chave Própria \(BYOK\)/i,
      }),
    );

    expect(onOpenBYOKSettings).toHaveBeenCalled();
  });

  it('exibe mensagem de erro quando a chamada de IA falha', async () => {
    vi.mocked(aiClientModule.generateAIResponse).mockRejectedValueOnce(
      new Error('Erro simulado de rede'),
    );

    render(
      <AIActionMenu
        selectedText="Texto"
        userId="user-1"
        userCredits={10}
        onInsertText={vi.fn()}
        onReplaceSelection={vi.fn()}
        onOpenBYOKSettings={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: /Abrir Assistente Criativo de IA/i,
      }),
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: /Continuar Cena/i,
      }),
    );

    expect(await screen.findByText('Erro simulado de rede')).toBeInTheDocument();
  });
  it('closing discards a generated result without charging and a fresh open has no stale result', async () => {
    vi.mocked(aiClientModule.generateAIResponse).mockResolvedValue('Texto descartado');
    render(
      <AIActionMenu
        selectedText="Texto de origem"
        userId="author"
        userCredits={10}
        onInsertText={vi.fn()}
        onReplaceSelection={vi.fn()}
        onOpenBYOKSettings={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Abrir Assistente/ }));
    fireEvent.click(screen.getByRole('button', { name: /Continuar Cena/ }));
    await screen.findByText('Texto descartado');
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /Abrir Assistente/ }));
    expect(screen.queryByText('Texto descartado')).not.toBeInTheDocument();
    expect(creditsServiceModule.deductCredit).not.toHaveBeenCalled();
  });

  it('aborts pending generation on close and ignores its late result', async () => {
    let finish!: (text: string) => void;
    vi.mocked(aiClientModule.generateAIResponse).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(
      <AIActionMenu
        selectedText="Texto de origem"
        userId="author"
        userCredits={10}
        onInsertText={vi.fn()}
        onReplaceSelection={vi.fn()}
        onOpenBYOKSettings={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Abrir Assistente/ }));
    fireEvent.click(screen.getByRole('button', { name: /Continuar Cena/ }));
    const signal = vi.mocked(aiClientModule.generateAIResponse).mock.calls[0]?.[0].signal;
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    await act(async () => {
      finish('Late stale response');
      await Promise.resolve();
    });
    expect(signal?.aborted).toBe(true);
    expect(screen.queryByText('Late stale response')).not.toBeInTheDocument();
    expect(creditsServiceModule.deductCredit).not.toHaveBeenCalled();
  });

  it('debits exactly once for repeated acceptance and locks dismissal during that operation', async () => {
    vi.mocked(aiClientModule.generateAIResponse).mockResolvedValue('Novo texto');
    let finish!: (credits: number) => void;
    vi.mocked(creditsServiceModule.deductCredit).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const replace = vi.fn();
    const applying = vi.fn();
    render(
      <AIActionMenu
        selectedText="Texto original"
        userId="author"
        userCredits={10}
        onInsertText={vi.fn()}
        onReplaceSelection={replace}
        onOpenBYOKSettings={vi.fn()}
        onApplyingChange={applying}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Abrir Assistente/ }));
    fireEvent.click(screen.getByRole('button', { name: /Aprimorar Estilo/ }));
    await screen.findByText('Novo texto');
    const accept = screen.getByRole('button', { name: /Substituir Seleção/ });
    fireEvent.click(accept);
    fireEvent.click(accept);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(accept).toBeDisabled();
    expect(creditsServiceModule.deductCredit).toHaveBeenCalledOnce();
    await act(async () => {
      finish(9);
      await Promise.resolve();
    });
    expect(replace).toHaveBeenCalledExactlyOnceWith('Novo texto');
    expect(applying.mock.calls).toEqual([[true], [false]]);
  });

  it('never charges or applies stale selections, empty output, or failed generation', async () => {
    vi.mocked(aiClientModule.generateAIResponse).mockResolvedValue('Sugestão válida');
    const replace = vi.fn();
    render(
      <AIActionMenu
        selectedText="Texto original"
        userId="author"
        userCredits={10}
        onInsertText={vi.fn()}
        onReplaceSelection={replace}
        onOpenBYOKSettings={vi.fn()}
        onCanApplyResult={() => false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Abrir Assistente/ }));
    fireEvent.click(screen.getByRole('button', { name: /Aprimorar Estilo/ }));
    await screen.findByText('Sugestão válida');
    fireEvent.click(screen.getByRole('button', { name: /Substituir Seleção/ }));
    expect(await screen.findByText(/O trecho mudou/)).toBeInTheDocument();
    expect(creditsServiceModule.deductCredit).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    vi.mocked(aiClientModule.generateAIResponse).mockResolvedValueOnce('  ');
    fireEvent.click(screen.getByRole('button', { name: /Aprimorar Estilo/ }));
    expect(await screen.findByText(/não retornou uma sugestão/)).toBeInTheDocument();
    expect(creditsServiceModule.deductCredit).not.toHaveBeenCalled();
  });

  it('shows a failed debit and leaves the original text unchanged', async () => {
    vi.mocked(aiClientModule.generateAIResponse).mockResolvedValue('Novo texto');
    vi.mocked(creditsServiceModule.deductCredit).mockRejectedValueOnce(
      new Error('Débito indisponível'),
    );
    const replace = vi.fn();
    render(
      <AIActionMenu
        selectedText="Texto original"
        userId="author"
        userCredits={10}
        onInsertText={vi.fn()}
        onReplaceSelection={replace}
        onOpenBYOKSettings={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Abrir Assistente/ }));
    fireEvent.click(screen.getByRole('button', { name: /Aprimorar Estilo/ }));
    await screen.findByText('Novo texto');
    fireEvent.click(screen.getByRole('button', { name: /Substituir Seleção/ }));
    expect(await screen.findByText('Débito indisponível')).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it('accepts a generated BYOK result without platform credits even after settings change', async () => {
    vi.mocked(byokStorageModule.getBYOKConfig).mockReturnValue({
      provider: 'openai_byok',
      openaiApiKey: 'test-key',
    });
    vi.mocked(aiClientModule.generateAIResponse).mockResolvedValue('Novo texto BYOK');
    const replace = vi.fn();
    render(
      <AIActionMenu
        selectedText="Texto original"
        userId="author"
        userCredits={0}
        onInsertText={vi.fn()}
        onReplaceSelection={replace}
        onOpenBYOKSettings={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Abrir Assistente/ }));
    fireEvent.click(screen.getByRole('button', { name: /Aprimorar Estilo/ }));
    await screen.findByText('Novo texto BYOK');
    vi.mocked(byokStorageModule.getBYOKConfig).mockReturnValue({ provider: 'firebase_ai' });
    fireEvent.click(screen.getByRole('button', { name: /Substituir Seleção/ }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('Novo texto BYOK'));
    expect(creditsServiceModule.deductCredit).not.toHaveBeenCalled();
  });

  it('uses selected text captured on open and refuses to generate without any chapter context', async () => {
    const props = {
      userId: 'author',
      userCredits: 10,
      onInsertText: vi.fn(),
      onReplaceSelection: vi.fn(),
      onOpenBYOKSettings: vi.fn(),
    };
    const { rerender } = render(<AIActionMenu {...props} />);
    fireEvent.click(screen.getByRole('button', { name: /Abrir Assistente/ }));
    fireEvent.click(screen.getByRole('button', { name: /Continuar Cena/ }));
    expect(await screen.findByText(/Escreva ou selecione/)).toBeInTheDocument();
    expect(aiClientModule.generateAIResponse).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    vi.mocked(aiClientModule.generateAIResponse).mockResolvedValue('Gerado');
    rerender(<AIActionMenu {...props} onGetSelectedText={() => 'Seleção capturada'} />);
    fireEvent.click(screen.getByRole('button', { name: /Abrir Assistente/ }));
    fireEvent.click(screen.getByRole('button', { name: /Continuar Cena/ }));
    await screen.findByText('Gerado');
    expect(vi.mocked(aiClientModule.generateAIResponse).mock.calls[0]?.[0].prompt).toContain(
      'Seleção capturada',
    );
  });
});
