import type { BYOKConfig } from '../model/byokConfig';

const STORAGE_KEY = 'writer_byok_config';

export function getBYOKConfig(): BYOKConfig {
  if (typeof localStorage === 'undefined') {
    return { provider: 'firebase_ai' };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { provider: 'firebase_ai' };
    const parsed = JSON.parse(raw) as Partial<BYOKConfig>;
    return {
      provider: parsed.provider ?? 'firebase_ai',
      geminiApiKey: parsed.geminiApiKey,
      openaiApiKey: parsed.openaiApiKey,
      customModel: parsed.customModel,
    };
  } catch {
    return { provider: 'firebase_ai' };
  }
}

export function saveBYOKConfig(config: BYOKConfig): void {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // Falha silenciosa de localStorage
  }
}

export function clearBYOKConfig(): void {
  if (typeof localStorage === 'undefined') return;

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Falha silenciosa
  }
}
