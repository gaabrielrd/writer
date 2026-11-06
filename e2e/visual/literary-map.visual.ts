import { test, expect, capture, expectNoHorizontalOverflow } from './support';
import { FIXTURE_BOOK_ID } from './fixtures/data';
test('mapa global: ordem de leitura, cronologia, conhecimento e campos temporais distintos', async ({
  page,
}, testInfo) => {
  if (testInfo.project.name.startsWith('mobile-'))
    await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/books/' + FIXTURE_BOOK_ID);
  await page.getByRole('tab', { name: 'Produção literária' }).click();
  await page.getByRole('button', { name: 'Mapa global do livro', exact: true }).click();
  const map = page.getByRole('region', { name: 'Mapa global do livro' });
  await expect(map.getByText('Estrutura e fichas carregadas', { exact: true })).toBeVisible();
  const links = map.getByRole('link');
  await expect(links).toHaveText(['1. A carta no porto', '2. A travessia']);
  await expect(map.getByText('O leitor ainda não sabe a data', { exact: true })).toBeVisible();
  await links.first().scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(page, 'mapa-ordem-de-leitura');
  await capture(page, testInfo, 'mapa-ordem-de-leitura');
  await map.getByRole('button', { name: 'Cronologia real', exact: true }).click();
  await expect(map.getByRole('heading', { level: 4 })).toHaveText([
    'Antes da partida',
    'A chegada',
  ]);
  await expect(map.getByText('Momento real: Três dias antes da chegada')).toBeVisible();
  await expectNoHorizontalOverflow(page, 'mapa-cronologia-real');
  await capture(page, testInfo, 'mapa-cronologia-real');
  await map.getByRole('button', { name: 'Trajetória de personagem', exact: true }).click();
  const trajectory = map.getByRole('region', { name: 'Trajetória editorial' });
  await expect(trajectory.getByRole('article', { name: 'Ana recebe a notícia' })).toBeVisible();
  await trajectory.getByRole('combobox', { name: 'Ordenar trajetória por' }).click();
  await page.getByRole('option', { name: 'Cronologia real', exact: true }).click();
  await expect(trajectory.getByText('Uma carta entregue no porto', { exact: true })).toBeVisible();
  await trajectory
    .getByText('Uma carta entregue no porto', { exact: true })
    .scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(page, 'mapa-trajetoria');
  await capture(page, testInfo, 'mapa-trajetoria');
  await map.getByRole('button', { name: 'Ordem de leitura', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(map.getByRole('button', { name: 'Ordem de leitura', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await map.getByRole('button', { name: 'Atualizar mapa', exact: true }).click();
  await expect(map.getByText('Estrutura e fichas carregadas', { exact: true })).toBeVisible();
  await expect(map.getByRole('link')).toHaveCount(2);
});
