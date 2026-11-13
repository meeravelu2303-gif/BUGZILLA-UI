import { bugzillaLoginCookie } from './changePassword.service';
import { unauthenticated, forbidden, conflict } from '../helpers/errors.helper';
import { fetchBugzillaPage, hiddenField, pageTitle, unexpectedPage } from './passwordReset.service';

/** Safe user deletion, through Bugzilla's own editusers.cgi. */
export interface DeletionCheck {
  deletable: boolean;
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
    .replace(/&#(\d+);/g, (_, captured: string) => String.fromCharCode(Number(captured)))
    .replace(/\s+/g, ' ')
    .replace(/\s+([.,;:])/g, '$1')
    .trim();
}

function listItemsAfter(html: string, marker: RegExp): string[] {
  const at = html.search(marker);
  if (at < 0) return [];
  const match = /<ul[^>]*>([\s\S]*?)<\/ul>/i.exec(html.slice(at));
  if (!match) return [];
  return [...match[1].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
    .map((item) =>
      collapse(item[1])
        .split(/\s+If you delete\b/i)[0]
        .trim(),
    )
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
    throw unauthenticated('Your session has expired. Please sign in again.');
  }
  if (/Deletion not allowed|deletion.*disabled/i.test(title)) {
    throw conflict('User deletion is switched off in Bugzilla (Parameters > allowuserdeletion).');
  }
  if (/Authorization Required|not authorized/i.test(title)) {
    throw forbidden('You do not have permission to delete users.');
  }
  if (!/\bdelete/i.test(title)) throw unexpectedPage(page, 'open the user delete confirmation');
  return { page, cookie };
}

export async function checkUserDeletion(restBase: string, bzToken: string, userId: number): Promise<DeletionCheck> {
  const { page } = await loadConfirmation(restBase, bzToken, userId);
  return parseDeletionPage(page);
}

/** Reads Bugzilla's delete confirmation page. */
export function parseDeletionPage(page: string): DeletionCheck {
  const blockers: string[] = [];

  if (/can'?t delete this user at this time/i.test(collapse(page))) {
    const owned = listItemsAfter(page, /can'?t delete this user at this time/i);
    blockers.push(
      owned.length
        ? `Default assignee or QA contact of: ${owned.join('; ')}`
        : 'Owns one or more components (default assignee or QA contact).',
    );
  }
  blockers.push(...listItemsAfter(page, /deletions are\s*<b>\s*unsafe/i));
  for (const item of listItemsAfter(page, /deletions are\s*<b>\s*safe/i)) {
    if (/assignee or the QA contact/i.test(item)) blockers.push(item);
  }

  const formToken = hiddenField(page, 'token');
  return { deletable: blockers.length === 0 && !!formToken, blockers };
}

export async function deleteUserViaBugzilla(restBase: string, bzToken: string, userId: number): Promise<void> {
  const check = await checkUserDeletion(restBase, bzToken, userId);
  if (!check.deletable) {
    throw conflict('This account has history, so it cannot be deleted. Disable it instead.', undefined, {
      blockers: check.blockers,
    });
  }
  const { page: confirm, cookie } = await loadConfirmation(restBase, bzToken, userId);
  const token = hiddenField(confirm, 'token');
  if (!token) throw unexpectedPage(confirm, 'get the delete confirmation token');

  const page = await fetchBugzillaPage(restBase, 'editusers.cgi', {
    cookie,
    fields: { action: 'delete', userid: String(userId), token },
  });
  if (/\bdeleted\b/i.test(pageTitle(page)) || /has been deleted/i.test(page)) return;
  throw unexpectedPage(page, 'delete the user');
}
