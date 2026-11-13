/*
 * adminUsers routes: URL -> middleware -> controller. No request logic here;
 * the handlers are in controllers/adminUsers.controller.ts.
 */
import { Router } from 'express';
import type { Env } from '../config/app.config';
import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { createAdminUsersController } from '../controllers/adminUsers.controller';

export function adminUsersRouter(env: Env): Router {
  const router = Router();
  const controller = createAdminUsersController(env);
  const gate = [requireAuth(env), requirePermission('canManageUsers')];
  /*
   * Testers may LIST and OPEN accounts, read-only. Bugzilla shows group
   * membership only to editusers, so their reads go through the service key;
   * every write below stays on `gate` and the caller's own session.
   */
  const viewGate = [requireAuth(env), requirePermission('canViewUsers')];

  router.use(controller.announceDirectoryChanges);
  router.get('/', ...viewGate, controller.listUsers);
  router.get('/:id', ...viewGate, controller.getUser);
  router.post('/', ...gate, controller.createUser);
  router.post('/:id/welcome', ...gate, controller.sendWelcomeEmail);
  router.patch('/:id', ...gate, controller.updateUser);
  router.get('/:id/delete-check', ...gate, controller.getDeleteCheck);
  router.delete('/:id', ...gate, controller.deleteUser);

  return router;
}
