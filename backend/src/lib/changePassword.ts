import { AppError } from './errors';
import { errorText, fetchBugzillaPage, hiddenField, pageTitle, unexpectedPage } from './passwordReset';

/**
 * Change password for the signed-in user, through Bugzilla's own
 * Preferences -> Account form (userprefs.cgi?tab=account).
 *
 * Why not the API: `User.update` refuses anyone outside `editusers`, so it
 * only lets admins set passwords. The account form is the one place Bugzilla
 * lets an ordinary user change their own, and it checks the current password
 * first - which is exactly the rule this feature should enforce.
 *
 * The session's Bugzilla token (`<userid>-<cookie>`, from User.login) is the
 * same value Bugzilla's web UI keeps in its `Bugzilla_login` and
 * `Bugzilla_logincookie` cookies, so the BFF can present it as those cookies
 * and act as the user without ever seeing the password again.
 *
 * On success Bugzilla calls `logout(LOGOUT_KEEP_CURRENT)`: every other login
 * of the account is deleted and the one used here survives, so this browser
 * stays signed in and every other device is sent back to sign in.
 */

/** `12-AbCdEf` -> the two cookies Bugzilla's CGI authentication reads. */
export function bugzillaLoginCookie(bzToken: string): string {
  const dash = bzToken.indexOf('-');
  const userId = dash > 0 ? bzToken.slice(0, dash) : '';
  const cookie = dash > 0 ? bzToken.slice(dash + 1) : '';
  if (!/^\d+$/.test(userId) || !/^[\w.~-]+$/.test(cookie)) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Your session is no longer valid. Please sign in again.');
  }
  return `Bugzilla_login=${userId}; Bugzilla_logincookie=${cookie}`;
}

/** Bugzilla renders its login form when the cookie it was given is no longer valid. */
function isLoginPage(html: string): boolean {
  return /\bname="Bugzilla_password"/i.test(html) && !/\bname="new_password1"/i.test(html);
}

export async function changeOwnPassword(
  restBase: string,
  bzToken: string,
  currentPassword: string,
  newPassword: string,
  fallbackRealName: string
): Promise<void> {
  const cookie = bugzillaLoginCookie(bzToken);

  /*
   * 1. Load the form. It carries the one-time `edit_user_prefs` token that
   *    userprefs.cgi checks on save, and the account's current real name -
   *    which must be sent back, because SaveAccount sets the name from the
   *    form unconditionally and would blank it otherwise.
   *
   *    The GET carries no secret, so the session is checked here, BEFORE any
   *    password is sent. That matters: with an invalid cookie, userprefs.cgi
   *    falls back to logging in with `old_password` from the form.
   */
  const form = await fetchBugzillaPage(restBase, 'userprefs.cgi', { method: 'GET', query: { tab: 'account' }, cookie });
  if (isLoginPage(form)) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
  }
  const token = hiddenField(form, 'token');
  if (!token || !/\bname="new_password1"/i.test(form)) {
    // user_verify_class without DB hides the password fields entirely.
    throw unexpectedPage(form, 'open the change-password form');
  }
  const realname = hiddenField(form, 'realname') ?? fallbackRealName;

  // 2. Save. Same fields the form posts.
  const page = await fetchBugzillaPage(restBase, 'userprefs.cgi', {
    cookie,
    fields: {
      tab: 'account',
      dosave: '1',
      token,
      old_password: currentPassword,
      new_password1: newPassword,
      new_password2: newPassword,
      realname,
    },
  });

  // prefs.html.tmpl: <div id="message">The changes to your ... have been saved.
  if (/<div[^>]*\bid="message"[^>]*>[\s\S]*?have been saved/i.test(page)) return;

  const title = pageTitle(page);
  // user-error.html.tmpl: old_password_incorrect -> "Incorrect Password"
  if (title === 'Incorrect Password') {
    throw new AppError(400, 'VALIDATION', 'Your current password is incorrect.', undefined, { reason: 'current_password_incorrect' });
  }
  // "Password Too Short", "Passwords Don't Match", "Password Fails Requirements", "New Password Missing"
  if (/password/i.test(title)) {
    throw new AppError(400, 'VALIDATION', errorText(page) ?? title, undefined, { reason: 'password_rejected' });
  }
  if (isLoginPage(page)) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
  }
  throw unexpectedPage(page, 'change the password');
}
