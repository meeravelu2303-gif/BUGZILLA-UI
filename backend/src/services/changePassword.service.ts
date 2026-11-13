import { badRequest, unauthenticated } from '../helpers/errors.helper';
import { errorText, fetchBugzillaPage, hiddenField, pageTitle, unexpectedPage } from './passwordReset.service';

/** Change password for the signed-in user. */
export function bugzillaLoginCookie(bzToken: string): string {
  const dash = bzToken.indexOf('-');
  const userId = dash > 0 ? bzToken.slice(0, dash) : '';
  const cookie = dash > 0 ? bzToken.slice(dash + 1) : '';
  if (!/^\d+$/.test(userId) || !/^[\w.~-]+$/.test(cookie)) {
    throw unauthenticated('Your session is no longer valid. Please sign in again.');
  }
  return `Bugzilla_login=${userId}; Bugzilla_logincookie=${cookie}`;
}

function isLoginPage(html: string): boolean {
  return /\bname="Bugzilla_password"/i.test(html) && !/\bname="new_password1"/i.test(html);
}

export async function changeOwnPassword(
  restBase: string,
  bzToken: string,
  currentPassword: string,
  newPassword: string,
  fallbackRealName: string,
): Promise<void> {
  const cookie = bugzillaLoginCookie(bzToken);

  const form = await fetchBugzillaPage(restBase, 'userprefs.cgi', { method: 'GET', query: { tab: 'account' }, cookie });
  if (isLoginPage(form)) {
    throw unauthenticated('Your session has expired. Please sign in again.');
  }
  const token = hiddenField(form, 'token');
  if (!token || !/\bname="new_password1"/i.test(form)) {
    throw unexpectedPage(form, 'open the change-password form');
  }
  const realname = hiddenField(form, 'realname') ?? fallbackRealName;

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

  if (/<div[^>]*\bid="message"[^>]*>[\s\S]*?have been saved/i.test(page)) return;

  const title = pageTitle(page);
  if (title === 'Incorrect Password') {
    throw badRequest('Your current password is incorrect.', undefined, {
      reason: 'current_password_incorrect',
    });
  }
  if (/password/i.test(title)) {
    throw badRequest(errorText(page) ?? title, undefined, { reason: 'password_rejected' });
  }
  if (isLoginPage(page)) {
    throw unauthenticated('Your session has expired. Please sign in again.');
  }
  throw unexpectedPage(page, 'change the password');
}
