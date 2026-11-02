import { test, expect, capture, expectNoHorizontalOverflow } from './support';
import { chooseDropdown } from '../dropdown';

test('configura Firebase e BYOK em duas etapas e preserva preferências após recarregar', async ({
  page,
}, testInfo) => {
  await page.goto('/settings/ai?tab=provider');
  const mode = page.getByRole('combobox', { name: 'Como deseja usar a IA?' });
  await expect(mode).toContainText('Firebase AI Logic');
  await expect(page.getByRole('combobox', { name: 'Modelo da plataforma' })).toContainText(
    'Gemini 3.8 Flash',
  );
  await expect(page.getByText(/temperatur/i)).toHaveCount(0);
  await chooseDropdown(
    page.getByRole('combobox', { name: 'Modelo da plataforma' }),
    'Gemini 4 Argon',
  );
  await chooseDropdown(page.getByRole('combobox', { name: 'Raciocínio padrão' }), 'Alto');
  await page.getByRole('button', { name: 'Salvar Preferências' }).click();
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Modelo da plataforma' })).toContainText(
    'Gemini 4 Argon',
  );
  await expect(page.getByRole('combobox', { name: 'Raciocínio padrão' })).toContainText('Alto');
  await capture(page, testInfo, 'firebase-modelo-raciocinio');
  await chooseDropdown(mode, 'Chave própria — BYOK');
  await expect(page.getByRole('combobox', { name: 'Modelo da plataforma' })).toHaveCount(0);
  await page.getByLabel('Chave de API do Google Gemini (AI Studio)').fill('chave-ficticia');
  await page.getByLabel('Modelo Personalizado (Opcional)').fill('gemini-custom');
  await chooseDropdown(page.getByRole('combobox', { name: 'Provedor BYOK' }), 'OpenAI API');
  await page.getByLabel('Chave de API da OpenAI').fill('outra-chave-ficticia');
  await page.getByLabel('Modelo Personalizado (Opcional)').fill('openai-custom');
  await chooseDropdown(page.getByRole('combobox', { name: 'Provedor BYOK' }), 'Google Gemini API');
  await expect(page.getByLabel('Modelo Personalizado (Opcional)')).toHaveValue('gemini-custom');
  await page.getByRole('button', { name: 'Salvar Preferências' }).click();
  await page.reload();
  await expect(page.getByLabel('Modelo Personalizado (Opcional)')).toHaveValue('gemini-custom');
  await capture(page, testInfo, 'byok-google');
  await page.setViewportSize({ width: 320, height: 740 });
  await expectNoHorizontalOverflow(page, 'provedor-320px');
  await capture(page, testInfo, 'byok-320px');
  await page.getByRole('button', { name: 'Restaurar Padrão' }).click();
  await expect(mode).toContainText('Firebase AI Logic');
  await expect(page.getByRole('combobox', { name: 'Modelo da plataforma' })).toContainText(
    'Gemini 3.8 Flash',
  );
  await expect(page.getByRole('combobox', { name: 'Raciocínio padrão' })).toContainText('Médio');
  await page.reload();
  await expect(page.getByRole('tab', { name: 'Provedor', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.getByRole('tab', { name: 'Personas', exact: true }).click();
  await expect(
    page.getByRole('region', { name: 'Inteligência artificial', exact: true }),
  ).toBeVisible();
});
