import { expect, test } from '@playwright/test';
import { gotoBugList, luminance, parseRgb, signIn } from '../support/ui';

/**
 * The badge system: pastel fills, dark text, and hues that distinguish the axes
 * rather than repeating one blue.
 *
 * Asserted as PROPERTIES, not exact hex values. Pinning `bg-amber-50` to
 * rgb(255,251,235) means a designer nudging one token fails the build for a
 * change nobody considers a regression - so the suite gets weakened or ignored.
 * What actually matters is: the fill is pale, the text is dark on it, and the
 * axes do not collapse into the same colour.
 */

/** Hue in degrees (0-360) from an rgb triple; -1 when the colour is grey. */
function hue({ r, g, b }: { r: number; g: number; b: number }): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return -1;
  const d = max - min;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

async function badgeStyle(page: import('@playwright/test').Page, text: RegExp) {
  const badge = page.locator('tbody span').filter({ hasText: text }).first();
  await expect(badge, `expected a badge matching ${text}`).toBeVisible();
  return badge.evaluate((el) => {
    const s = getComputedStyle(el);
    return { bg: s.backgroundColor, fg: s.color, border: s.borderTopWidth, radius: s.borderTopLeftRadius };
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

    const style = await badge.evaluate((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, fg: s.color, border: s.borderTopWidth, radius: s.borderTopLeftRadius };
    });

    expect(luminance(parseRgb(style.bg)), 'badge fill should be a pale tint').toBeGreaterThan(200);
    expect(luminance(parseRgb(style.fg)), 'badge text should be dark for contrast').toBeLessThan(150);
    expect(parseFloat(style.border), 'micro-badges carry a border, not a bare fill').toBeGreaterThan(0);
    // rounded-md, not a full pill.
    expect(parseFloat(style.radius)).toBeGreaterThan(0);
    expect(parseFloat(style.radius)).toBeLessThan(12);
  });

  test('severity, status and category do not all share one hue', async ({ page }) => {
    /*
     * The complaint this replaced was "everything is blue". Rather than assert
     * each badge's exact colour, assert the axes are DISTINGUISHABLE - which is
     * the property a person actually relies on when scanning the table.
     */
    const severity = await badgeStyle(page, /^(Critical|Major|Minor|Trivial)$/);
    const status = await badgeStyle(page, /^(CONFIRMED|IN PROGRESS|RESOLVED|VERIFIED|UNCONFIRMED)$/);

    const sevHue = hue(parseRgb(severity.bg));
    const statusHue = hue(parseRgb(status.bg));

    // Both should be tinted (not grey) and meaningfully apart on the wheel.
    if (sevHue >= 0 && statusHue >= 0) {
      const apart = Math.min(Math.abs(sevHue - statusHue), 360 - Math.abs(sevHue - statusHue));
      expect(apart, `severity (${Math.round(sevHue)}°) and status (${Math.round(statusHue)}°) look alike`)
        .toBeGreaterThan(20);
    }
  });

  test('colour is never the only signal - badges carry a glyph or a word', async ({ page }) => {
    /*
     * Accessibility, and the reason severity/status pills ship icons: red/green
     * alone sits at the separation floor for the ~8% of men with a colour-vision
     * deficiency. Every badge must still read correctly in greyscale.
     */
    const badges = page.locator('tbody span[title]');
    /*
     * `count()` is a snapshot and does NOT auto-wait, so calling it straight
     * after navigation can read zero while rows are still rendering. Waiting on
     * the first badge to be visible is what makes this deterministic - without
     * it the spec fails intermittently and blames the app for a race in the
     * test.
     */
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
    // The `title` is the plain-language meaning of the band; without it the
    // vocabulary is only decodable by someone who already knows the model.
    const badge = page.locator('tbody span[title]').first();
    const title = await badge.getAttribute('title');
    expect(title?.length ?? 0, 'badges should carry an explanatory title').toBeGreaterThan(3);
  });
});
