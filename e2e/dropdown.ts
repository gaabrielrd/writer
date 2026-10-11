import type { Locator } from '@playwright/test';

export const themeLabels: Record<string, string> = {
  light: 'Claro',
  dark: 'Escuro',
  sepia: 'Sépia (Pergaminho)',
  system: 'Sistema',
};

export async function chooseDropdown(trigger: Locator, label: string) {
  await trigger.click();
  await trigger.page().getByRole('option', { name: label, exact: true }).click();
}
