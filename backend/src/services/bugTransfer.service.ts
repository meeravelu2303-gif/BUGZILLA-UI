import { type Request } from 'express';
import { allProductNames, parseTransferRoutes, transferTargetsFor } from './productTransfer.service';
import { env } from '../config/app.config';

export const transferRoutes = parseTransferRoutes(env.PRODUCT_TRANSFER_ROUTES);

export async function accessibleProductList(_req: Request): Promise<string[]> {
  return allProductNames(env);
}

export function transferTargetNames(from: string, accessible: string[]): string[] {
  const byKey = new Map<string, string>();
  for (const name of [...accessible, ...transferTargetsFor(from, transferRoutes)]) {
    if (name.toLowerCase() !== from.toLowerCase()) byKey.set(name.toLowerCase(), name);
  }
  return [...byKey.values()];
}
