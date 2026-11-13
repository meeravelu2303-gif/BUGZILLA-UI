/*
 * products routes: URL -> middleware -> controller. No request logic here;
 * the handlers are in controllers/products.controller.ts.
 */
import { Router } from 'express';
import type { Env } from '../config/app.config';
import { requireAuth } from '../middleware/auth.middleware';
import { createProductsController } from '../controllers/products.controller';

export function productsRouter(env: Env): Router {
  const router = Router();
  const controller = createProductsController(env);

  router.get('/', requireAuth(env), controller.listProducts);

  return router;
}
