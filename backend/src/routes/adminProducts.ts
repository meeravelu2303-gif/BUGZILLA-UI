import { Router } from 'express';
import { announceDirectoryChange } from '../lib/liveUpdates';
import { z } from 'zod';
import type { Env } from '../config/env';
import { clearAccessScope } from '../lib/access';
import { clearGroupNameCache } from '../lib/bugFeatures';
import { BugzillaClient } from '../lib/bugzillaClient';
import { clearCategoryIndex } from '../lib/categoryIndex';
import { deleteProductViaBugzilla } from '../lib/productDelete';
import { deleteComponentViaBugzilla } from '../lib/componentDelete';
import { groupNameForProduct } from '../lib/productGroups';
import { directoryClient, parseTransferRoutes } from '../lib/productTransfer';
import { requireAuth, requirePermission } from '../middleware/auth';
import { parseInput } from '../lib/validate';
import { getBugSnapshot, invalidateBugSnapshot } from '../lib/bugSnapshot';
import { clearMemo, memo } from '../lib/memo';
import { AppError } from '../lib/errors';
import { normalizeProduct, rawProductSchema } from '../schemas/product';
import {
  createComponentSchema,
  createProductSchema,
  createSubcomponentSchema,
  deleteProductSchema,
  updateComponentSchema,
  updateProductSchema,
  updateSubcomponentSchema,
} from '../schemas/adminProduct';
import {
  byComponent,
  cleanSubcomponentName,
  clearSubcomponents,
  createSubcomponent,
  getSubcomponents,
  purgeOrphanSubcomponents,
  removeSubcomponent,
  updateSubcomponent,
} from '../lib/subcomponents';

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

async function fetchProduct(client: { get<T>(path: string, params?: Record<string, unknown>): Promise<T> }, id: number, env: Env) {
  const [resp, subs] = await Promise.all([client.get<{ products: unknown[] }>('/product', { ids: [id] }), getSubcomponents(env)]);
  const raw = resp.products[0];
  if (!raw) throw new AppError(404, 'NOT_FOUND', 'That product could not be found.');
  return normalizeProduct(rawProductSchema.parse(raw), byComponent(subs));
}

