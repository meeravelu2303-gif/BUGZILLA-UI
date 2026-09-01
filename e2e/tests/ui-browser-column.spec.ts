import { expect, test } from '@playwright/test';
import { PRODUCTS } from '../support/env';
import { columnHeader, filterByProduct, filterTrigger, gotoBugList, signIn, waitForTableSettled } from '../support/ui';

/**
 * The Browser column and its filter appear together, and only where "browser"
 * means anything.
 *
 * Both are driven by the same signal (`stats.byBrowser` for the current scope),
 * so these specs assert the pair - a column with no way to filter it, or a
 * filter for a column that is not rendered, are both real defects that a
 * single-sided test would miss.
 */
test.describe('conditional Browser column @visual', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await gotoBugList(page);
  });

  /**
   * Skips when the instance holds no browser-tagged bugs at all.
   *
   * The column is data-driven by design, so with an empty UI product there is
   * genuinely nothing to assert and the feature is working correctly by hiding
   * it. Failing here would report a product defect for what is really "the
   * bench has not run yet" - and a suite that cries wolf after every data reset
   * stops being read. Skipping states the reason instead.
   */
  async function requireBrowserData(page: import('@playwright/test').Page): Promise<void> {
    const res = await page.request.get(
      `http://localhost:4000/api/bugs/stats?product=${encodeURIComponent(PRODUCTS.ui)}`
    );
    const byBrowser = (await res.json().catch(() => null))?.byBrowser ?? {};
    test.skip(
      Object.keys(byBrowser).length === 0,
      `No browser-tagged bugs in "${PRODUCTS.ui}" - run the UI bench to populate them.`
    );
  }

  test(`is present, with pills, when filtered to ${PRODUCTS.ui}`, async ({ page }) => {
    await requireBrowserData(page);
    await filterByProduct(page, PRODUCTS.ui);

    await expect(columnHeader(page, 'Browser'), 'UI-bench bugs carry browser tags').toBeVisible();
    await expect(filterTrigger(page, /^All browser/i)).toBeVisible();

    /*
     * At least one row must show a real browser rather than the em-dash
     * fallback. Without this the spec would pass against a column of dashes,
     * which is the very thing the feature is meant to avoid.
     */
    const rows = page.locator('tbody tr');
    await expect(rows.first()).toBeVisible();
    const pills = page.locator('tbody tr td span', { hasText: /chromium|firefox|webkit|mobile chrome/i });
    expect(await pills.count(), 'expected at least one browser pill in a UI-product list')
      .toBeGreaterThan(0);
  });

  test(`is removed from the DOM when filtered to ${PRODUCTS.api}`, async ({ page }) => {
    await filterByProduct(page, PRODUCTS.api);

    // Removed, not merely hidden - an empty column of dashes is the defect.
    await expect(columnHeader(page, 'Browser')).toHaveCount(0);
    await expect(filterTrigger(page, /^All browser/i)).toHaveCount(0);

    /*
     * Header and body must agree. A stale colSpan or a header removed without
     * its cells would show up as a row whose cell count no longer matches the
     * header - misaligning every column after it.
     */
    const headerCount = await page.locator('thead th').count();
    const firstRowCells = await page.locator('tbody tr').first().locator('td').count();
    expect(firstRowCells, 'row cell count must match the header after the column is dropped')
      .toBe(headerCount);
  });

  test('the column returns when the filter is cleared', async ({ page }) => {
    await requireBrowserData(page);
    await filterByProduct(page, PRODUCTS.api);
    await expect(columnHeader(page, 'Browser')).toHaveCount(0);

    await page.getByRole('button', { name: /clear all/i }).click();
    await waitForTableSettled(page);

    await expect(
      columnHeader(page, 'Browser'),
      'an unfiltered list can contain UI bugs, so the column belongs'
    ).toBeVisible();
  });

  test('every visible column header is non-empty', async ({ page }) => {
    /*
     * Catches the specific failure mode of conditional columns: a `<th>` that
     * survives with no label because only its content was made conditional.
     * The first two are the checkbox and row-expander, which are icon-only by
     * design and carry screen-reader text instead.
     */
    const labels = await page.locator('thead th').allInnerTexts();
    for (const [i, label] of labels.entries()) {
      if (i < 2) continue;
      expect(label.trim(), `header ${i} should not be blank`).not.toBe('');
    }
  });
});
