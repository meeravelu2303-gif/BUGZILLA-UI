import type { Request } from 'express';
import { forgetSession } from './sessionRegistry.service';

export const DEVICE_COOKIE_NAME = 'bz_device';

export const DEVICE_COOKIE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000;

export function readDeviceId(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== DEVICE_COOKIE_NAME) continue;

    const value = decodeURIComponent(part.slice(index + 1).trim());
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : undefined;
  }
  return undefined;
}

export function destroySession(req: Request, sessionId: string): void {
  forgetSession(sessionId);
  req.sessionStore.destroy(sessionId, (err) => {
    if (err) console.warn(`[auth] could not destroy evicted session ${sessionId}:`, err);
  });
}

export function maskLogin(login: string): string {
  const at = login.indexOf('@');
  return at > 0 ? `${login[0]}***${login.slice(at)}` : '***';
}
