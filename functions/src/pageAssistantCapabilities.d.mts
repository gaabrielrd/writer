export interface PageCapability {
  id: string;
  label: string;
  kind: 'action' | 'field' | 'select';
  options?: string[];
}
export interface PageAction {
  id: string;
  value?: string;
}
export function normalizePageCapabilities(value: unknown): PageCapability[];
export function pageProviderCapabilities(value: PageCapability[]): PageCapability[];
export function normalizePageAction(
  value: unknown,
  capabilities: PageCapability[],
): PageAction | null;
