import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../config/env';
import { adminExtension } from '../lib/adminExtension';
import { parseInput } from '../lib/validate';
import { requireAuth, requirePermission } from '../middleware/auth';
import { normalizeAdminComponent, rawAdminComponentSchema, updateComponentSchema } from '../schemas/adminComponent';

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/**
 * Component edit and delete. Bugzilla 5.2's REST API only creates components (that stays in
 * adminProducts.ts); these go through the UeducateAdmin extension, which uses Bugzilla::Component
 * itself - so its validation, the editcomponents permission check and the audit log all apply.
 */
export function adminComponentsRouter(env: Env): Router {
  const router = Router();
  const gate = [requireAuth(env), requirePermission('canManageProducts')];

  // GET /api/admin/components/by-product/:id  - a product's components with their bug counts.
  router.get('/by-product/:id', ...gate, async (req, res, next) => {
    try {
      const { id } = parseInput(idParamSchema, req.params);
      const resp = await adminExtension(req.bugzilla!).get<{ components: unknown[] }>(`/product/${id}/components`);
      const components = resp.components.map((c) => normalizeAdminComponent(rawAdminComponentSchema.parse(c)));
      res.json({ components });
    } catch (err) {
      next(err);
    }
  });

  // GET /api/admin/components/:id
  router.get('/:id', ...gate, async (req, res, next) => {
    try {
      const { id } = parseInput(idParamSchema, req.params);
      const resp = await adminExtension(req.bugzilla!).get<{ component: unknown }>(`/component/${id}`);
      res.json({ component: normalizeAdminComponent(rawAdminComponentSchema.parse(resp.component)) });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/admin/components/:id
  router.patch('/:id', ...gate, async (req, res, next) => {
    try {
      const { id } = parseInput(idParamSchema, req.params);
      const input = parseInput(updateComponentSchema, req.body);
      const payload: Record<string, unknown> = {};
      if (input.name !== undefined) payload.name = input.name;
      if (input.description !== undefined) payload.description = input.description;
      if (input.defaultAssignee !== undefined) payload.default_assignee = input.defaultAssignee;
      if (input.defaultQaContact !== undefined) payload.default_qa_contact = input.defaultQaContact;
      if (input.defaultCc !== undefined) payload.default_cc = input.defaultCc;
      if (input.isActive !== undefined) payload.is_active = input.isActive;

      const resp = await adminExtension(req.bugzilla!).put<{ component: unknown; changes?: Record<string, unknown> }>(
        `/component/${id}`,
        payload
      );
      res.json({
        component: normalizeAdminComponent(rawAdminComponentSchema.parse(resp.component)),
        changes: Object.keys(resp.changes ?? {}),
      });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/admin/components/:id  - refused by the extension unless the component has no bugs.
  router.delete('/:id', ...gate, async (req, res, next) => {
    try {
      const { id } = parseInput(idParamSchema, req.params);
      const resp = await adminExtension(req.bugzilla!).delete<{ name: string }>(`/component/${id}`);
      res.json({ deleted: true, name: resp.name });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
