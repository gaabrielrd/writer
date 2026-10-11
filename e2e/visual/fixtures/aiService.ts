import { author } from './data';
import { fixtureDetections } from './loreAnalysisService';

let credits = author.credits;

// Keep autocomplete quiet and deterministic; the production hook and menus still render.
export function generateAIResponse(options?: {
  json?: boolean;
  prompt?: string;
  systemInstruction?: string;
}): Promise<string> {
  sessionStorage.setItem('writer_fixture_ai_system', options?.systemInstruction ?? '');
  if (
    options?.prompt?.includes('[INSTRUÇÃO]:') &&
    sessionStorage.getItem('writer_fixture_ai_actions') === 'true'
  ) {
    const count = Number(sessionStorage.getItem('writer_fixture_ai_action_calls') ?? 0);
    sessionStorage.setItem('writer_fixture_ai_action_calls', String(count + 1));
    sessionStorage.setItem('writer_fixture_ai_action_prompt', options.prompt);
    return Promise.resolve('O trecho ganhou novos detalhes.');
  }
  if (!options?.json && sessionStorage.getItem('writer_fixture_autocomplete') === 'true') {
    const count = Number(sessionStorage.getItem('writer_fixture_autocomplete_calls') ?? 0);
    sessionStorage.setItem('writer_fixture_autocomplete_calls', String(count + 1));
    return Promise.resolve('A noite trouxe uma nova descoberta.');
  }
  return Promise.resolve(options?.json ? JSON.stringify({ entities: fixtureDetections }) : '');
}

export function getUserCredits(): Promise<number> {
  return Promise.resolve(credits);
}

export function deductCredit(userId: string, amount = 1): Promise<number> {
  if (userId !== author.uid) throw new Error('A prévia permite somente a conta fictícia.');
  credits = Math.max(0, credits - amount);
  return Promise.resolve(credits);
}

export function addCredits(userId: string, amount: number): Promise<number> {
  if (userId !== author.uid) throw new Error('A prévia permite somente a conta fictícia.');
  credits += amount;
  return Promise.resolve(credits);
}
