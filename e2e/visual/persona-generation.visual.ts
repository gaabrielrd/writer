import {
  test,
  expect,
  capture,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
} from './support';
import { chooseDropdown } from '../dropdown';
test('cria voz por universo e lore com revisão, zero, salvamento e retorno de foco', async ({
  page,
}, testInfo) => {
  await page.goto('/universes');
  await page.getByRole('button', { name: 'Criar primeiro universo' }).click();
  await page.getByLabel('Nome do universo').fill('Universo das Marés');
  await page.getByLabel('Descrição do universo').fill('Ilhas silenciosas e memórias de viagens.');
  await page.getByRole('button', { name: 'Salvar universo' }).click();
  await page.getByRole('link', { name: 'Abrir lore' }).click();
  await page.getByRole('button', { name: 'Nova Entidade' }).click();
  await page.getByLabel('Nome da Entidade').fill('Farol');
  await page.getByLabel(/Resumo Curto/).fill('Guia silencioso das ilhas.');
  await page.getByRole('button', { name: 'Cadastrar Entidade' }).click();
  await page.goto('/settings/ai');
  await page.getByRole('button', { name: 'Criar com IA' }).click();
  await chooseDropdown(
    page.getByRole('combobox', { name: 'Universo da persona' }),
    'Universo das Marés',
  );
  await page.getByRole('button', { name: 'Incluir Farol' }).click();
  await page.getByLabel('Intenção para a voz (opcional)').fill('Uma voz íntima e contemplativa.');
  await page.getByRole('button', { name: 'Conferir contexto' }).click();
  await expect(
    page.getByRole('heading', { name: 'Contexto conferido: Universo das Marés' }),
  ).toBeVisible();
  await page.getByText('Conteúdo completo que será enviado à IA').click();
  await expect(page.getByRole('dialog')).toContainText('Guia silencioso das ilhas.');
  await expect(page.getByRole('button', { name: 'Salvar persona' })).toHaveCount(0);
  await expectDialogWithinViewport(page);
  await expectNoHorizontalOverflow(page, 'contexto de persona');
  await capture(page, testInfo, 'persona-contexto');
  await page.getByRole('button', { name: 'Gerar persona' }).click();
  await expect(page.getByLabel('Nome da persona', { exact: true })).toHaveValue('Voz das marés');
  const humor = page.getByRole('slider', { name: 'Humor e ironia', exact: true });
  await humor.focus();
  await humor.press('Home');
  await expect(humor).toHaveValue('0');
  await page.getByLabel('Nome da persona', { exact: true }).fill('Minha voz das marés');
  await page.setViewportSize({ width: 320, height: 568 });
  await expectDialogWithinViewport(page);
  await expectNoHorizontalOverflow(page, 'revisão em 320 px');
  await capture(page, testInfo, 'persona-revisao-320');
  await page.getByRole('button', { name: 'Salvar persona' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Criar com IA' })).toBeFocused();
  await expect(
    page.getByRole('button', { name: 'Ver detalhes de Minha voz das marés' }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Ver detalhes de Minha voz das marés' }).click();
  await expect(
    page.getByRole('progressbar', { name: 'Humor e ironia', exact: true }),
  ).toHaveAttribute('value', '0');
});
