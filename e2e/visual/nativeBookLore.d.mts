import type { Page } from '@playwright/test';
export interface NativeLoreFixture {
  readonly calls: { name: string; input: unknown; uid: string }[];
}
export function installNativeBookLore(page: Page): Promise<NativeLoreFixture>;
