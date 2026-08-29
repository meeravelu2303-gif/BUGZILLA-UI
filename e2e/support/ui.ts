import { expect, type Locator, type Page } from '@playwright/test';
import { TEST_USER, UI_URL } from './env';

/**
 * The few page interactions the visual specs share.
 *
 * Kept deliberately small - this is not a full page-object layer for an app
 * with no other tests. It exists so a selector change costs one edit rather
 * than five, and so "sign in" means the same thing in every spec.
 */

/** Signs in through the real form, not by injecting a cookie. */
export async function signIn(page: Page): Promise<void> {
  await page.goto(`${UI_URL}/login`);
  await page.getByLabel('Email').fill(TEST_USER.login);
  await page.getByLabel('Password').fill(TEST_USER.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  // The form is replaced by the app shell; waiting on the URL rather than a
  // spinner keeps this independent of loading-state markup.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
}

export async function gotoBugList(page: Page): Promise<void> {
  await page.goto(`${UI_URL}/bugs`);
  await expect(page.getByRole('table')).toBeVisible();
}

/**
 * Applies a product filter through the real MultiSelect popover.
 *
 * Driving the control rather than navigating to a crafted URL is the point: the
 * conditional-column behaviour is a consequence of filter state, and a URL
 * shortcut would skip the code path that sets it.
 */
export async function filterByProduct(page: Page, product: string): Promise<void> {
  /*
   * The Product control only renders once the `products` query resolves AND
   * more than one product is visible to the account, so it can legitimately be
   * absent for a second after the table paints. Waiting on the trigger
   * explicitly turns "clicked too early" into a clear timeout on a named
   * element rather than a confusing failure further down.
   */
  const trigger = filterTrigger(page, /^All product/i);
  await trigger.waitFor({ state: 'visible', timeout: 15_000 });
  await trigger.click();

  await page.getByRole('option', { name: product, exact: true }).click();
  // Close the popover so it cannot overlay the table during assertions.
  await page.keyboard.press('Escape');

  /*
   * Assert on the TRIGGER specifically, not on any button whose name contains
   * the product.
   *
   * `getByRole(..., { name })` matches accessible names by SUBSTRING unless
   * `exact` is set, and selecting a product also renders a removable chip
   * labelled "Product: KPost UI". A bare name lookup therefore resolves to two
   * elements and fails on strict mode - which reads exactly like the filter
   * never applied, and sends you looking for a bug in the app.
   */
  await expect(filterTrigger(page, new RegExp(`^${product}$`))).toBeVisible();
  await waitForTableSettled(page);
}

/** One of the filter-bar dropdowns, addressed by its current summary text. */
export function filterTrigger(page: Page, name: RegExp): Locator {
  return page.locator('button[aria-haspopup="listbox"]').filter({ hasText: name });
}

/**
 * Waits for the list to stop re-fetching.
 *
 * The table dims (`opacity-60`) while a background fetch is in flight; asserting
 * on column presence during that window can read the PREVIOUS filter's markup
 * and produce a confident, wrong result.
 */
export async function waitForTableSettled(page: Page): Promise<void> {
  const dimmed = page.locator('.opacity-60');
  await expect(dimmed).toHaveCount(0, { timeout: 15_000 });
}

export function columnHeader(page: Page, name: string): Locator {
  return page.getByRole('columnheader', { name: new RegExp(`^${name}$`, 'i') });
}

/** Resolved background colour of an element, as an `rgb(...)` string. */
export async function bgColor(locator: Locator): Promise<string> {
  return locator.evaluate((el) => getComputedStyle(el).backgroundColor);
}

/** Parses `rgb(r, g, b)` / `rgba(...)` into channels. */
export function parseRgb(value: string): { r: number; g: number; b: number; a: number } {
  const m = value.match(/rgba?\(([^)]+)\)/);
  if (!m) return { r: 255, g: 255, b: 255, a: 1 };
  const [r, g, b, a] = m[1].split(',').map((p) => Number(p.trim()));
  return { r, g, b, a: a ?? 1 };
}

/** Perceived lightness (0 black - 255 white), for "is this surface light?" checks. */
export function luminance(rgb: { r: number; g: number; b: number }): number {
  return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
}