/** Bugs per stored sub-component value, from the snapshot - so the UI knows which can be deleted. */
async function bugCountsBySubcomponent(env: Env) {
  const snap = await getBugSnapshot(env);
  const counts = new Map<string, number>();
  for (const b of snap.rows) {
    counts.set(b.subcomponent, (counts.get(b.subcomponent) ?? 0) + 1);
    // Per component too, under a key no sub-component value can take.
    const key = componentCountKey(b.product, b.component);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

function componentCountKey(product: string, component: string) {
  return `component:${product.toLowerCase()}::${component.toLowerCase()}`;
}

/** A product with every component and sub-component carrying its bug count (the UI only offers delete at 0). */
function withSubcomponentCounts<P extends ReturnType<typeof normalizeProduct>>(product: P, counts: Map<string, number>) {
  return {
    ...product,
    components: product.components.map((c) => ({
      ...c,
      bugCount: counts.get(componentCountKey(product.name, c.name)) ?? 0,
      subcomponents: c.subcomponents.map((sub) => ({ ...sub, bugCount: counts.get(sub.value) ?? 0 })),
    })),
  };
}

export function adminProductsRouter(env: Env): Router {
  const router = Router();
  // Live updates: tell every browser that products / people changed (lib/liveUpdates.ts).
  router.use((req, res, next) => {
    if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 400) announceDirectoryChange(); });
    next();
  });
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
      const [full, counts, subs, subCounts] = await Promise.all([
        memo('admin-products', `products:${uid}:${accessible.ids.join(',')}`, 60_000, () => client.get<{ products: unknown[] }>('/product', { ids: accessible.ids })),
        bugCountsByProduct(env),
        getSubcomponents(env),
        bugCountsBySubcomponent(env),
      ]);
      const grouped = byComponent(subs);
      const products = full.products.map((p) => {
        const product = withSubcomponentCounts(normalizeProduct(rawProductSchema.parse(p), grouped), subCounts);
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

      // Checked BEFORE anything is created, so a mistyped owner cannot leave an empty product behind.
      const owner = await directoryClient(env)
        .get<{ users: { name: string }[] }>('/user', { names: [input.component.defaultAssignee] })
        .catch(() => ({ users: [] as { name: string }[] }));
      if (!owner.users?.length) {
        throw new AppError(400, 'VALIDATION', `${input.component.defaultAssignee} is not a Bug Tracker account. Choose an existing developer.`);
      }

      const created = await client.post<{ id: number }>('/product', {
        name: input.name,
        description: input.description,
        version: input.version,
      });

      /*
       * Access setup, the same as every other product here: a same-named group
       * required to file and set on every bug (how this app scopes product
       * access - without it the product never appears on the Users page), the
       * "Deleted bugs" control soft delete needs, and every tester/admin plus
       * the transfer account as members. Through the SubComponents extension on
       * the service key, since creating groups needs rights a product admin may
       * lack. Not fatal: the product exists either way, so say what is missing.
       */
      const warnings: string[] = [];

      // The first component - before the access group locks the product, as the migration does.
      try {
        await client.post('/component', {
          product: input.name,
          name: input.component.name,
          description: input.component.description,
          default_assignee: input.component.defaultAssignee,
        });
      } catch (err) {
        warnings.push(
          `The product was created, but its first component could not be (${err instanceof Error ? err.message : 'unknown error'}). Add one with “Add component” - until then nobody can file bugs in it.`
        );
      }

      try {
        // The component owner is added to the product group too: they must see the bugs routed to them.
        await directoryClient(env).post('/subcomponent/product/setup', {
          product_id: created.id,
          extra_members: [input.component.defaultAssignee],
        });
        clearGroupNameCache();
      } catch (err) {
        warnings.push(
          `The product was created, but its access group could not be set up (${err instanceof Error ? err.message : 'unknown error'}). It will not appear on the Users page until that is fixed.`
        );
      }

      // A new product changes what every user may enter, so the cached access
      // snapshots are stale for everyone, not just the caller.
      clearAccessScope();
      clearMemo('admin-products');
      clearMemo('directory');

      const product = await fetchProduct(client, created.id, env);
      res.status(201).json({ product, warnings });
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

      const before = await fetchProduct(client, id, env);
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

      const product = await fetchProduct(client, id, env);
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
      const product = await fetchProduct(client, id, env);

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
      // Its components went with it; their sub-components would otherwise linger in Bugzilla.
      await purgeOrphanSubcomponents(env);
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
      const productBeforeCreate = await fetchProduct(client, id, env);

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

      // The new component has no sub-components yet, but the component-id lookup is now stale.
      clearSubcomponents();
      /*
       * Bugzilla leaves a product with no components out of the filing list, so
       * a product's FIRST component is what makes it appear on the Users page,
       * the New Bug form and the filters. Drop the cached lists so that happens
       * now rather than in five minutes.
       */
      clearAccessScope();
      clearMemo('admin-products');
      clearMemo('directory');
      const product = await fetchProduct(client, id, env);
      res.status(201).json({ product });
    } catch (err) {
      next(err);
    }
  });

  /*
   * Sub-components (lib/subcomponents.ts). Adding one follows the same rule as
   * adding a component - admins and testers - and is written on the service key,
   * since Bugzilla needs editcomponents. Renaming, deactivating and deleting are
   * admin-only. Every change is checked here first so the message is readable.
   */
  const subParamSchema = z.object({ id: z.coerce.number().int().positive(), subId: z.coerce.number().int().positive() });

  const findSub = (product: Awaited<ReturnType<typeof fetchProduct>>, subId: number) => {
    for (const component of product.components) {
      const sub = component.subcomponents.find((x) => x.id === subId);
      if (sub) return { component, sub };
    }
    throw new AppError(404, 'NOT_FOUND', 'That sub-component could not be found in this product.');
  };

  // POST /api/admin/products/:id/subcomponents  { componentId, name }
  router.post('/:id/subcomponents', ...componentGate, async (req, res, next) => {
    try {
      const { id } = parseInput(idParamSchema, req.params);
      const input = parseInput(createSubcomponentSchema, req.body);
      // On the caller's own session: a product they cannot see 404s here.
      const product = await fetchProduct(req.bugzilla!, id, env);
      const component = product.components.find((c) => c.id === input.componentId);
      if (!component) throw new AppError(400, 'VALIDATION', 'That component is not part of this product.');
      const name = cleanSubcomponentName(input.name);
      if (component.subcomponents.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
        throw new AppError(409, 'CONFLICT', `${component.name} already has a sub-component called "${name}".`);
      }
      await createSubcomponent(env, component.id, name);
      clearMemo('admin-products');
      console.info(`[admin] sub-component "${name}" added to ${product.name} / ${component.name} by ${req.sessionUser!.email}`);
      res.status(201).json({ product: await fetchProduct(req.bugzilla!, id, env) });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/admin/products/:id/subcomponents/:subId  { name?, isActive? }
  router.patch('/:id/subcomponents/:subId', ...gate, async (req, res, next) => {
    try {
      const { id, subId } = parseInput(subParamSchema, req.params);
      const input = parseInput(updateSubcomponentSchema, req.body);
      const product = await fetchProduct(req.bugzilla!, id, env);
      const { component, sub } = findSub(product, subId);
      const name = input.name !== undefined ? cleanSubcomponentName(input.name) : undefined;
      if (name !== undefined && component.subcomponents.some((x) => x.id !== subId && x.name.toLowerCase() === name.toLowerCase())) {
        throw new AppError(409, 'CONFLICT', `${component.name} already has a sub-component called "${name}".`);
      }
      // A rename rewrites every bug that carries the old value, inside Bugzilla.
      await updateSubcomponent(env, subId, { name, isActive: input.isActive });
      clearMemo('admin-products');
      console.info(`[admin] sub-component "${sub.name}" (${product.name} / ${component.name}) updated by ${req.sessionUser!.email}: ${JSON.stringify(input)}`);
      res.json({ product: await fetchProduct(req.bugzilla!, id, env) });
    } catch (err) {
      next(err);
    }
  });

  /*
   * DELETE /api/admin/products/:id/components/:componentId  { confirmName }
   *
   * Admins and testers (canCreateComponents - the same people who add them),
   * and only for a component with NO bugs that is not the
   * product's last one - Bugzilla refuses both, so they are checked here first
   * with a plain message. The bug count is read live on the service key (not
   * the 60-second snapshot), because deleting is the one place a stale count
   * would matter.
   *
   * Bugzilla also refuses while the component still owns sub-components, so
   * those (necessarily unused, since the component has no bugs) are removed
   * first. If the component delete then fails, they are recreated, so a
   * refused delete never leaves the component stripped of its sub-components.
   */
  const componentParamSchema = z.object({ id: z.coerce.number().int().positive(), componentId: z.coerce.number().int().positive() });

  /*
   * PATCH /api/admin/products/:id/components/:componentId
   *   { name?, description?, defaultAssignee?, isActive? }
   *
   * Admins and testers - the same people who add components. Bugzilla 5.2's
   * REST has no Component.update, so this goes through the SubComponents
   * extension on the service key; who asked is logged. Bugs and sub-components
   * reference a component by id, so a rename carries them along. A new default
   * assignee applies to bugs filed from now on - existing bugs keep theirs.
   */
  router.patch('/:id/components/:componentId', ...componentGate, async (req, res, next) => {
    try {
      const { id, componentId } = parseInput(componentParamSchema, req.params);
      const input = parseInput(updateComponentSchema, req.body);
      const product = await fetchProduct(req.bugzilla!, id, env);
      const component = product.components.find((c) => c.id === componentId);
      if (!component) throw new AppError(404, 'NOT_FOUND', 'That component could not be found in this product.');

      const renaming = input.name !== undefined && input.name !== component.name;
      if (renaming && product.components.some((c) => c.id !== componentId && c.name.toLowerCase() === input.name!.toLowerCase())) {
        throw new AppError(409, 'CONFLICT', `${product.name} already has a component called "${input.name}".`);
      }

      const body: Record<string, unknown> = { id: componentId };
      if (renaming) body.name = input.name;
      if (input.description !== undefined && input.description !== component.description) body.description = input.description;
      if (input.defaultAssignee !== undefined && input.defaultAssignee.toLowerCase() !== component.defaultAssignee.toLowerCase()) {
        body.default_assignee = input.defaultAssignee;
      }
      if (input.isActive !== undefined && input.isActive !== component.isActive) body.is_active = input.isActive;

      if (Object.keys(body).length > 1) {
        await directoryClient(env).post('/subcomponent/component/update', body);
        // Names, owners and open/closed state feed the lists, counts, pickers and filters.
        invalidateBugSnapshot();
        clearSubcomponents();
        clearAccessScope();
        clearMemo('admin-products');
        clearMemo('directory');
        const { id: _id, ...changed } = body;
        console.info(`[admin] component "${component.name}" (${product.name}) updated by ${req.sessionUser!.email}: ${JSON.stringify(changed)}`);
      }
      res.json({ product: await fetchProduct(req.bugzilla!, id, env) });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id/components/:componentId', ...componentGate, async (req, res, next) => {
    try {
      const { id, componentId } = parseInput(componentParamSchema, req.params);
      const { confirmName } = parseInput(deleteProductSchema, req.body);
      const product = await fetchProduct(req.bugzilla!, id, env);
      const component = product.components.find((c) => c.id === componentId);
      if (!component) throw new AppError(404, 'NOT_FOUND', 'That component could not be found in this product.');

      if (confirmName !== component.name) {
        throw new AppError(400, 'VALIDATION', `Type the component name exactly - "${component.name}" - to confirm.`);
      }
      if (product.components.length === 1) {
        throw new AppError(409, 'CONFLICT', `${component.name} is the only component of ${product.name}. A product needs at least one, so add another before deleting this one.`);
      }
      const live = await directoryClient(env).get<{ bugs: unknown[] }>('/bug', {
        product: product.name,
        component: component.name,
        include_fields: 'id',
        limit: 0,
      });
      const bugs = live.bugs?.length ?? 0;
      if (bugs > 0) {
        throw new AppError(
          409,
          'CONFLICT',
          `${component.name} has ${bugs} bug${bugs === 1 ? '' : 's'}, so Bugzilla will not delete it. Move those bugs to another component first.`,
          undefined,
          { bugCount: bugs }
        );
      }

      const removed: string[] = [];
      try {
        for (const sub of component.subcomponents) {
          await removeSubcomponent(env, sub.id);
          removed.push(sub.name);
        }
        /*
         * An admin deletes through Bugzilla's own admin page under their own
         * login, as before. A tester lacks Bugzilla's editcomponents, so the
         * delete runs on the service key through the SubComponents extension -
         * the same Bugzilla::Component::remove_from_db, with the same refusals -
         * and who asked for it is logged below.
         */
        if (req.sessionUser!.permissions.canManageProducts) {
          await deleteComponentViaBugzilla(env.BUGZILLA_URL, req.sessionUser!.bzToken, product.name, component.name);
        } else {
          await directoryClient(env).post('/subcomponent/component/remove', { id: component.id });
        }
      } catch (err) {
        // Put back what was taken away, so a refused delete changes nothing.
        for (const name of removed) {
          await createSubcomponent(env, component.id, name).catch((e) =>
            console.error(`[admin] could not restore sub-component "${name}" on ${product.name} / ${component.name}:`, e instanceof Error ? e.message : e)
          );
        }
        throw err;
      }

      clearSubcomponents();
      clearAccessScope();
      clearMemo('admin-products');
      clearMemo('directory');
      console.info(
        `[admin] component "${component.name}" deleted from ${product.name} by ${req.sessionUser!.email}` +
          (req.sessionUser!.permissions.canManageProducts ? '' : ' (via service key)') +
          (removed.length ? ` (with sub-components: ${removed.join(', ')})` : '')
      );
      res.json({ product: await fetchProduct(req.bugzilla!, id, env) });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/admin/products/:id/subcomponents/:subId - only while no bug uses it.
  router.delete('/:id/subcomponents/:subId', ...gate, async (req, res, next) => {
    try {
      const { id, subId } = parseInput(subParamSchema, req.params);
      const product = await fetchProduct(req.bugzilla!, id, env);
      const { component, sub } = findSub(product, subId);
      const used = (await bugCountsBySubcomponent(env)).get(sub.value) ?? 0;
      if (used > 0) {
        throw new AppError(
          409,
          'CONFLICT',
          `"${sub.name}" is set on ${used} bug${used === 1 ? '' : 's'}, so it cannot be deleted. Deactivate it instead - existing bugs keep it and it stops being offered.`
        );
      }
      await removeSubcomponent(env, subId);
      clearMemo('admin-products');
      console.info(`[admin] sub-component "${sub.name}" deleted from ${product.name} / ${component.name} by ${req.sessionUser!.email}`);
      res.json({ product: await fetchProduct(req.bugzilla!, id, env) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
