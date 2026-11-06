import { test, expect, capture, expectNoHorizontalOverflow } from './support';
import { FIXTURE_BOOK_ID } from './fixtures/data';
test('ciclo do capítulo: primeira versão, passagens explícitas, revisão e versão revisada com pausa persistida', async ({
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
  const cycle = page.getByRole('region', { name: 'Ciclo editorial do capítulo' });
  await cycle.getByRole('combobox', { name: 'Passagem: Primeira versão' }).click();
  await page.getByRole('option', { name: 'Autorizar passagem contínua', exact: true }).click();
  await cycle.getByRole('button', { name: 'Registrar novo ciclo deste capítulo' }).click();
  await expect(cycle.getByText('Preparação e gate', { exact: true })).toBeVisible();
  await cycle.getByRole('button', { name: 'Retomar ciclo até a próxima decisão' }).click();
  await expect(
    cycle.getByRole('button', { name: 'Aceitar primeira versão e iniciar revisão' }),
  ).toBeVisible();
  await cycle.getByRole('button', { name: 'Pausar ciclo no servidor' }).click();
  await expect(cycle.getByText(/Ciclo pausado no servidor/)).toBeVisible();
  await expect(
    cycle.getByRole('button', { name: 'Aceitar primeira versão e iniciar revisão' }),
  ).toBeDisabled();
  await cycle.getByRole('button', { name: 'Autorizar estes limites e retomar ciclo' }).click();
  await cycle.getByRole('button', { name: 'Aceitar primeira versão e iniciar revisão' }).focus();
  await page.keyboard.press('Enter');
  await cycle.getByRole('button', { name: 'Retomar ciclo até a próxima decisão' }).click();
  await expect(
    cycle.getByRole('button', { name: 'Aceitar revisão e preservar versão revisada' }),
  ).toBeVisible();
  await cycle.getByRole('button', { name: 'Aceitar revisão e preservar versão revisada' }).click();
  await cycle.getByRole('button', { name: 'Retomar ciclo até a próxima decisão' }).click();
  await expect(cycle.getByText('Ciclo do capítulo concluído', { exact: true })).toBeVisible();
  await expect(cycle.getByText(/2 de 2 aplicações · 2 de 2 créditos/)).toBeVisible();
  await expect(cycle.getByText(/Primeira versão e versão revisada preservadas/)).toBeVisible();
  await cycle.scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(page, 'ciclo-editorial');
  await capture(page, testInfo, 'ciclo-editorial');
});

test('condições de passagem: seleção paginada, integração do ato e registro separado da execução', async ({
  page,
}, testInfo) => {
  if (testInfo.project.name.startsWith('mobile-'))
    await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/books/' + FIXTURE_BOOK_ID + '?literaryPassage=1');
  await page.getByRole('tab', { name: 'Produção literária' }).click();
  await page.getByRole('button', { name: 'Preparação do capítulo', exact: true }).click();
  await page.getByRole('button', { name: 'Consultar capítulos', exact: true }).click();
  await page.getByRole('combobox', { name: 'Capítulo em preparação', exact: true }).click();
  await page.getByRole('option', { name: 'Capítulo preparado', exact: true }).click();
  const cycle = page.getByRole('region', { name: 'Ciclo editorial do capítulo' });
  await cycle.getByRole('combobox', { name: 'Entrada neste capítulo' }).click();
  await page.getByRole('option', { name: 'Continuar após um capítulo revisado' }).click();
  await cycle.getByRole('button', { name: 'Consultar ciclos anteriores' }).click();
  await expect(
    cycle.getByRole('button', { name: 'Registrar novo ciclo deste capítulo' }),
  ).toBeDisabled();
  await cycle.getByRole('button', { name: 'Mais ciclos anteriores' }).click();
  await cycle.getByRole('combobox', { name: 'Ciclo anterior revisado' }).click();
  await page.getByRole('option', { name: /Da enseada abandonada/ }).click();
  await expect(
    cycle.getByRole('button', { name: 'Registrar novo ciclo deste capítulo' }),
  ).toBeDisabled();
  await cycle.getByRole('button', { name: 'Consultar integrações do ato anterior' }).click();
  await cycle.getByRole('button', { name: 'Mais integrações do ato anterior' }).click();
  await cycle.getByRole('combobox', { name: 'Integração aceita do ato anterior' }).click();
  await page.getByRole('option', { name: /Integração do ato anterior/ }).click();
  await cycle
    .getByRole('region', { name: 'Condições de entrada do capítulo' })
    .scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(page, 'selecao-passagem');
  await capture(page, testInfo, 'selecao-passagem');
  await cycle.getByRole('button', { name: 'Registrar novo ciclo deste capítulo' }).focus();
  await page.keyboard.press('Enter');
  await expect(
    cycle.getByText(/Entrada vinculada ao capítulo Da enseada abandonada/),
  ).toBeVisible();
  await expect(cycle.getByText('Preparação e gate', { exact: true })).toBeVisible();
  await expect(cycle.getByText(/0 de 200 passos/)).toBeVisible();
  await cycle.getByRole('button', { name: 'Retomar ciclo até a próxima decisão' }).click();
  await expect(cycle.getByText('Passagem de entrada conferida.')).toBeVisible();
  await expect(
    cycle.getByRole('button', { name: 'Autorizar primeira versão deste ciclo' }),
  ).toBeVisible();
  await cycle.scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(page, 'condicoes-passagem');
  await capture(page, testInfo, 'condicoes-passagem');
});
