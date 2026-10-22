import { bugzillaLoginCookie } from './changePassword';
import { AppError } from './errors';
import { errorText, fetchBugzillaPage, hiddenField, pageTitle, unexpectedPage } from './passwordReset';

/**
 * Deletes a component through Bugzilla's own admin page, editcomponents.cgi -
 * the same two-step form as product delete (lib/productDelete.ts), because
 * Bugzilla 5.2 has no WebService method for it.
 *
 * `action=del` renders a confirmation carrying a one-time `delete_component`
 * token; `action=delete` with it calls Bugzilla::Component::remove_from_db,
 * which REFUSES while the component:
 *
 *   - still has bugs ("Component has Bugs" - allowbugdeletion is off),
 *   - is the product's last one ("Last Component in this Product"),
 *   - still controls sub-component values ("Value Controls Other Fields").
 *
 * The route checks all three first so the user gets a plain answer; these
 * refusals are the safety net. Runs as the signed-in admin, so Bugzilla's own
 * permission check applies and its audit records the real person.
 */
export async function deleteComponentViaBugzilla(restBase: string, bzToken: string, productName: string, componentName: string): Promise<void> {
  const cookie = bugzillaLoginCookie(bzToken);

  const confirm = await fetchBugzillaPage(restBase, 'editcomponents.cgi', {
    method: 'GET',
    query: { action: 'del', product: productName, component: componentName },
    cookie,
  });
  const confirmTitle = pageTitle(confirm);
  if (/log in/i.test(confirmTitle) || /\bname="Bugzilla_password"/i.test(confirm)) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
  }
  if (/Access Denied/i.test(confirmTitle)) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to delete this component.');
  }
  const token = hiddenField(confirm, 'token');
  if (!token || !/^Delete component/i.test(confirmTitle)) throw unexpectedPage(confirm, 'open the component delete confirmation');

  const page = await fetchBugzillaPage(restBase, 'editcomponents.cgi', {
    cookie,
    fields: { action: 'delete', product: productName, component: componentName, token },
  });
  const title = pageTitle(page);
  // messages.html.tmpl: component_deleted -> "Component Deleted"
  if (/Component Deleted/i.test(title) || /\bhas been deleted\b/i.test(page)) return;
  if (/has Bugs/i.test(title) || /Last Component/i.test(title) || /Controls Other Fields/i.test(title)) {
    throw new AppError(409, 'CONFLICT', errorText(page) ?? 'Bugzilla refused to delete this component.');
  }
  throw unexpectedPage(page, 'delete the component');
}
