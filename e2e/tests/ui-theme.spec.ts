import { expect, test } from '@playwright/test';
import { bgColor, gotoBugList, luminance, parseRgb, signIn } from '../support/ui';

/**
 * The app is light-theme only, and must stay light.
 *
 * These are computed-style assertions rather than screenshot comparisons on
 * purpose. A pixel baseline for this app would be re-recorded on every copy
 * change and every new bug row, and a baseline nobody trusts gets `--update-
 * snapshots` run on it reflexively - at which point it stops catching anything.
 * Asserting "this surface is light" survives content changes and still fails on
 * the regression that actually matters.
 */
test.describe('light theme @visual', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await gotoBugList(page);
  });

  test('cards and table surfaces are light, not dark fills', async ({ page }) => {
    const card = page.locator('table').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
    const cardBg = parseRgb(await bgColor(card));
    expect(luminance(cardBg), `card background should be near-white, got ${JSON.stringify(cardBg)}`)
      .toBeGreaterThan(230);

    const header = page.locator('thead tr').first();
    const headerBg = parseRgb(await bgColor(header));
    expect(luminance(headerBg), 'table header should be a light tint').toBeGreaterThan(220);

    /*
     * The header is `sticky`. Any transparency lets rows scroll through the
     * column labels, so an opaque background is a functional requirement here,
     * not a stylistic one.
     */
    expect(headerBg.a, 'a sticky header must be fully opaque').toBe(1);
  });

  test('row text is dark enough to read on a light row', async ({ page }) => {
    const cell = page.locator('tbody tr td').nth(3);
    const color = parseRgb(await cell.evaluate((el) => getComputedStyle(el).color));
    expect(luminance(color), 'body text should be dark slate, not washed out').toBeLessThan(140);
  });

  /**
   * The regression this suite exists to prevent.
   *
   * tailwind.config.js declares no `darkMode` key, so Tailwind defaults to
   * `media` - meaning any stray `dark:` utility fires off the VIEWER'S OS
   * setting alone. Since nothing else in the app is themed, a single `dark:`
   * class on the table turns it dark inside a card, sidebar and page background
   * that all stay light. This spec is the tripwire: it emulates a dark OS and
   * insists the app looks exactly the same.
   */
  test('stays light even when the OS prefers dark', async ({ browser }) => {
    const ctx = await browser.newContext({ colorScheme: 'dark' });
    const page = await ctx.newPage();
    await signIn(page);
    await gotoBugList(page);

    const card = page.locator('table').locator('xpath=ancestor::div[contains(@class,"rounded-xl")][1]');
    const cardBg = parseRgb(await bgColor(card));
    expect(
      luminance(cardBg),
      'a dark OS preference must not darken the app - see the darkMode note in tailwind.config.js'
    ).toBeGreaterThan(230);

    const headerBg = parseRgb(await bgColor(page.locator('thead tr').first()));
    expect(luminance(headerBg), 'table header must stay light under prefers-color-scheme: dark')
      .toBeGreaterThan(220);

    await ctx.close();
  });

  test('no element renders an unstyled or transparent border', async ({ page }) => {
    /*
     * Guards the "unstyled borders" case: a bordered element that lost its
     * colour class falls back to currentColor, which reads as a hard black rule
     * against the light theme.
     */
    const offenders = await page.locator('table, thead tr, tbody tr').evaluateAll((els) =>
      els
        .map((el) => {
          const s = getComputedStyle(el);
          return { tag: el.tagName, width: s.borderBottomWidth, color: s.borderBottomColor };
        })
        .filter((x) => parseFloat(x.width) > 0 && /^rgba?\(0, 0, 0(, 1)?\)$/.test(x.color))
    );
    expect(offenders, 'borders should use a slate token, never default black').toEqual([]);
  });
});
