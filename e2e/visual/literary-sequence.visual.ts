import { test, expect, capture, expectNoHorizontalOverflow } from './support';
import { FIXTURE_BOOK_ID } from './fixtures/data';

test('sequência de capítulos: prévia, consentimento, orçamento agregado e fronteira autoral com pausa', async ({
  page,
}, testInfo) => {
  if (testInfo.project.name.startsWith('mobile-'))
    await page.setViewportSize({ width: 320, height: 844 });
  await page.goto('/books/' + FIXTURE_BOOK_ID + '?literarySequence=1');
  await page.getByRole('tab', { name: 'Produção literária' }).click();
  await expect(
    page.getByRole('button', { name: 'Assistente da página', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false');
  await page.getByRole('combobox', { name: 'Método de colaboração' }).click();
  await page
    .getByRole('option', { name: 'Execução contínua com escopo e limites', exact: true })
    .click();
  await page.getByRole('button', { name: 'Salvar contrato e decisões' }).click();
  await expect(page.getByText('Revisão 1', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sequência de capítulos', exact: true }).click();
  const sequence = page.getByRole('region', { name: 'Sequência editorial de capítulos' });
  await sequence.getByRole('button', { name: 'Consultar capítulos para sequência' }).click();
  for (const title of [
    'Capítulo preparado',
    'O retorno à enseada e a escolha que permanece em aberto',
  ]) {
    await sequence.getByRole('combobox', { name: 'Adicionar capítulo à sequência' }).click();
    await page.getByRole('option', { name: title, exact: true }).click();
    await sequence.getByRole('button', { name: 'Adicionar capítulo selecionado' }).click();
  }
  for (const label of ['Primeira versão', 'Revisão integral', 'Versão revisada']) {
    await sequence.getByRole('combobox', { name: 'Autorizar fase na sequência: ' + label }).click();
    await page
      .getByRole('option', { name: 'Autorizar no escopo e limites da sequência', exact: true })
      .click();
  }
  await sequence.getByRole('button', { name: 'Conferir escopo e preparar prévia' }).click();
  const preview = sequence.getByRole('region', { name: 'Prévia da sequência' });
  await expect(preview).toBeVisible();
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('fixture:sequence-recovery-calls') ?? '[]') as string[],
    ),
  ).toEqual(['preview']);
  await preview.scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(page, 'sequence-consent');
  await capture(page, testInfo, 'sequence-consent');
  await preview.getByRole('button', { name: 'Registrar esta sequência com estes limites' }).focus();
  await page.keyboard.press('Enter');
  const checkpoint = sequence.getByRole('region', { name: 'Checkpoint da sequência' });
  await expect(checkpoint.getByText(/0 de 2 capítulos concluídos/)).toBeVisible();
  const calls = () =>
    page.evaluate(
      () => JSON.parse(localStorage.getItem('fixture:sequence-recovery-calls') ?? '[]') as string[],
    );
  expect(await calls()).toEqual(['preview', 'register']);
  await checkpoint.getByRole('button', { name: 'Avançar sequência até a próxima decisão' }).click();
  await expect(
    checkpoint.getByText(/1 de 2 capítulos concluídos · 2 de 3 aplicações · 2 de 3 créditos/),
  ).toBeVisible();
  await expect(checkpoint.getByText('O próximo capítulo exige sua autorização.')).toBeVisible();
  await checkpoint.getByRole('button', { name: 'Pausar sequência no servidor' }).click();
  await expect(checkpoint.getByText('Sequência pausada', { exact: true })).toBeVisible();
  await checkpoint
    .getByRole('button', { name: 'Autorizar estes limites e retomar sequência' })
    .click();
  await checkpoint.getByRole('button', { name: 'Autorizar entrada no próximo capítulo' }).click();
  await checkpoint.getByRole('button', { name: 'Avançar sequência até a próxima decisão' }).click();
  await expect(checkpoint.getByText('Seleção concluída', { exact: true })).toBeVisible();
  await expect(
    checkpoint.getByText(/2 de 2 capítulos concluídos · 3 de 3 aplicações · 3 de 3 créditos/),
  ).toBeVisible();
  expect((await calls()).filter((method) => method === 'advance')).toHaveLength(2);
  await checkpoint.scrollIntoViewIfNeeded();
  await expectNoHorizontalOverflow(page, 'sequence-finished');
  await capture(page, testInfo, 'sequence-finished');
});
