import { test, expect, capture, expectNoHorizontalOverflow } from './support';
import { FIXTURE_BOOK_ID } from './fixtures/data';
test('modo versionado: orientação impede redação, supervisão exige decisão e histórico preserva o modo anterior', async ({
  page,
}, testInfo) => {
  if (testInfo.project.name.startsWith('mobile-'))
    await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/books/' + FIXTURE_BOOK_ID);
  await page.getByRole('tab', { name: 'Produção literária' }).click();
  await page.getByRole('combobox', { name: 'Método de colaboração' }).click();
  await page.getByRole('option', { name: 'Orientação', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar contrato e decisões' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Revisão 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Preparação do capítulo', exact: true }).click();
  await page.getByRole('button', { name: 'Consultar capítulos', exact: true }).click();
  await page.getByRole('combobox', { name: 'Capítulo em preparação', exact: true }).click();
  await page.getByRole('option', { name: 'Capítulo preparado', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Redação do capítulo por cenas' });
  await expect(panel.getByText(/Orientação: conduza a escrita/)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Registrar redação do capítulo' })).toBeDisabled();
  await panel.scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(page, 'colaboracao-orientacao');
  await capture(page, testInfo, 'colaboracao-orientacao');
  await page.getByRole('button', { name: 'Contrato e decisões', exact: true }).click();
  await page.getByRole('combobox', { name: 'Método de colaboração' }).click();
  await page.getByRole('option', { name: 'Execução supervisionada', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar contrato e decisões' }).click();
  await expect(page.getByText('Revisão 2', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Consultar histórico', exact: true }).click();
  await page.getByRole('button', { name: 'Consultar revisão 1', exact: true }).click();
  await expect(
    page
      .getByRole('region', { name: 'Versão histórica' })
      .getByText('Método de colaboração: Orientação', { exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Preparação do capítulo', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Registrar redação do capítulo' })).toBeEnabled();
  await panel.getByRole('combobox', { name: 'Execução da primeira versão' }).click();
  await page.getByRole('option', { name: 'Contínuo com limites', exact: true }).click();
  await expect(
    panel.getByRole('button', { name: 'Autorizar redação contínua do capítulo' }),
  ).toBeDisabled();
  await expectNoHorizontalOverflow(page, 'colaboracao-supervisao');
});
