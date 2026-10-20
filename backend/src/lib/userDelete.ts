import { bugzillaLoginCookie } from './changePassword';
import { AppError } from './errors';
import { fetchBugzillaPage, hiddenField, pageTitle, unexpectedPage } from './passwordReset';

/**
 * Safe user deletion, through Bugzilla's own editusers.cgi.
 *
 * Bugzilla 5.2 has no WebService method to delete a user. Its admin page does
 * the real work and - importantly - the real ACCOUNTING: `action=del` counts
 * everything that references the account (reported bugs, comments,
 * attachments, bug history, flags, component ownership...) and only renders
 * its delete form when the deletion is not "unsafe".
 *
 * But Bugzilla's notion of safe is looser than this app's. It happily deletes
 * the assignee of open bugs (they "fall back to the default assignee"), and an
 * admin can still force an unsafe delete from the native page. Here the rule is
 * strict: an account is deletable only when NOTHING points at it - no bugs
 * reported or assigned, no comments, attachments, history or ownership. Anyone
 * with a footprint is disabled instead, so their name stays on their work.
 *
 * Runs as the signed-in admin (their session presented as Bugzilla's login
 * cookies), so Bugzilla checks `editusers` itself and logs the real person.
 */

export interface DeletionCheck {
  deletable: boolean;
  /** Plain-language reasons the account cannot be deleted. Empty when it can. */
  blockers: string[];
}

function collapse(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, ' ')
    // Template whitespace leaves "3 bugs ." - close the gap before punctuation.
    .replace(/\s+([.,;:])/g, '$1')
    .trim();
}

/** The `<li>` items of the first `<ul>` after `marker`, as plain sentences up to "If you delete…". */
function listItemsAfter(html: string, marker: RegExp): string[] {
  const at = html.search(marker);
  if (at < 0) return [];
  const ul = /<ul[^>]*>([\s\S]*?)<\/ul>/i.exec(html.slice(at));
  if (!ul) return [];
  return [...ul[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((m) => collapse(m[1]).split(/\s+If you delete\b/i)[0].trim())
    .filter(Boolean);
}

async function loadConfirmation(restBase: string, bzToken: string, userId: number) {
  const cookie = bugzillaLoginCookie(bzToken);
  const page = await fetchBugzillaPage(restBase, 'editusers.cgi', {
    method: 'GET',
    query: { action: 'del', userid: String(userId) },
    cookie,
  });
  const title = pageTitle(page);
  if (/log in/i.test(title) || /\bname="Bugzilla_password"/i.test(page)) {
    throw new AppError(401, 'UNAUTHENTICATED', 'Your session has expired. Please sign in again.');
  }
  // user-error: users_deletion_disabled
  if (/Deletion not allowed|deletion.*disabled/i.test(title)) {
    throw new AppError(409, 'CONFLICT', 'User deletion is switched off in Bugzilla (Parameters > allowuserdeletion).');
  }
  if (/Authorization Required|not authorized/i.test(title)) {
    throw new AppError(403, 'FORBIDDEN', 'You do not have permission to delete users.');
  }
  if (!/\bdelete/i.test(title)) throw unexpectedPage(page, 'open the user delete confirmation');
  return { page, cookie };
}

export async function checkUserDeletion(restBase: string, bzToken: string, userId: number): Promise<DeletionCheck> {
  const { page } = await loadConfirmation(restBase, bzToken, userId);
  return parseDeletionPage(page);
}

/** Reads Bugzilla's delete confirmation page. Pure, so it can be checked against rendered templates. */
export function parseDeletionPage(page: string): DeletionCheck {
  const blockers: string[] = [];

  // Component ownership: Bugzilla refuses outright.
  if (/can'?t delete this user at this time/i.test(collapse(page))) {
    const owned = listItemsAfter(page, /can'?t delete this user at this time/i);
    blockers.push(owned.length ? `Default assignee or QA contact of: ${owned.join('; ')}` : 'Owns one or more components (default assignee or QA contact).');
  }
  // History Bugzilla itself calls unsafe to delete.
  blockers.push(...listItemsAfter(page, /deletions are\s*<b>\s*unsafe/i));
  // Stricter than Bugzilla: still the assignee or QA contact of bugs.
  for (const item of listItemsAfter(page, /deletions are\s*<b>\s*safe/i)) {
    if (/assignee or the QA contact/i.test(item)) blockers.push(item);
  }

  const formToken = hiddenField(page, 'token');
  return { deletable: blockers.length === 0 && !!formToken, blockers };
}

export async function deleteUserViaBugzilla(restBase: string, bzToken: string, userId: number): Promise<void> {
  const check = await checkUserDeletion(restBase, bzToken, userId);
  if (!check.deletable) {
    throw new AppError(409, 'CONFLICT', 'This account has history, so it cannot be deleted. Disable it instead.', undefined, {
      blockers: check.blockers,
    });
  }
  // Fresh confirmation for a fresh one-time token (the check's page was a read).
  const { page: confirm, cookie } = await loadConfirmation(restBase, bzToken, userId);
  const token = hiddenField(confirm, 'token');
  if (!token) throw unexpectedPage(confirm, 'get the delete confirmation token');

  const page = await fetchBugzillaPage(restBase, 'editusers.cgi', {
    cookie,
    fields: { action: 'delete', userid: String(userId), token },
  });
  // messages.html.tmpl: account_deleted -> "User <login> deleted"
  if (/\bdeleted\b/i.test(pageTitle(page)) || /has been deleted/i.test(page)) return;
  throw unexpectedPage(page, 'delete the user');
}
