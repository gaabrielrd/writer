import { test, expect, capture, expectNoHorizontalOverflow } from './support';
import { FIXTURE_BOOK_ID } from './fixtures/data';
test('auditoria global: inventário sem IA, prévia segmentada, cobertura separada e aceite explícito', async ({
  page,
}, testInfo) => {
  if (testInfo.project.name.startsWith('mobile-'))
    await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/books/' + FIXTURE_BOOK_ID);
  await page.getByRole('tab', { name: 'Produção literária' }).click();
  await page.getByRole('button', { name: 'Integração de atos e livro', exact: true }).click();
  await page.getByRole('combobox', { name: 'Cobertura do planejamento' }).click();
  await page.getByRole('option', { name: 'Auditoria global da arquitetura' }).click();
  await expect(page.getByRole('combobox', { name: 'Escopo da integração' })).toBeDisabled();
  await page.getByRole('button', { name: 'Registrar integração', exact: true }).click();
  const checkpoint = page.getByRole('region', { name: 'Checkpoint da integração' });
  await expect(checkpoint.getByText('Organizando fontes', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Preparar inventário sem IA', exact: true }).click();
  await expect(checkpoint.getByText(/Inventário arquitetural percorrido/)).toBeVisible();
  await expect(checkpoint.getByText(/0 de 13 fontes lidas/)).toBeVisible();
  await page.getByRole('button', { name: 'Conferir fontes da arquitetura', exact: true }).click();
  await page.getByRole('button', { name: /Prévia da fonte 1/ }).click();
  await expect(page.getByLabel('Fonte enviada à auditoria')).toHaveValue(/Uma carta muda/);
  await expect(page.getByLabel('Fonte enviada à auditoria')).toHaveAttribute('readonly', '');
  await page.getByLabel('Fonte enviada à auditoria').scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(page, 'auditoria-previa-inicial');
  await capture(page, testInfo, 'auditoria-previa-inicial');
  await page.getByRole('button', { name: 'Próximo trecho da fonte', exact: true }).click();
  await expect(page.getByLabel('Fonte enviada à auditoria')).toHaveValue(/reserva sobre a irmã/);
  await page.getByRole('button', { name: 'Trecho anterior da fonte', exact: true }).click();
  await expect(page.getByLabel('Fonte enviada à auditoria')).toHaveValue(/Uma carta muda/);
  await page.getByRole('button', { name: 'Retomar integração até concluir', exact: true }).click();
  await expect(
    checkpoint.getByText('Cobertura integrada concluída', { exact: true }),
  ).toBeVisible();
  await expect(checkpoint.getByText(/13 de 13 fontes lidas/)).toBeVisible();
  await expect(checkpoint.getByText(/Arquitetura conferida para estas versões/)).toBeVisible();
  await expect(page.getByText(/Aceite autoral registrado/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Consultar matriz e análises', exact: true }).click();
  await page.getByRole('button', { name: /2 · Síntese de evidências/ }).click();
  const evidence = page.getByRole('region', { name: 'Evidências da integração' });
  await expect(evidence.getByText(/A promessa e os plantios foram confrontados/)).toBeVisible();
  await evidence.getByText('Análises incluídas nesta síntese', { exact: true }).click();
  await evidence.getByRole('button', { name: 'Abrir análise de apoio 1', exact: true }).click();
  await expect(evidence.getByText(/uma proposta, não um acontecimento comprovado/)).toBeVisible();
  await evidence.scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(page, 'auditoria-evidencias');
  await capture(page, testInfo, 'auditoria-evidencias');
  await page.getByRole('button', { name: 'Registrar aceite da integração', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/A publicação permanece uma ação separada/)).toBeVisible();
});
