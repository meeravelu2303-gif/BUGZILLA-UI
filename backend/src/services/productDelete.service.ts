import { bugzillaLoginCookie } from './changePassword.service';
import { unauthenticated, forbidden, conflict } from '../helpers/errors.helper';
import { errorText, fetchBugzillaPage, hiddenField, pageTitle, unexpectedPage } from './passwordReset.service';

/** Deletes a product through Bugzilla's own admin page, editproducts.cgi. */
export async function deleteProductViaBugzilla(restBase: string, bzToken: string, productName: string): Promise<void> {
  const cookie = bugzillaLoginCookie(bzToken);

  const confirm = await fetchBugzillaPage(restBase, 'editproducts.cgi', {
    method: 'GET',
    query: { action: 'del', product: productName },
    cookie,
  });
  const confirmTitle = pageTitle(confirm);
  if (/log in/i.test(confirmTitle) || /\bname="Bugzilla_password"/i.test(confirm)) {
    throw unauthenticated('Your session has expired. Please sign in again.');
  }
  if (/Access Denied/i.test(confirmTitle)) {
    throw forbidden('You do not have permission to delete this product.');
  }
  const token = hiddenField(confirm, 'token');
  if (!token || !/^Delete Product/i.test(confirmTitle))
    throw unexpectedPage(confirm, 'open the product delete confirmation');

  const page = await fetchBugzillaPage(restBase, 'editproducts.cgi', {
    cookie,
    fields: { action: 'delete', product: productName, token, delete_series: '1' },
  });
  const title = pageTitle(page);
  if (/Product Deleted/i.test(title) || /\bhave been deleted\b/i.test(page)) return;
  if (/has Bugs/i.test(title)) {
    throw conflict(errorText(page) ?? 'This product still has bugs and cannot be deleted. Deactivate it instead.');
  }
  throw unexpectedPage(page, 'delete the product');
}
