/*
 * meta routes: URL -> middleware -> controller. No request logic here;
 * the handlers are in controllers/meta.controller.ts.
 */
import { Router } from 'express';
import type { Env } from '../config/app.config';
import { requireAuth } from '../middleware/auth.middleware';
import { createMetaController } from '../controllers/meta.controller';

export function metaRouter(env: Env): Router {
  const router = Router();
  const controller = createMetaController(env);

  router.get('/', requireAuth(env), controller.getMeta);
  router.get('/assignable-users', requireAuth(env), controller.getAssignableUsers);
  router.get('/reporters', requireAuth(env), controller.getReporters);

  return router;
}
