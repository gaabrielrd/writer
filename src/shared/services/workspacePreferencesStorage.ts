export const contentWidths = ['small', 'medium', 'large'] as const;
export type ContentWidth = (typeof contentWidths)[number];
const STORAGE_KEY = 'writer:workspace-content-width';

export function readContentWidth(): ContentWidth {
  if (typeof window === 'undefined') return 'medium';
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return contentWidths.find((width) => width === value) ?? 'medium';
  } catch {
    return 'medium';
  }
}

export function saveContentWidth(value: ContentWidth): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // A escolha continua ativa nesta sessão quando o armazenamento está indisponível.
  }
}
