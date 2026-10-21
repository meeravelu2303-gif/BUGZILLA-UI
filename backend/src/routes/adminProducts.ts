import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../config/env';
import { clearAccessScope } from '../lib/access';
import { clearGroupNameCache } from '../lib/bugFeatures';
import { BugzillaClient } from '../lib/bugzillaClient';
import { clearCategoryIndex } from '../lib/categoryIndex';
import { deleteProductViaBugzilla } from '../lib/productDelete';
import { groupNameForProduct } from '../lib/productGroups';
import { directoryClient, parseTransferRoutes } from '../lib/productTransfer';
import { requireAuth, requirePermission } from '../middleware/auth';
import { parseInput } from '../lib/validate';
import { getBugSnapshot } from '../lib/bugSnapshot';
import { clearMemo, memo } from '../lib/memo';
import { AppError } from '../lib/errors';
import { normalizeProduct, rawProductSchema } from '../schemas/product';
import { createComponentSchema, createProductSchema, deleteProductSchema, updateProductSchema } from '../schemas/adminProduct';

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/**
 * Bugs per product name, every bug the caller can see (an admin sees them all,
 * soft-deleted ones included - which Bugzilla's delete also counts). One search
 * returning only the product field, so the whole instance costs one request.
 */
async function bugCountsByProduct(env: Env) {
  // From the in-memory snapshot (lib/bugSnapshot.ts) rather than a full pass through Bugzilla.
  const snap = await getBugSnapshot(env);
  const counts = new Map<string, number>();
  for (const b of snap.rows) {
    const key = b.product.toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

async function fetchProduct(client: { get<T>(path: string, params?: Record<string, unknown>): Promise<T> }, id: number) {
  const resp = await client.get<{ products: unknown[] }>('/product', { ids: [id] });
  const raw = resp.products[0];
  if (!raw) throw new AppError(404, 'NOT_FOUND', 'That product could not be found.');
  return normalizeProduct(rawProductSchema.parse(raw));
}

export function adminProductsRouter(env: Env): Router {
  const router = Router();
  const gate = [requireAuth(env), requirePermission('canManageProducts')];
  // Testers may look at products and add components; everything else is admin-only.
  const viewGate = [requireAuth(env), requirePermission('canViewProducts')];
  const componentGate = [requireAuth(env), requirePermission('canCreateComponents')];

  // GET /api/admin/products
  // Uses product_accessible rather than the public /api/products' product_enterable:
  // Bugzilla excludes componentless products from "enterable" (nothing to file a bug
  // against yet), which would make a freshly created product invisible on the very
  // page meant to let you add its first component. "Accessible" has no such gate.
  router.get('/', ...viewGate, async (req, res, next) => {
    try {
      const client = req.bugzilla!;
      // Memoized per user for a minute (lib/memo.ts): two CGI round trips otherwise paid on every visit.
      const uid = req.sessionUser!.bzUserId;
      const accessible = await memo('admin-products', `accessible:${uid}`, 60_000, () => client.get<{ ids: number[] }>('/product_accessible'));
      if (accessible.ids.length === 0) {
        res.json({ products: [] });
        return;
      }
      const [full, counts] = await Promise.all([
        memo('admin-products', `products:${uid}:${accessible.ids.join(',')}`, 60_000, () => client.get<{ products: unknown[] }>('/product', { ids: accessible.ids })),
        bugCountsByProduct(env),
      ]);
      const products = full.products.map((p) => {
        const product = normalizeProduct(rawProductSchema.parse(p));
        // Delete is only possible at 0 - Bugzilla refuses otherwise - so the UI needs the number.
        return { ...product, bugCount: counts.get(product.name.toLowerCase()) ?? 0 };
      });
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

      // A new product changes what every user may enter, so the cached access
      // snapshots are stale for everyone, not just the caller.
      clearAccessScope();
      clearMemo('admin-products');
      clearMemo('directory');

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

      const before = await fetchProduct(client, id);
      const renaming = input.name !== undefined && input.name !== before.name;

      const payload: Record<string, string | boolean> = {};
      if (renaming) payload.name = input.name!;
      if (input.description !== undefined) payload.description = input.description;
      if (input.isActive !== undefined) payload.is_active = input.isActive;

      // On the admin's own token: Bugzilla checks editcomponents and the name's uniqueness.
      await client.put(`/product/${id}`, payload);

      const warnings: string[] = [];
      if (renaming) {
        /*
         * This app finds a product's access group by NAME (lib/productGroups.ts):
         * product "KPost UI" is gated by group "KPost UI". Renaming only the
         * product would silently cut that link - the product would stop being
         * scoped and its team would vanish from the assignee lists - so the
         * same-named group is renamed with it.
         *
         * On the service key: Group.update needs creategroups, which an admin
         * holding only editcomponents does not have. The product rename above
         * already succeeded under the caller's own rights.
         */
        const service = new BugzillaClient(env.BUGZILLA_URL, { kind: 'api_key', apiKey: env.BUGZILLA_API_KEY });
        try {
          const groups = await service.get<{ groups: { id: number; name: string }[] }>('/group', { membership: 0 });
          const gate = groupNameForProduct(before.name, (groups.groups ?? []).map((g) => g.name));
          // By numeric id: the REST->RPC adapter sends a path segment as `ids`, which Group.update reads as numbers.
          const gateId = groups.groups?.find((g) => g.name === gate)?.id;
          if (gateId !== undefined) await service.put(`/group/${gateId}`, { name: input.name });
        } catch (err) {
          warnings.push(
            `The product was renamed, but its access group "${before.name}" could not be renamed to match (${
              err instanceof Error ? err.message : 'unknown error'
            }). Rename it in Groups so access scoping keeps working.`
          );
        }
        clearGroupNameCache();
        clearAccessScope();
        clearMemo('admin-products');
      clearMemo('admin-products');
      clearMemo('directory');
        clearCategoryIndex();

        // Transfer routes are configuration that names products; say so rather than let them break quietly.
        const old = before.name.toLowerCase();
        const named = [...parseTransferRoutes(env.PRODUCT_TRANSFER_ROUTES)].some(
          ([from, to]) => from === old || [...to].some((t) => t.toLowerCase() === old)
        );
        if (named) {
          warnings.push(
            `PRODUCT_TRANSFER_ROUTES in backend/.env still names "${before.name}". Change it to "${input.name}" and restart the backend, or transfers to and from this product stop.`
          );
        }
      } else if (input.isActive !== undefined) {
        clearAccessScope();
        clearMemo('admin-products');
      clearMemo('admin-products');
      clearMemo('directory');
      }

      const product = await fetchProduct(client, id);
      res.json({ product, warnings });
    } catch (err) {
      next(err);
    }
  });

  /*
   * DELETE /api/admin/products/:id  { confirmName }
   *
   * Only for a product with no bugs - Bugzilla refuses otherwise (allowbugdeletion
   * is off), so this checks first and says what to do instead. Its components,
   * versions, milestones and group controls go with it. The same-named access
   * group is left in place (Bugzilla never deletes groups with a product); an
   * admin can remove it in Groups.
   */
  router.delete('/:id', ...gate, async (req, res, next) => {
    try {
      const { id } = parseInput(idParamSchema, req.params);
      const { confirmName } = parseInput(deleteProductSchema, req.body);
      const client = req.bugzilla!;
      const product = await fetchProduct(client, id);

      if (confirmName !== product.name) {
        throw new AppError(400, 'VALIDATION', `Type the product name exactly - "${product.name}" - to confirm.`);
      }
      const bugs = (await bugCountsByProduct(env)).get(product.name.toLowerCase()) ?? 0;
      if (bugs > 0) {
        throw new AppError(
          409,
          'CONFLICT',
          `${product.name} has ${bugs} bug${bugs === 1 ? '' : 's'}, so Bugzilla will not delete it. Deactivate it instead - that closes it for new bugs and keeps every existing one.`,
          undefined,
          { bugCount: bugs }
        );
      }

      await deleteProductViaBugzilla(env.BUGZILLA_URL, req.sessionUser!.bzToken, product.name);
      clearAccessScope();
      clearMemo('admin-products');
      clearMemo('directory');
      clearCategoryIndex();
      console.info(`[admin] product "${product.name}" (id ${id}) deleted by ${req.sessionUser!.email}`);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // POST /api/admin/products/:id/components
  router.post('/:id/components', ...componentGate, async (req, res, next) => {
    try {
      const { id } = parseInput(idParamSchema, req.params);
      const input = parseInput(createComponentSchema, req.body);
      const client = req.bugzilla!;

      // Read with the caller's own session: a product they cannot see 404s here,
      // so a tester can only add components to products they already work on.
      const productBeforeCreate = await fetchProduct(client, id);

      /*
       * Bugzilla only lets `editcomponents` create a component, so for a tester
       * the BFF does it with its service key - canCreateComponents (checked by
       * the gate) is the permission that matters. Admins still write as
       * themselves, as before.
       */
      const writer = req.sessionUser!.permissions.canManageProducts ? client : directoryClient(env);
      if (writer !== client) {
        console.info(`[admin] component "${input.name}" added to "${productBeforeCreate.name}" by ${req.sessionUser!.email} (via service key)`);
      }

      await writer.post('/component', {
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
