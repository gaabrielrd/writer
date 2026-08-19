import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { BYOKSettingsDialog } from '../components/BYOKSettingsDialog';
import * as byokStorageModule from '../services/byokStorage';

vi.mock('../services/byokStorage');

describe('BYOKSettingsDialog component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(byokStorageModule.getBYOKConfig).mockReturnValue({
      provider: 'firebase_ai',
    });
  });

  it('renderiza e permite trocar de provedor para Gemini e salvar', () => {
    const onConfigChanged = vi.fn();
    render(<BYOKSettingsDialog open={true} onClose={vi.fn()} onConfigChanged={onConfigChanged} />);

    expect(screen.getByText('Configurações de Inteligência Artificial')).toBeInTheDocument();

    const select = screen.getByLabelText(/Provedor de IA/i);
    fireEvent.change(select, { target: { value: 'gemini_byok' } });

    const keyInput = screen.getByLabelText(/Chave de API do Google Gemini/i);
    fireEvent.change(keyInput, { target: { value: 'AIzaSy123456' } });

    const customModelInput = screen.getByLabelText(/Modelo Personalizado \(Opcional\)/i);
    fireEvent.change(customModelInput, { target: { value: 'gemini-3.7-flash' } });

    const submitBtn = screen.getByRole('button', {
      name: /Salvar Preferências/i,
    });
    fireEvent.click(submitBtn);

    expect(byokStorageModule.saveBYOKConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'gemini_byok',
        geminiApiKey: 'AIzaSy123456',
        customModel: 'gemini-3.7-flash',
      }),
    );
    expect(screen.getByText(/Configurações salvas com sucesso/i)).toBeInTheDocument();
  });

  it('permite trocar de provedor para OpenAI e salvar', () => {
    const onConfigChanged = vi.fn();
    render(<BYOKSettingsDialog open={true} onClose={vi.fn()} onConfigChanged={onConfigChanged} />);

    const select = screen.getByLabelText(/Provedor de IA/i);
    fireEvent.change(select, { target: { value: 'openai_byok' } });

    const keyInput = screen.getByLabelText(/Chave de API da OpenAI/i);
    fireEvent.change(keyInput, { target: { value: 'sk-abcdef12345' } });

    const customModelInput = screen.getByLabelText(/Modelo Personalizado \(Opcional\)/i);
    fireEvent.change(customModelInput, { target: { value: 'gpt-4o' } });

    const submitBtn = screen.getByRole('button', {
      name: /Salvar Preferências/i,
    });
    fireEvent.click(submitBtn);

    expect(byokStorageModule.saveBYOKConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'openai_byok',
        openaiApiKey: 'sk-abcdef12345',
        customModel: 'gpt-4o',
      }),
    );
  });

  it('permite restaurar configuracao padrao', () => {
    vi.mocked(byokStorageModule.getBYOKConfig).mockReturnValue({
      provider: 'openai_byok',
      openaiApiKey: 'sk-test',
    });

    const onConfigChanged = vi.fn();
    render(<BYOKSettingsDialog open={true} onClose={vi.fn()} onConfigChanged={onConfigChanged} />);

    const resetBtn = screen.getByRole('button', {
      name: /Restaurar Padrão/i,
    });
    fireEvent.click(resetBtn);

    expect(byokStorageModule.clearBYOKConfig).toHaveBeenCalled();
    expect(onConfigChanged).toHaveBeenCalledWith({ provider: 'firebase_ai' });
  });

  it('exibe erro ao tentar salvar sem chave obrigatoria', () => {
    render(<BYOKSettingsDialog open={true} onClose={vi.fn()} />);

    const select = screen.getByLabelText(/Provedor de IA/i);
    fireEvent.change(select, { target: { value: 'openai_byok' } });

    const form = screen.getByRole('dialog').querySelector('form');
    if (form) fireEvent.submit(form);

    expect(screen.getByText(/Chave de API da OpenAI é obrigatória/i)).toBeInTheDocument();
  });
});
