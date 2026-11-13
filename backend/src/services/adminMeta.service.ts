import { type Request } from 'express';

export const isAdmin = (req: Request) =>
  Boolean(req.sessionUser?.permissions.canManageUsers || req.sessionUser?.permissions.canManageProducts);
