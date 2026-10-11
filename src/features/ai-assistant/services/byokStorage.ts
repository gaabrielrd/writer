import { validateBYOKConfig, type BYOKConfig } from '../model/byokConfig';

const STORAGE_KEY = 'writer_byok_config';
let revision = 0;
const listeners = new Set<() => void>();
const changed = () => {
  revision++;
  listeners.forEach((listener) => listener());
};
export const getBYOKRevision = () => revision;
export function subscribeBYOKConfig(listener: () => void) {
  listeners.add(listener);
  const storageChanged = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) changed();
  };
  window.addEventListener('storage', storageChanged);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', storageChanged);
  };
}

export function getBYOKConfig(): BYOKConfig {
  if (typeof localStorage === 'undefined') {
    return { provider: 'firebase_ai' };
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { provider: 'firebase_ai' };
    const parsed = JSON.parse(raw) as Partial<BYOKConfig> | null;
    if (!parsed || typeof parsed !== 'object') return { provider: 'firebase_ai' };
    const config: BYOKConfig = {
      provider: parsed.provider ?? 'firebase_ai',
      geminiApiKey: typeof parsed.geminiApiKey === 'string' ? parsed.geminiApiKey : undefined,
      openaiApiKey: typeof parsed.openaiApiKey === 'string' ? parsed.openaiApiKey : undefined,
      customModel: typeof parsed.customModel === 'string' ? parsed.customModel : undefined,
    };
    return validateBYOKConfig(config).isValid ? config : { provider: 'firebase_ai' };
  } catch {
    return { provider: 'firebase_ai' };
  }
}

export function saveBYOKConfig(config: BYOKConfig): void {
  if (typeof localStorage === 'undefined') throw new Error('Armazenamento local indisponível.');

  const validation = validateBYOKConfig(config);
  if (!validation.isValid) throw new Error(validation.error);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    throw new Error(
      'Não foi possível salvar a chave neste navegador. Verifique o armazenamento local.',
    );
  }
  changed();
}

export function clearBYOKConfig(): void {
  if (typeof localStorage === 'undefined') throw new Error('Armazenamento local indisponível.');

  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    throw new Error('Não foi possível remover a chave deste navegador.');
  }
  changed();
}
