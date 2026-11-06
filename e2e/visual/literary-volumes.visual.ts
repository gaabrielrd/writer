import { test, expect, capture, expectNoHorizontalOverflow } from './support';
import { FIXTURE_BOOK_ID } from './fixtures/data';
test('continuidade: volumes paginados e capítulos homônimos conservam suas origens sem alterar o manuscrito', async ({
  page,
}, testInfo) => {
  if (testInfo.project.name.startsWith('mobile-'))
    await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/books/' + FIXTURE_BOOK_ID);
  await page.getByRole('tab', { name: 'Produção literária' }).click();
  await page.getByRole('button', { name: 'Planejamento', exact: true }).click();
  await page.getByRole('combobox', { name: 'Documento', exact: true }).click();
  await page.getByRole('option', { name: 'Continuidade entre volumes', exact: true }).click();
  await page.getByRole('button', { name: 'Preparar documento', exact: true }).click();
  await page.getByLabel('Título do documento', { exact: true }).fill('A carta entre os portos');
  await page
    .getByLabel('Fatos e estado herdados', { exact: true })
    .fill('A carta foi entregue, mas a resposta permanece uma reserva.');
  await page.getByRole('combobox', { name: 'Origem da referência', exact: true }).click();
  await page.getByRole('option', { name: 'Unidade de outro volume', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Tipo de vínculo', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Consultar meus volumes', exact: true }).click();
  await page.getByRole('combobox', { name: 'Volume de origem', exact: true }).click();
  await page.getByRole('option', { name: /O primeiro porto/ }).click();
  await page.getByRole('button', { name: 'Consultar referências', exact: true }).click();
  await page
    .getByRole('button', { name: 'Vincular O primeiro porto · Capítulo · A carta', exact: true })
    .click();
  await page.getByRole('button', { name: 'Mais volumes', exact: true }).click();
  await page.getByRole('combobox', { name: 'Volume de origem', exact: true }).click();
  await page.getByRole('option', { name: /O segundo porto/ }).click();
  await page.getByRole('button', { name: 'Consultar referências', exact: true }).click();
  await page
    .getByRole('button', { name: 'Vincular O segundo porto · Capítulo · A carta', exact: true })
    .click();
  const first = page
    .getByRole('listitem')
    .filter({ hasText: 'Unidade de outro volume · O primeiro porto' });
  const second = page
    .getByRole('listitem')
    .filter({ hasText: 'Unidade de outro volume · O segundo porto' });
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  await expect(page.getByLabel('Fatos e estado herdados', { exact: true })).toHaveValue(
    'A carta foi entregue, mas a resposta permanece uma reserva.',
  );
  await page.getByRole('button', { name: 'Salvar documento', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('Documento salvo como revisão 1.', { exact: true })).toBeVisible();
  await first.scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(page, 'continuidade-volumes');
  await capture(page, testInfo, 'continuidade-volumes');
});
