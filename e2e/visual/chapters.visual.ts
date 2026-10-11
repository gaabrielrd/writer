import type { Locator } from '@playwright/test';
import { capture, expect, expectNoHorizontalOverflow, test } from './support';
import { chapters, FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID } from './fixtures/data';

async function tableStyle(table: Locator) {
  return table.evaluate((element) => {
    const container = getComputedStyle(element.parentElement!);
    const header = getComputedStyle(element.querySelector('thead')!);
    const row = getComputedStyle(element.querySelector('tbody tr')!);
    const cell = getComputedStyle(element.querySelector('tbody td')!);
    return {
      radius: container.borderRadius,
      border: container.borderColor,
      header: header.backgroundColor,
      divider: row.borderBottomColor,
      padding: cell.padding,
      font: getComputedStyle(element).fontSize,
    };
  });
}

test('capítulos seguem a tabela do compêndio e preservam seleção e navegação', async ({
  page,
}, testInfo) => {
  await page.goto('/books/' + FIXTURE_BOOK_ID);
  const table = page.getByRole('table', { name: 'Capítulos', exact: true });
  await expect(table).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Capítulo', exact: true })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Palavras' })).toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Ações' })).toBeVisible();
  const style = await tableStyle(table);
  if (testInfo.project.name.startsWith('desktop')) {
    await page.getByRole('tab', { name: 'Compêndio', exact: true }).click();
    await page.getByRole('button', { name: 'Visualização em lista' }).click();
    const compendium = page.getByRole('table', { name: 'Entidades do compêndio' });
    await expect(compendium).toBeVisible();
    expect(style).toEqual(await tableStyle(compendium));
    await page.getByRole('tab', { name: 'Capítulos', exact: true }).click();
  }
  const select = table.getByRole('checkbox', {
    name: 'Selecionar ' + chapters[0].title,
    exact: true,
  });
  await select.focus();
  await page.keyboard.press('Space');
  await expect(
    table.getByRole('checkbox', { name: 'Selecionar todos os capítulos exibidos' }),
  ).toHaveJSProperty('indeterminate', true);
  await expect(select.locator('xpath=ancestor::tr')).toHaveAttribute('data-state', 'selected');
  await capture(page, testInfo, 'capitulos-lista-selecao');
  await page.getByRole('button', { name: 'Limpar seleção', exact: true }).click();
  await expect(select).not.toBeChecked();
  await capture(page, testInfo, 'capitulos-lista');
  await table
    .getByRole('button', { name: 'Abrir capítulo ' + chapters[0].title, exact: true })
    .focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp('/editor/' + FIXTURE_CHAPTER_ID + '$'));
});

test('tabela em 320px conserva títulos, contagens e ações sem rolagem horizontal', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/books/' + FIXTURE_BOOK_ID);
  const table = page.getByRole('table', { name: 'Capítulos', exact: true });
  await expect(table).toBeVisible();
  for (const chapter of chapters) {
    const title = table.getByRole('button', {
      name: 'Abrir capítulo ' + chapter.title,
      exact: true,
    });
    await expect(title).toHaveAttribute('title', chapter.title);
    await expect(title).toBeVisible();
    await expect(
      table.getByRole('button', { name: 'Escrever ' + chapter.title, exact: true }),
    ).toBeVisible();
    await expect(
      table.getByRole('button', { name: 'Opções de ' + chapter.title, exact: true }),
    ).toBeVisible();
    await expect(
      table.getByLabel(chapter.wordCount.toLocaleString('pt-BR') + ' palavras', { exact: true }),
    ).toBeVisible();
  }
  expect(
    await table.evaluate(
      (element) => element.parentElement!.scrollWidth - element.parentElement!.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await expectNoHorizontalOverflow(page, 'capitulos-320px');
  await capture(page, testInfo, 'capitulos-320px');
});
