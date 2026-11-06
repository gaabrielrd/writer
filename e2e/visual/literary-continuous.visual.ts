import { test, expect, capture, expectNoHorizontalOverflow } from './support';
import { FIXTURE_BOOK_ID } from './fixtures/data';
test('primeira versão contínua: limite, pausa no servidor e nova autorização sem aceite por cena', async ({
  page,
}, testInfo) => {
  if (testInfo.project.name.startsWith('mobile-'))
    await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/books/' + FIXTURE_BOOK_ID);
  await page.getByRole('tab', { name: 'Produção literária' }).click();
  await page.getByRole('combobox', { name: 'Método de colaboração' }).click();
  await page
    .getByRole('option', { name: 'Execução contínua com escopo e limites', exact: true })
    .click();
  await page.getByRole('button', { name: 'Salvar contrato e decisões' }).click();
  await expect(page.getByText('Revisão 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Preparação do capítulo', exact: true }).click();
  await page.getByRole('button', { name: 'Consultar capítulos', exact: true }).click();
  await page.getByRole('combobox', { name: 'Capítulo em preparação', exact: true }).click();
  await page.getByRole('option', { name: 'Capítulo preparado', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Redação do capítulo por cenas' });
  await panel.getByRole('combobox', { name: 'Execução da primeira versão' }).click();
  await page.getByRole('option', { name: 'Contínuo com limites' }).click();
  await panel.getByLabel('Limite total de aplicações').fill('1');
  await panel.getByLabel('Limite total de créditos').fill('1');
  await panel.getByRole('button', { name: 'Autorizar redação contínua do capítulo' }).click();
  await panel.getByRole('button', { name: 'Retomar até a próxima decisão' }).click();
  await expect(panel.getByText(/Limite autorizado atingido/)).toBeVisible();
  await expect(panel.getByText('Contínuo: 1 de 1 aplicações · 1 de 1 créditos.')).toBeVisible();
  await panel.getByRole('button', { name: 'Pausar autorização no servidor' }).click();
  await expect(panel.getByText(/Autorização pausada no servidor/)).toBeVisible();
  await panel.getByLabel('Limite total de aplicações').fill('2');
  await panel.getByLabel('Limite total de créditos').fill('2');
  await panel.getByRole('button', { name: 'Autorizar estes limites e modo' }).focus();
  await page.keyboard.press('Enter');
  await panel.getByRole('button', { name: 'Retomar até a próxima decisão' }).click();
  await expect(panel.getByText('Primeira versão preservada', { exact: true })).toBeVisible();
  await expect(panel.getByText('Contínuo: 2 de 2 aplicações · 2 de 2 créditos.')).toBeVisible();
  await expect(panel.getByRole('button', { name: /Revisar aceite desta cena/ })).toHaveCount(0);
  await panel.scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(page, 'redacao-continua');
  await capture(page, testInfo, 'redacao-continua');
});
