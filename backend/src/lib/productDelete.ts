import { bugzillaLoginCookie } from './changePassword';
import { AppError } from './errors';
import { errorText, fetchBugzillaPage, hiddenField, pageTitle, unexpectedPage } from './passwordReset';

/**
 * Deletes a product through Bugzilla's own admin page, editproducts.cgi.
 *
 * There is no WebService method for this in Bugzilla 5.2. The admin page is a
 * two-step form: `action=del` renders a confirmation carrying a one-time
 * `delete_product` token, and `action=delete` with that token calls
 * Bugzilla::Product::remove_from_db - which removes the product's components,
 * versions, milestones and group controls, and REFUSES ("Product has Bugs")
 * while any bug remains, because `allowbugdeletion` is off. That refusal is the
 * safety net; the route checks the bug count first so the user gets a clear
 * answer before anything is posted.
 *
 * Runs as the signed-in admin (their session token presented as Bugzilla's
 * login cookies), so Bugzilla's own check_can_admin_product applies and its
 * audit records the real person.
 */
export async function deleteProductViaBugzilla(restBase: string, bzToken: string, productName: string): Promise<void> {
  const cookie = bugzillaLoginCookie(bzToken);

  // 1. The confirmation page: proves admin rights and yields the token.
  const confirm = await fetchBugzillaPage(restBase, 'editproducts.cgi', {
    method: 'GET',
    query: { action: 'del', product: productName },
    cookie,
  });
  const confirmTitle = pageTitle(confirm);
  if (/log in/i.test(confirmTitle) || /\bname="Bugzilla_password"/i.test(confirm)) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
  }
  if (/Access Denied/i.test(confirmTitle)) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to delete this product.');
  }
  const token = hiddenField(confirm, 'token');
  if (!token || !/^Delete Product/i.test(confirmTitle)) throw unexpectedPage(confirm, 'open the product delete confirmation');

  // 2. The delete itself. delete_series=1 also removes the product's chart data.
  const page = await fetchBugzillaPage(restBase, 'editproducts.cgi', {
    cookie,
    fields: { action: 'delete', product: productName, token, delete_series: '1' },
  });
  const title = pageTitle(page);
  // messages.html.tmpl: product_deleted -> "Product Deleted" (rendered on the product list page)
  if (/Product Deleted/i.test(title) || /\bhave been deleted\b/i.test(page)) return;
  // user-error.html.tmpl: product_has_bugs -> "Product has Bugs"
  if (/has Bugs/i.test(title)) {
    throw new AppError(409, 'CONFLICT', errorText(page) ?? 'This product still has bugs and cannot be deleted. Deactivate it instead.');
  }
  throw unexpectedPage(page, 'delete the product');
}
