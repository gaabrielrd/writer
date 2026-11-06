import { test, expect, capture, expectNoHorizontalOverflow } from './support';
import { FIXTURE_BOOK_ID } from './fixtures/data';
test('síntese global: destinos paginados, marcos homônimos e intenção preservada sem confirmar alteração', async ({
  page,
}, testInfo) => {
  if (testInfo.project.name.startsWith('mobile-'))
    await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/books/' + FIXTURE_BOOK_ID);
  await page.getByRole('tab', { name: 'Produção literária' }).click();
  await page.getByRole('button', { name: 'Integração de atos e livro', exact: true }).click();
  await page.getByRole('combobox', { name: 'Cobertura do planejamento' }).click();
  await page.getByRole('option', { name: 'Auditoria global da arquitetura' }).click();
  await page.getByRole('button', { name: 'Registrar integração', exact: true }).click();
  await page.getByRole('button', { name: 'Retomar integração até concluir', exact: true }).click();
  await expect(page.getByText('Cobertura integrada concluída', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Consultar matriz e análises', exact: true }).click();
  await page.getByRole('button', { name: /2 · Síntese de evidências/ }).click();
  await page.getByRole('button', { name: 'Tratar este achado', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Decisão editorial sobre achado' });
  await panel
    .getByLabel('Justificativa da decisão')
    .fill('A virada da irmã só ocorre depois da entrega da carta.');
  await panel.getByRole('combobox', { name: 'Decisão editorial' }).click();
  await page.getByRole('option', { name: 'Planejar correção', exact: true }).click();
  await panel.getByText('Consultar outros destinos do livro', { exact: true }).click();
  await panel
    .getByRole('button', { name: 'Mais destinos da arquitetura lida', exact: true })
    .click();
  await panel.getByRole('combobox', { name: 'Destino da alteração' }).click();
  await expect(page.getByRole('option', { name: /arco arco-ana/ })).toBeVisible();
  await page.getByRole('option', { name: /arco arco-irma/ }).click();
  await panel
    .getByRole('button', { name: 'Mais destinos da arquitetura lida', exact: true })
    .click();
  await expect(panel.getByLabel('Justificativa da decisão')).toHaveValue(
    'A virada da irmã só ocorre depois da entrega da carta.',
  );
  await expect(panel.getByRole('combobox', { name: 'Destino da alteração' })).toContainText(
    'arco-irma',
  );
  await expect(
    panel.getByText('Destino selecionado: Marco de arco · Virada · arco arco-irma', {
      exact: true,
    }),
  ).toBeVisible();
  await panel.getByRole('button', { name: 'Salvar decisão do achado', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(panel.getByText(/Correção planejada · revisão 1/)).toBeVisible();
  await expect(panel.getByText(/Alteração salva e integração sucessora conferidas/)).toHaveCount(0);
  await panel.scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(page, 'reconciliacao-planejada');
  await capture(page, testInfo, 'reconciliacao-planejada');
});
