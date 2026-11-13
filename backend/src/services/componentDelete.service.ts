import { bugzillaLoginCookie } from './changePassword.service';
import { unauthenticated, forbidden, conflict } from '../helpers/errors.helper';
import { errorText, fetchBugzillaPage, hiddenField, pageTitle, unexpectedPage } from './passwordReset.service';

/** Deletes a component through Bugzilla's own admin page. */
export async function deleteComponentViaBugzilla(
  restBase: string,
  bzToken: string,
  productName: string,
  componentName: string,
): Promise<void> {
  const cookie = bugzillaLoginCookie(bzToken);

  const confirm = await fetchBugzillaPage(restBase, 'editcomponents.cgi', {
    method: 'GET',
    query: { action: 'del', product: productName, component: componentName },
    cookie,
  });
  const confirmTitle = pageTitle(confirm);
  if (/log in/i.test(confirmTitle) || /\bname="Bugzilla_password"/i.test(confirm)) {
    throw unauthenticated('Your session has expired. Please sign in again.');
  }
  if (/Access Denied/i.test(confirmTitle)) {
    throw forbidden('You do not have permission to delete this component.');
  }
  const token = hiddenField(confirm, 'token');
  if (!token || !/^Delete component/i.test(confirmTitle))
    throw unexpectedPage(confirm, 'open the component delete confirmation');

  const page = await fetchBugzillaPage(restBase, 'editcomponents.cgi', {
    cookie,
    fields: { action: 'delete', product: productName, component: componentName, token },
  });
  const title = pageTitle(page);
  if (/Component Deleted/i.test(title) || /\bhas been deleted\b/i.test(page)) return;
  if (/has Bugs/i.test(title) || /Last Component/i.test(title) || /Controls Other Fields/i.test(title)) {
    throw conflict(errorText(page) ?? 'Bugzilla refused to delete this component.');
  }
  throw unexpectedPage(page, 'delete the component');
}
