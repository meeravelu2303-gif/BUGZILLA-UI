/*
 * adminTeams routes: URL -> middleware -> controller. No request logic here;
 * the handlers are in controllers/adminTeams.controller.ts.
 */
import { Router } from 'express';
import type { Env } from '../config/app.config';
import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { createAdminTeamsController } from '../controllers/adminTeams.controller';

export function adminTeamsRouter(env: Env): Router {
  const router = Router();
  const controller = createAdminTeamsController(env);
  const gate = [requireAuth(env), requirePermission('canManageUsers')];

  router.get('/', ...gate, controller.listTeams);
  router.post('/', ...gate, controller.createTeam);
  router.patch('/:id', ...gate, controller.updateTeam);
  router.delete('/:id', ...gate, controller.deleteTeam);

  return router;
}
