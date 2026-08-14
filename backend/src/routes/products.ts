import { Router } from 'express';
import type { Env } from '../config/env';
import { requireAuth } from '../middleware/auth';
import { normalizeProduct, rawProductSchema } from '../schemas/product';

export function productsRouter(env: Env): Router {
  const router = Router();

  router.get('/', requireAuth(env), async (req, res, next) => {
    try {
      const client = req.bugzilla!;
      const enterable = await client.get<{ ids: number[] }>('/product_enterable');
      if (enterable.ids.length === 0) {
        res.json({ products: [] });
        return;
      }
      const full = await client.get<{ products: unknown[] }>('/product', { ids: enterable.ids });
      const products = full.products.map((p) => normalizeProduct(rawProductSchema.parse(p)));
      res.json({ products });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
