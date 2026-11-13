import { expect, test } from '@playwright/test';
import { gotoBugList, luminance, parseRgb, signIn } from '../support/ui';

function hue({ r, g, b }: { r: number; g: number; b: number }): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return -1;
  const chroma = max - min;
  let hueSector: number;
  if (max === r) hueSector = ((g - b) / chroma) % 6;
  else if (max === g) hueSector = (b - r) / chroma + 2;
  else hueSector = (r - g) / chroma + 4;
  return (hueSector * 60 + 360) % 360;
}

async function badgeStyle(page: import('@playwright/test').Page, text: RegExp) {
  const badge = page.locator('tbody span').filter({ hasText: text }).first();
  await expect(badge, `expected a badge matching ${text}`).toBeVisible();
  return badge.evaluate((element) => {
    const computedStyle = getComputedStyle(element);
    return {
      bg: computedStyle.backgroundColor,
      fg: computedStyle.color,
      border: computedStyle.borderTopWidth,
      radius: computedStyle.borderTopLeftRadius,
    };
  });
}

test.describe('badge system @visual', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await gotoBugList(page);
  });

  test('badges are pale fills with dark text and a visible border', async ({ page }) => {
    const badge = page.locator('tbody span[title]').first();
    await expect(badge).toBeVisible();

    const style = await badge.evaluate((element) => {
      const computedStyle = getComputedStyle(element);
      return {
        bg: computedStyle.backgroundColor,
        fg: computedStyle.color,
        border: computedStyle.borderTopWidth,
        radius: computedStyle.borderTopLeftRadius,
      };
    });

    expect(luminance(parseRgb(style.bg)), 'badge fill should be a pale tint').toBeGreaterThan(200);
    expect(luminance(parseRgb(style.fg)), 'badge text should be dark for contrast').toBeLessThan(150);
    expect(parseFloat(style.border), 'micro-badges carry a border, not a bare fill').toBeGreaterThan(0);
    expect(parseFloat(style.radius)).toBeGreaterThan(0);
    expect(parseFloat(style.radius)).toBeLessThan(12);
  });

  test('severity, status and category do not all share one hue', async ({ page }) => {
    const severity = await badgeStyle(page, /^(Critical|Major|Minor|Trivial)$/);
    const status = await badgeStyle(page, /^(CONFIRMED|IN PROGRESS|RESOLVED|VERIFIED|UNCONFIRMED)$/);

    const sevHue = hue(parseRgb(severity.bg));
    const statusHue = hue(parseRgb(status.bg));

    if (sevHue >= 0 && statusHue >= 0) {
      const apart = Math.min(Math.abs(sevHue - statusHue), 360 - Math.abs(sevHue - statusHue));
      expect(
        apart,
        `severity (${Math.round(sevHue)}°) and status (${Math.round(statusHue)}°) look alike`,
      ).toBeGreaterThan(20);
    }
  });

  test('colour is never the only signal - badges carry a glyph or a word', async ({ page }) => {
    const badges = page.locator('tbody span[title]');
    await expect(badges.first()).toBeVisible();
    const count = Math.min(await badges.count(), 8);
    expect(count, 'expected some badges to inspect').toBeGreaterThan(0);

    for (let i = 0; i < count; i += 1) {
      const badge = badges.nth(i);
      const text = (await badge.innerText()).trim();
      const hasGlyph = (await badge.locator('svg').count()) > 0;
      expect(text.length > 0 || hasGlyph, `badge ${i} conveys meaning by colour alone`).toBe(true);
    }
  });

  test('a severity badge explains itself on hover', async ({ page }) => {
    const badge = page.locator('tbody span[title]').first();
    const title = await badge.getAttribute('title');
    expect(title?.length ?? 0, 'badges should carry an explanatory title').toBeGreaterThan(3);
  });
});
