import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../config/env';
import { requireAuth, requirePermission } from '../middleware/auth';
import { parseInput } from '../lib/validate';
import { AppError } from '../lib/errors';
import { normalizeProduct, rawProductSchema } from '../schemas/product';
import { createComponentSchema, createProductSchema, updateProductSchema } from '../schemas/adminProduct';

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

async function fetchProduct(client: { get<T>(path: string, params?: Record<string, unknown>): Promise<T> }, id: number) {
  const resp = await client.get<{ products: unknown[] }>('/product', { ids: [id] });
  const raw = resp.products[0];
  if (!raw) throw new AppError(404, 'NOT_FOUND', 'That product could not be found.');
  return normalizeProduct(rawProductSchema.parse(raw));
}

export function adminProductsRouter(env: Env): Router {
  const router = Router();
  const gate = [requireAuth(env), requirePermission('canManageProducts')];

  // GET /api/admin/products
  // Uses product_accessible rather than the public /api/products' product_enterable:
  // Bugzilla excludes componentless products from "enterable" (nothing to file a bug
  // against yet), which would make a freshly created product invisible on the very
  // page meant to let you add its first component. "Accessible" has no such gate.
  router.get('/', ...gate, async (req, res, next) => {
    try {
      const client = req.bugzilla!;
      const accessible = await client.get<{ ids: number[] }>('/product_accessible');
      if (accessible.ids.length === 0) {
        res.json({ products: [] });
        return;
      }
      const full = await client.get<{ products: unknown[] }>('/product', { ids: accessible.ids });
      const products = full.products.map((p) => normalizeProduct(rawProductSchema.parse(p)));
      res.json({ products });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/admin/products
  router.post('/', ...gate, async (req, res, next) => {
    try {
      const input = parseInput(createProductSchema, req.body);
      const client = req.bugzilla!;

      const created = await client.post<{ id: number }>('/product', {
        name: input.name,
        description: input.description,
        version: input.version,
      });

      const product = await fetchProduct(client, created.id);
      res.status(201).json({ product });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/admin/products/:id
  router.patch('/:id', ...gate, async (req, res, next) => {
    try {
      const { id } = parseInput(idParamSchema, req.params);
      const input = parseInput(updateProductSchema, req.body);
      const client = req.bugzilla!;

      const payload: Record<string, string | boolean> = {};
      if (input.description !== undefined) payload.description = input.description;
      if (input.isActive !== undefined) payload.is_active = input.isActive;

      await client.put(`/product/${id}`, payload);

      const product = await fetchProduct(client, id);
      res.json({ product });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/admin/products/:id/components
  router.post('/:id/components', ...gate, async (req, res, next) => {
    try {
      const { id } = parseInput(idParamSchema, req.params);
      const input = parseInput(createComponentSchema, req.body);
      const client = req.bugzilla!;

      const productBeforeCreate = await fetchProduct(client, id);

      await client.post('/component', {
        product: productBeforeCreate.name,
        name: input.name,
        description: input.description,
        default_assignee: input.defaultAssignee,
      });

      const product = await fetchProduct(client, id);
      res.status(201).json({ product });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
