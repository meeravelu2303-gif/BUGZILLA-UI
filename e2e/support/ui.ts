import { expect, type Locator, type Page } from '@playwright/test';
import { TEST_USER, UI_URL } from './env';

/** The few page interactions the visual specs share. */
export async function signIn(page: Page): Promise<void> {
  await page.goto(`${UI_URL}/login`);
  await page.getByLabel('Email').fill(TEST_USER.login);
  await page.getByLabel('Password', { exact: true }).fill(TEST_USER.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
}

export async function gotoBugList(page: Page): Promise<void> {
  await page.goto(`${UI_URL}/bugs`);
  await expect(page.getByRole('table')).toBeVisible();
}

/** Applies a product filter through the real MultiSelect popover. */
export async function filterByProduct(page: Page, product: string): Promise<void> {
  const trigger = filterTrigger(page, /^All product/i);
  await trigger.waitFor({ state: 'visible', timeout: 15_000 });
  await trigger.click();

  await page.getByRole('option', { name: product, exact: true }).click();
  await page.keyboard.press('Escape');

  await expect(filterTrigger(page, new RegExp(`^${product}$`))).toBeVisible();
  await waitForTableSettled(page);
}

/** One of the filter-bar dropdowns, addressed by its current summary text. */
export function filterTrigger(page: Page, name: RegExp): Locator {
  return page.locator('button[aria-haspopup="listbox"]').filter({ hasText: name });
}

/** Waits for the list to stop re-fetching. */
export async function waitForTableSettled(page: Page): Promise<void> {
  const dimmed = page.locator('.opacity-60');
  await expect(dimmed).toHaveCount(0, { timeout: 15_000 });
}

export function columnHeader(page: Page, name: string): Locator {
  return page.getByRole('columnheader', { name: new RegExp(`^${name}$`, 'i') });
}

/** Resolved background colour of an element, as an rgb(...) string. */
export async function bgColor(locator: Locator): Promise<string> {
  return locator.evaluate((element) => getComputedStyle(element).backgroundColor);
}

/** Parses rgb(r, g, b) / rgba(...) into channels. */
export function parseRgb(value: string): { r: number; g: number; b: number; a: number } {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) return { r: 255, g: 255, b: 255, a: 1 };
  const [red, green, blue, alpha] = match[1].split(',').map((entry) => Number(entry.trim()));
  return { r: red, g: green, b: blue, a: alpha ?? 1 };
}

/** Perceived lightness (0 black - 255 white), for "is this surface light?" checks. */
export function luminance(rgb: { r: number; g: number; b: number }): number {
  return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
}
