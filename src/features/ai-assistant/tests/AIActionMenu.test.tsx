import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
    vi.clearAllMocks();
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

    const insertBtn = screen.getByRole('button', {
      name: /Inserir no Texto/i,
    });
    fireEvent.click(insertBtn);

    expect(onInsertText).toHaveBeenCalledWith('Os ventos sussurravam antigos segredos.');
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

    expect(onReplaceSelection).toHaveBeenCalledWith('Texto reescrito com elegância.');
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
});
