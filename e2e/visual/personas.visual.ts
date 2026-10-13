import {
  test,
  expect,
  capture,
  expectDialogWithinViewport,
  expectNoHorizontalOverflow,
} from './support';
import { chooseDropdown } from '../dropdown';
import { author, FIXTURE_BOOK_ID, FIXTURE_CHAPTER_ID } from './fixtures/data';

test('personaliza uma persona com slider próprio e preserva formulário e ações em 320 px', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: new RegExp(author.displayName!) }).click();
  await page.getByRole('menuitem', { name: 'Configurar inteligência artificial' }).click();
  await expect(page).toHaveURL(/\/settings\/ai$/);
  await expect(page.getByRole('tab', { name: 'Personas', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(page.getByRole('dialog')).toHaveCount(0);
  for (const name of [
    'O Atmosférico',
    'O Incisivo',
    'O Íntimo',
    'O Irônico',
    'O Épico',
    'O Inquietante',
  ]) {
    await expect(
      page.getByRole('button', { name: `Ver detalhes de ${name}`, exact: true }),
    ).toBeAttached();
    const avatar = page.getByRole('img', { name: `Avatar de ${name}`, exact: true });
    await avatar.scrollIntoViewIfNeeded();
    await expect
      .poll(() => avatar.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
  }
  await page
    .getByRole('img', { name: 'Avatar de O Atmosférico', exact: true })
    .scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, 0));
  await capture(page, testInfo, 'biblioteca-com-avatares');
  await page.getByRole('button', { name: 'Ver detalhes de O Incisivo' }).click();
  await expect(page.getByRole('progressbar', { name: 'Concisão', exact: true })).toHaveAttribute(
    'value',
    '95',
  );
  await expect(page.getByRole('dialog')).toContainText('Mapa de personalidade');
  await capture(page, testInfo, 'persona-detalhes-visuais');
  await page.getByRole('button', { name: 'Personalizar O Incisivo' }).click();
  await page.getByLabel('Nome da persona', { exact: true }).fill('Minha voz');
  await page
    .getByLabel('Instruções permanentes')
    .fill('Use imagens de luz, sem metáforas marinhas.');
  const concision = page.getByRole('slider', { name: 'Concisão', exact: true });
  await concision.focus();
  await concision.press('Home');
  await concision.press('ArrowRight');
  await expect(concision).toHaveValue('1');
  await page.getByRole('button', { name: /Criar slider personalizado/ }).click();
  await page.getByLabel('Nome do atributo').fill('Formalidade');
  await page.getByLabel('Significado do atributo').fill('Tratamento entre personagens');
  await page.getByLabel('Significado de 0', { exact: true }).fill('Coloquial');
  await page.getByLabel('Significado de 100', { exact: true }).fill('Cerimonial');
  await page.getByRole('button', { name: 'Adicionar atributo', exact: true }).click();
  const formal = page.getByRole('slider', { name: 'Formalidade', exact: true });
  await formal.focus();
  await formal.press('End');
  await expect(formal).toHaveValue('100');
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expectDialogWithinViewport(page);
  await expectNoHorizontalOverflow(page, 'personas');
  const dialog = page.getByRole('dialog', { name: 'Editar persona de IA' });
  const footer = page.getByRole('button', { name: 'Salvar persona' });
  const before = await footer.boundingBox();
  await formal.scrollIntoViewIfNeeded();
  const after = await footer.boundingBox();
  expect(Math.abs(after!.y - before!.y)).toBeLessThanOrEqual(1);
  await expect(footer).toBeVisible();
  await capture(page, testInfo, 'persona-editada-320');
  await footer.click();
  await expect(
    page.getByRole('button', { name: 'Ver detalhes de Minha voz', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Ver detalhes de Minha voz' }).click();
  await expect(page.getByRole('progressbar', { name: 'Formalidade', exact: true })).toHaveAttribute(
    'value',
    '100',
  );
  await expectDialogWithinViewport(page);
  await expectNoHorizontalOverflow(page, 'detalhes da persona em 320px');
  const firstAttribute = await page.getByRole('dialog').getByRole('article').nth(0).boundingBox();
  const secondAttribute = await page.getByRole('dialog').getByRole('article').nth(1).boundingBox();
  expect(Math.abs(firstAttribute!.x - secondAttribute!.x)).toBeLessThanOrEqual(1);
  expect(secondAttribute!.y).toBeGreaterThan(firstAttribute!.y);
  await page.getByRole('dialog').getByRole('article').first().scrollIntoViewIfNeeded();
  await capture(page, testInfo, 'persona-detalhes-320');
  await page.getByRole('button', { name: 'Editar Minha voz' }).click();
  await expect(page.getByLabel('Instruções permanentes')).toHaveValue(
    'Use imagens de luz, sem metáforas marinhas.',
  );
  await expect(page.getByRole('slider', { name: 'Formalidade', exact: true })).toHaveValue('100');
  await page.getByRole('button', { name: 'Cancelar edição' }).click();
  await page.getByRole('button', { name: 'Arquivar Minha voz' }).click();
  await expect(
    page.getByRole('button', { name: 'Ver detalhes de Minha voz', exact: true }),
  ).not.toBeAttached();
  await page.getByRole('button', { name: 'Mostrar arquivadas' }).click();
  await page.getByRole('button', { name: 'Ver detalhes de Minha voz' }).click();
  await page.getByRole('button', { name: 'Reativar Minha voz' }).click();
  await expect(
    page.getByRole('button', { name: 'Ver detalhes de Minha voz', exact: true }),
  ).toBeVisible();
  await expect(dialog).not.toBeAttached();
});

test('combina livro e capítulo, envia a persona nas ações e autocomplete, sem mudar texto antes do aceite', async ({
  page,
}, testInfo) => {
  await page.goto(`/books/${FIXTURE_BOOK_ID}`);
  await page.getByRole('button', { name: 'Opções do livro' }).click();
  await page.getByRole('menuitem', { name: 'Persona de IA' }).click();
  await chooseDropdown(page.getByLabel('Persona base', { exact: true }), 'O Atmosférico');
  await expect(page.getByRole('img', { name: 'Avatar de O Atmosférico' })).toBeVisible();
  await page.getByRole('button', { name: 'Salvar vínculo' }).click();
  await page
    .getByRole('button', { name: /Escrever/ })
    .first()
    .click();
  await expect(page).toHaveURL(new RegExp(`/editor/${FIXTURE_CHAPTER_ID}`));
  await page.getByRole('button', { name: 'Opções do capítulo', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Persona', exact: true }).click();
  await chooseDropdown(page.getByLabel('Persona complementar', { exact: true }), 'O Inquietante');
  await expect(page.getByRole('img', { name: 'Avatar de O Inquietante' })).toBeVisible();
  await chooseDropdown(
    page.getByLabel('Aplicação de Tensão', { exact: true }),
    'Definir no capítulo',
  );
  await page.getByRole('slider', { name: 'Tensão', exact: true }).press('End');
  await page.getByText('Orientações efetivas', { exact: true }).last().click();
  await expect(page.getByRole('dialog')).toContainText('Sensorialidade: 90/100');
  await expect(page.getByRole('dialog')).toContainText('Tensão: 100/100');
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expectDialogWithinViewport(page);
  await expectNoHorizontalOverflow(page, 'personas');
  await capture(page, testInfo, 'complemento-capitulo');
  await page.getByRole('button', { name: 'Salvar vínculo' }).click();
  const editor = page.getByLabel('Área de escrita do capítulo');
  const original = await editor.innerText();
  await page.evaluate(() => {
    sessionStorage.setItem('writer_fixture_ai_actions', 'true');
    sessionStorage.setItem('writer_fixture_autocomplete', 'true');
  });
  await page.getByRole('button', { name: 'Abrir Assistente Criativo de IA' }).click();
  await page.getByLabel('Mensagem para o Assistente IA').fill('/estilo ');
  await page.getByRole('button', { name: 'Enviar', exact: true }).click();
  await expect(page.getByText('O trecho ganhou novos detalhes.', { exact: true })).toBeVisible();
  const system = await page.evaluate(() => sessionStorage.getItem('writer_fixture_ai_system'));
  expect(system).toContain('Persona do livro: O Atmosférico');
  expect(system).toContain('Complemento do capítulo: O Inquietante');
  expect(system).toContain('Tensão: 100/100');
  await expect(editor).toHaveText(original, { useInnerText: true });
  await page.getByRole('button', { name: 'Fechar painel de IA' }).click();
  await editor.click();
  await editor.press('Control+End');
  await editor.pressSequentially(' Nova descoberta.');
  await expect
    .poll(() =>
      page.evaluate(() => Number(sessionStorage.getItem('writer_fixture_autocomplete_calls') ?? 0)),
    )
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => sessionStorage.getItem('writer_fixture_ai_system'))).toContain(
    'Tensão: 100/100',
  );
  await page.getByRole('button', { name: 'Opções do capítulo', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Persona', exact: true }).click();
  await chooseDropdown(
    page.getByLabel('Persona complementar', { exact: true }),
    'Somente a persona do livro',
  );
  await page.getByRole('button', { name: 'Salvar vínculo' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Opções do capítulo', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Persona', exact: true }).click();
  await expect(page.getByLabel('Persona complementar', { exact: true })).toContainText(
    'Somente a persona do livro',
  );
  await page.getByRole('dialog').press('Escape');
  await expect(page.getByRole('button', { name: 'Opções do capítulo', exact: true })).toBeFocused();
});

test('gerencia livro, capítulo e biblioteca pelo menu do capítulo, sem sair do editor ou aninhar modais', async ({
  page,
}, testInfo) => {
  const path = `/books/${FIXTURE_BOOK_ID}/editor/${FIXTURE_CHAPTER_ID}`;
  await page.goto(path);
  const editor = page.getByLabel('Área de escrita do capítulo');
  await expect(editor).toBeVisible();
  const original = await editor.innerText();
  const trigger = page.getByRole('button', { name: 'Opções do capítulo', exact: true });
  await expect(page.getByRole('button', { name: 'Gerenciar personas' })).toHaveCount(0);
  await expect(page.getByText('Livro: Sem persona', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Orientações efetivas', { exact: true })).toHaveCount(0);
  await trigger.click();
  await page.getByRole('menuitem', { name: 'Persona', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.getByRole('tab', { name: 'Livro', exact: true }).click();
  await chooseDropdown(page.getByLabel('Persona base'), 'O Épico');
  await page.getByRole('button', { name: 'Salvar vínculo' }).click();
  await trigger.click();
  await page.getByRole('menuitem', { name: 'Persona', exact: true }).click();
  await page.getByRole('tab', { name: 'Biblioteca', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.getByRole('button', { name: 'Ver detalhes de O Incisivo' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByRole('progressbar', { name: 'Concisão' })).toHaveAttribute('value', '95');
  await page.getByRole('button', { name: 'Personalizar O Incisivo' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await page.getByLabel('Nome da persona', { exact: true }).fill('Voz contextual');
  await page.getByRole('button', { name: 'Salvar persona' }).click();
  await expect(page.getByRole('button', { name: 'Ver detalhes de Voz contextual' })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${path}$`));
  await page.getByRole('tab', { name: 'Capítulo', exact: true }).click();
  await chooseDropdown(page.getByLabel('Persona complementar'), 'Voz contextual');
  await page.getByRole('button', { name: 'Salvar vínculo' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(editor).toHaveText(original, { useInnerText: true });
  await trigger.click();
  await page.getByRole('menuitem', { name: 'Persona', exact: true }).click();
  await expect(page.getByLabel('Persona complementar')).toContainText('Voz contextual');
  await page.getByRole('tab', { name: 'Livro', exact: true }).click();
  await expect(page.getByLabel('Persona base')).toContainText('O Épico');
  await expectDialogWithinViewport(page);
  await expectNoHorizontalOverflow(page, 'persona contextual');
  await capture(page, testInfo, 'persona-contextual-no-capitulo');
  await page.getByRole('dialog').press('Escape');
  await capture(page, testInfo, 'editor-sem-faixa-de-personas');
});
