import { author } from './data';

let credits = author.credits;

// Keep autocomplete quiet and deterministic; the production hook and menus still render.
export function generateAIResponse(): Promise<string> {
  return Promise.resolve('');
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
