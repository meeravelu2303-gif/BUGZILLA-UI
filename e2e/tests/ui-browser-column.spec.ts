import { expect, test } from '@playwright/test';
import { PRODUCTS } from '../support/env';
import { columnHeader, filterByProduct, filterTrigger, gotoBugList, signIn, waitForTableSettled } from '../support/ui';

test.describe('conditional Browser column @visual', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await gotoBugList(page);
  });

  async function requireBrowserData(page: import('@playwright/test').Page): Promise<void> {
    const res = await page.request.get(
      `http://localhost:4000/api/bugs/stats?product=${encodeURIComponent(PRODUCTS.ui)}`,
    );
    const byBrowser = (await res.json().catch(() => null))?.byBrowser ?? {};
    test.skip(
      Object.keys(byBrowser).length === 0,
      `No browser-tagged bugs in "${PRODUCTS.ui}" - run the UI bench to populate them.`,
    );
  }

  test(`is present, with pills, when filtered to ${PRODUCTS.ui}`, async ({ page }) => {
    await requireBrowserData(page);
    await filterByProduct(page, PRODUCTS.ui);

    await expect(columnHeader(page, 'Browser'), 'UI-bench bugs carry browser tags').toBeVisible();
    await expect(filterTrigger(page, /^All browser/i)).toBeVisible();

    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    const pills = page.locator('tbody tr td span', { hasText: /chromium|firefox|webkit|mobile chrome/i });
    expect(await pills.count(), 'expected at least one browser pill in a UI-product list').toBeGreaterThan(0);
  });

  test(`is removed from the DOM when filtered to ${PRODUCTS.api}`, async ({ page }) => {
    await filterByProduct(page, PRODUCTS.api);

    await expect(columnHeader(page, 'Browser')).toHaveCount(0);
    await expect(filterTrigger(page, /^All browser/i)).toHaveCount(0);

    const headerCount = await page.locator('thead th').count();
    const firstRowCells = await page.locator('tbody tr').first().locator('td').count();
    expect(firstRowCells, 'row cell count must match the header after the column is dropped').toBe(headerCount);
  });

  test('the column returns when the filter is cleared', async ({ page }) => {
    await requireBrowserData(page);
    await filterByProduct(page, PRODUCTS.api);
    await expect(columnHeader(page, 'Browser')).toHaveCount(0);

    await page.getByRole('button', { name: /clear all/i }).click();
    await waitForTableSettled(page);

    await expect(
      columnHeader(page, 'Browser'),
      'an unfiltered list can contain UI bugs, so the column belongs',
    ).toBeVisible();
  });

  test('every visible column header is non-empty', async ({ page }) => {
    const labels = await page.locator('thead th').allInnerTexts();
    for (const [i, label] of labels.entries()) {
      if (i < 2) continue;
      expect(label.trim(), `header ${i} should not be blank`).not.toBe('');
    }
  });
});
