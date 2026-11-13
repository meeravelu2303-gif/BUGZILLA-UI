import { expect, test } from '@playwright/test';
import { bgColor, gotoBugList, luminance, parseRgb, signIn } from '../support/ui';

test.describe('light theme @visual', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await gotoBugList(page);
  });

  test('cards and table surfaces are light, not dark fills', async ({ page }) => {
    const card = page.locator('table').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
    const cardBg = parseRgb(await bgColor(card));
    expect(luminance(cardBg), `card background should be near-white, got ${JSON.stringify(cardBg)}`).toBeGreaterThan(
      230,
    );

    const header = page.locator('thead tr').first();
    const headerBg = parseRgb(await bgColor(header));
    expect(luminance(headerBg), 'table header should be a light tint').toBeGreaterThan(220);

    expect(headerBg.a, 'a sticky header must be fully opaque').toBe(1);
  });

  test('row text is dark enough to read on a light row', async ({ page }) => {
    const cell = page.locator('tbody tr td').nth(3);
    const color = parseRgb(await cell.evaluate((element) => getComputedStyle(element).color));
    expect(luminance(color), 'body text should be dark slate, not washed out').toBeLessThan(140);
  });

  test('stays light even when the OS prefers dark', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await signIn(page);
    await gotoBugList(page);

    const card = page.locator('table').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
    const cardBg = parseRgb(await bgColor(card));
    expect(
      luminance(cardBg),
      'a dark OS preference must not darken the app - see the darkMode note in tailwind.config.js',
    ).toBeGreaterThan(230);

    const headerBg = parseRgb(await bgColor(page.locator('thead tr').first()));
    expect(luminance(headerBg), 'table header must stay light under prefers-color-scheme: dark').toBeGreaterThan(220);

    await context.close();
  });

  test('no element renders an unstyled or transparent border', async ({ page }) => {
    const offenders = await page.locator('table, thead tr, tbody tr').evaluateAll((els) =>
      els
        .map((element) => {
          const computedStyle = getComputedStyle(element);
          return {
            tag: element.tagName,
            width: computedStyle.borderBottomWidth,
            color: computedStyle.borderBottomColor,
          };
        })
        .filter((x) => parseFloat(x.width) > 0 && /^rgba?\(0, 0, 0(, 1)?\)$/.test(x.color)),
    );
    expect(offenders, 'borders should use a slate token, never default black').toEqual([]);
  });
});
