/*
 * adminProducts routes: URL -> middleware -> controller. No request logic here;
 * the handlers are in controllers/adminProducts.controller.ts.
 */
import { Router } from 'express';
import type { Env } from '../config/app.config';
import { requireAuth, requirePermission } from '../middleware/auth.middleware';
import { createAdminProductsController } from '../controllers/adminProducts.controller';

export function adminProductsRouter(env: Env): Router {
  const router = Router();
  const controller = createAdminProductsController(env);
  const gate = [requireAuth(env), requirePermission('canManageProducts')];
  // Testers may look at products and add components; everything else is admin-only.
  const viewGate = [requireAuth(env), requirePermission('canViewProducts')];
  const componentGate = [requireAuth(env), requirePermission('canCreateComponents')];

  router.use(controller.announceDirectoryChanges);
  router.get('/', ...viewGate, controller.listProducts);
  router.post('/', ...gate, controller.createProduct);
  router.patch('/:id', ...gate, controller.updateProduct);
  router.delete('/:id', ...gate, controller.deleteProduct);
  router.post('/:id/components', ...componentGate, controller.createComponent);
  router.post('/:id/subcomponents', ...componentGate, controller.addSubcomponent);
  router.patch('/:id/subcomponents/:subId', ...gate, controller.editSubcomponent);
  router.patch('/:id/components/:componentId', ...componentGate, controller.updateComponent);
  router.delete('/:id/components/:componentId', ...componentGate, controller.deleteComponent);
  router.delete('/:id/subcomponents/:subId', ...gate, controller.deleteSubcomponent);

  return router;
}
