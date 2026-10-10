import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Rede de proteção da identidade visual, em duas camadas:
 *
 * 1. contrato de estilo — compara valores computados (tokens e cores de
 *    componentes). É determinístico em qualquer sistema operacional e diz
 *    exatamente o que mudou;
 * 2. aparência — compara a página inteira pixel a pixel. Pega regressões de
 *    layout que o contrato não vê, mas depende das fontes do sistema, então
 *    cada plataforma tem sua própria imagem de referência.
 */

const screenshotName = 'styleguide.png';
const baseline = join('e2e', '__screenshots__', process.platform, screenshotName);

// O tema do sistema é controlado pelo teste, não pela máquina do CI.
test.use({ colorScheme: 'light' });

const themes = [
  {
    id: 'light',
    background: '40 20% 97%',
    foreground: '25 16% 15%',
    primary: '26 48% 36%',
    destructive: '0 84.2% 60.2%',
  },
  {
    id: 'dark',
    background: '24 12% 7%',
    foreground: '38 24% 94%',
    primary: '26 40% 57%',
    destructive: '0 62.8% 40.6%',
  },
  {
    id: 'sepia',
    background: '37 38% 92%',
    foreground: '24 33% 17%',
    primary: '25 43% 34%',
    destructive: '0 65% 45%',
  },
];

for (const theme of themes) {
  test(`mantém o contrato e persiste o tema ${theme.id}`, async ({ page }) => {
    await page.goto('/styleguide');
    await expect(
      page.getByRole('heading', { name: 'Catálogo do Design System & Temas' }),
    ).toBeVisible();
    await page.getByRole('combobox', { name: 'Selecionar tema visual' }).selectOption(theme.id);
    const root = page.locator('html');
    await expect(root).toHaveAttribute('data-theme', theme.id);
    await expect(root).toHaveCSS('filter', 'none');
    for (const token of ['background', 'foreground', 'primary', 'destructive'] as const) {
      await expect(root).toHaveCSS(`--${token}`, theme[token]);
    }

    // Resolve os valores HSL esperados no próprio navegador. Isso preserva
    // o contrato sem depender da serialização/minificação de cores do CSS.
    const colors = await page.evaluate((palette) => {
      const probe = document.createElement('span');
      document.body.append(probe);
      const resolve = (value: string) => {
        probe.style.color = `hsl(${value})`;
        return getComputedStyle(probe).color;
      };
      const result = {
        background: resolve(palette.background),
        foreground: resolve(palette.foreground),
        primary: resolve(palette.primary),
        destructive: resolve(palette.destructive),
      };
      probe.remove();
      return result;
    }, theme);
    await expect(page.locator('body')).toHaveCSS('background-color', colors.background);
    await expect(page.locator('body')).toHaveCSS('color', colors.foreground);
    await expect(page.getByRole('button', { name: 'Primary', exact: true })).toHaveCSS(
      'background-color',
      colors.primary,
    );
    await expect(page.getByRole('button', { name: 'Destructive', exact: true })).toHaveCSS(
      'background-color',
      colors.destructive,
    );
    await expect(
      page
        .getByRole('alert')
        .filter({ has: page.getByRole('heading', { name: 'Erro', exact: true }) }),
    ).toHaveCSS('color', colors.destructive);
    const primaryButton = page.getByRole('button', { name: 'Primary', exact: true });
    for (const hovered of [false, true]) {
      if (hovered) await primaryButton.hover();
      const contrast = await primaryButton.evaluate((element) => {
        const style = getComputedStyle(element);
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d')!;
        const luminance = (color: string) => {
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const channels = context.getImageData(0, 0, 1, 1).data.slice(0, 3);
          return Array.from(channels).reduce((total, channel, index) => {
            const value = channel / 255;
            const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
            return total + linear * [0.2126, 0.7152, 0.0722][index];
          }, 0);
        };
        const [low, high] = [luminance(style.color), luminance(style.backgroundColor)].sort(
          (a, b) => a - b,
        );
        return (high + 0.05) / (low + 0.05);
      });
      expect(
        contrast,
        `${theme.id}: contraste da ação ${hovered ? 'hover' : 'normal'}`,
      ).toBeGreaterThanOrEqual(4.5);
    }
    await page.mouse.move(0, 0);
    await expect(page.getByRole('button', { name: 'Disabled', exact: true })).toBeDisabled();
    await page.reload();
    await expect(root).toHaveAttribute('data-theme', theme.id);
    await expect(root).toHaveCSS('filter', 'none');
    await expect(page.getByRole('combobox', { name: 'Selecionar tema visual' })).toHaveValue(
      theme.id,
    );
  });
}

test('acompanha o sistema e permite alternar os três temas', async ({ page }) => {
  await page.goto('/styleguide');
  const root = page.locator('html');
  await page.getByRole('combobox', { name: 'Selecionar tema visual' }).selectOption('system');
  await expect(root).toHaveAttribute('data-theme', 'light');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(root).toHaveAttribute('data-theme', 'dark');
  // O cabeçalho global e o catálogo oferecem o mesmo controle.
  const toggle = page.getByRole('button', { name: /^Alternar tema/ }).first();
  for (const theme of ['sepia', 'light', 'dark']) {
    await toggle.click();
    await expect(root).toHaveAttribute('data-theme', theme);
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(root).toHaveAttribute('data-theme', 'dark');
});

test('mantém a aparência da página do styleguide', async ({ page }) => {
  // Linux é a referência revisada do CI. Outras plataformas precisam gerar
  // sua própria imagem explicitamente com npm run test:e2e:update.
  const criandoReferencia = test.info().config.updateSnapshots !== 'missing';
  if (process.env.CI && process.platform === 'linux' && !criandoReferencia) {
    expect(existsSync(baseline), 'A referência Linux revisada deve estar versionada').toBe(true);
  }
  test.skip(
    !existsSync(baseline) && !criandoReferencia,
    `Sem imagem de referência para ${process.platform}. Gere com: npm run test:e2e:update`,
  );

  await page.goto('/styleguide');
  await page.waitForLoadState('networkidle');

  await expect(page).toHaveScreenshot(screenshotName, { fullPage: true });
});
