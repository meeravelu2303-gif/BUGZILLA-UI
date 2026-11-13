import { type Request } from 'express';
import { conflict } from '../helpers/errors.helper';
import { directoryClient, isServiceAccount } from './productTransfer.service';
import type { BugzillaClient } from '../clients/bugzilla.client';
import { env } from '../config/app.config';

export async function sendWelcome(
  client: BugzillaClient,
  userId: number,
  role: string,
  products: string[],
): Promise<{ sentTo: string }> {
  const result = await client.post<{ sent_to: string }>('/welcome', { user_id: userId, role, products });
  return { sentTo: result.sent_to };
}

export const directoryReaderFor = (req: Request) =>
  req.sessionUser!.permissions.canManageUsers ? req.bugzilla! : directoryClient(env);

export const assertUserDeletable = (req: { sessionUser?: { bzUserId: number } }, id: number, email: string) => {
  if (req.sessionUser?.bzUserId === id) {
    throw conflict('You cannot delete your own account.');
  }
  if (isServiceAccount(email)) {
    throw conflict('This is a service account the Bug Tracker needs. It cannot be deleted.');
  }
};
