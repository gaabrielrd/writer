import { capture, expect, test } from './support';
import { FIXTURE_BOOK_ID, lore } from './fixtures/data';
import { installNativeBookLore } from './nativeBookLore.mjs';

test('compêndio lista resumos e busca a ficha completa somente ao abrir', async ({
  page,
}, info) => {
  const native = await installNativeBookLore(page);
  const entries = lore.filter((entry) => entry.bookId === FIXTURE_BOOK_ID);
  await page.goto(`/books/${FIXTURE_BOOK_ID}?tab=compendium`);
  await page.getByRole('button', { name: 'Visualização em grid', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ver Ficha', exact: true })).toHaveCount(
    entries.length,
  );
  expect(
    native.calls.some(
      (call) => call.name === 'getBookLoreRead' || call.name === 'readBookLorePart',
    ),
  ).toBe(false);
  const lists = native.calls.filter((call) => call.name === 'listBookLoreRead');
  expect(
    lists.some((call) => (call.input as { projection?: string }).projection === 'summary'),
  ).toBe(true);
  expect(lists.some((call) => !(call.input as { projection?: string }).projection)).toBe(true);
  await capture(page, info, 'compendio-resumos');
  const switcher = page.getByRole('button', { name: 'Visualização em lista', exact: true });
  await switcher.focus();
  await switcher.press('Enter');
  const entity = entries[0];
  await page.getByRole('textbox', { name: 'Buscar no compêndio' }).fill(entity.name);
  const opener = page.getByRole('button', { name: `Ver ficha de ${entity.name}`, exact: true });
  await opener.focus();
  await opener.press('Enter');
  // The desktop list first opens a metadata inspector; full content still needs a click.
  expect(native.calls.some((call) => call.name === 'getBookLoreRead')).toBe(false);
  const fullOpener = page.getByRole('button', { name: 'Abrir ficha completa', exact: true });
  await fullOpener.click();
  const dialog = page.getByRole('dialog', { name: entity.name, exact: true });
  await expect(dialog).toContainText(entity.details);
  expect(native.calls.some((call) => call.name === 'getBookLoreRead')).toBe(true);
  expect(native.calls.some((call) => call.name === 'readBookLorePart')).toBe(true);
  await capture(page, info, 'compendio-ficha-completa');
  await dialog.getByRole('button', { name: 'Fechar', exact: true }).first().click();
  await expect(fullOpener).toBeFocused();
});
