/*
 * adminMeta routes: URL -> middleware -> controller. No request logic here;
 * the handlers are in controllers/adminMeta.controller.ts.
 */
import { Router } from 'express';
import type { Env } from '../config/app.config';
import { requireAuth } from '../middleware/auth.middleware';
import { createAdminMetaController } from '../controllers/adminMeta.controller';

export function adminMetaRouter(env: Env): Router {
  const router = Router();
  const controller = createAdminMetaController();
  const auth = requireAuth(env);

  router.get('/parameters', auth, controller.getParameters);
  router.get('/groups', auth, controller.getGroups);

  return router;
}
