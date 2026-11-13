import type { RequestHandler } from 'express';
import { announceDirectoryChange } from '../events/liveUpdates.event';
import { clearAccessScope } from '../services/access.service';
import { clearGroupNameCache } from '../services/bugFeatures.service';
import { BugzillaClient } from '../clients/bugzilla.client';
import { clearCategoryIndex } from '../services/categoryIndex.service';
import { deleteProductViaBugzilla } from '../services/productDelete.service';
import { deleteComponentViaBugzilla } from '../services/componentDelete.service';
import { groupNameForProduct } from '../services/productGroups.service';
import { directoryClient, parseTransferRoutes } from '../services/productTransfer.service';
import { parseInput } from '../helpers/validate.helper';
import { invalidateBugSnapshot } from '../services/bugSnapshot.service';
import { clearMemo, memo } from '../helpers/memo.helper';
import { badRequest, notFound, conflict } from '../helpers/errors.helper';
import { normalizeProduct, rawProductSchema } from '../dto/product.dto';
import {
  createComponentSchema,
  createProductSchema,
  createSubcomponentSchema,
  deleteProductSchema,
  updateComponentSchema,
  updateProductSchema,
  updateSubcomponentSchema,
  componentParamSchema,
  idParamSchema,
  subcomponentParamSchema,
} from '../dto/adminProduct.dto';
import {
  byComponent,
  cleanSubcomponentName,
  clearSubcomponents,
  createSubcomponent,
  getSubcomponents,
  purgeOrphanSubcomponents,
  removeSubcomponent,
  updateSubcomponent,
} from '../services/subcomponents.service';
import { asyncHandler, sendNoContent, sendSuccess } from '../helpers/response.helper';
import { env } from '../config/app.config';
import {
  bugCountsByProduct,
  bugCountsBySubcomponent,
  fetchProduct,
  findSubcomponent,
  withSubcomponentCounts,
} from '../services/adminProducts.service';

export const announceDirectoryChanges: RequestHandler = (req, res, next) => {
  if (req.method !== 'GET')
    res.on('finish', () => {
      if (res.statusCode < 400) announceDirectoryChange();
    });
  next();
};

export const listProducts = asyncHandler(async (req, res) => {
  const client = req.bugzilla!;
  const uid = req.sessionUser!.bzUserId;
  const accessible = await memo('admin-products', `accessible:${uid}`, 60_000, () =>
    client.get<{ ids: number[] }>('/product_accessible'),
  );
  if (accessible.ids.length === 0) {
    sendSuccess(res, { products: [] });
    return;
  }
  const [full, counts, subcomponents, subcomponentCounts] = await Promise.all([
    memo('admin-products', `products:${uid}:${accessible.ids.join(',')}`, 60_000, () =>
      client.get<{ products: unknown[] }>('/product', { ids: accessible.ids }),
    ),
    bugCountsByProduct(env),
    getSubcomponents(env),
    bugCountsBySubcomponent(env),
  ]);
  const grouped = byComponent(subcomponents);
  const products = full.products.map((rawProduct) => {
    const product = withSubcomponentCounts(
      normalizeProduct(rawProductSchema.parse(rawProduct), grouped),
      subcomponentCounts,
    );
    return { ...product, bugCount: counts.get(product.name.toLowerCase()) ?? 0 };
  });
  sendSuccess(res, { products });
});

export const createProduct = asyncHandler(async (req, res) => {
  const input = parseInput(createProductSchema, req.body);
  const client = req.bugzilla!;

  const owner = await directoryClient(env)
    .get<{ users: { name: string }[] }>('/user', { names: [input.component.defaultAssignee] })
    .catch(() => ({ users: [] as { name: string }[] }));
  if (!owner.users?.length) {
    throw badRequest(`${input.component.defaultAssignee} is not a Bug Tracker account. Choose an existing developer.`);
  }

  const created = await client.post<{ id: number }>('/product', {
    name: input.name,
    description: input.description,
    version: input.version,
  });

  const warnings: string[] = [];

  try {
    await client.post('/component', {
      product: input.name,
      name: input.component.name,
      description: input.component.description,
      default_assignee: input.component.defaultAssignee,
    });
  } catch (err) {
    warnings.push(
      `The product was created, but its first component could not be (${err instanceof Error ? err.message : 'unknown error'}). Add one with “Add component” - until then nobody can file bugs in it.`,
    );
  }

  try {
    await directoryClient(env).post('/subcomponent/product/setup', {
      product_id: created.id,
      extra_members: [input.component.defaultAssignee],
    });
    clearGroupNameCache();
  } catch (err) {
    warnings.push(
      `The product was created, but its access group could not be set up (${err instanceof Error ? err.message : 'unknown error'}). It will not appear on the Users page until that is fixed.`,
    );
  }

  clearAccessScope();
  clearMemo('admin-products');
  clearMemo('directory');

  const product = await fetchProduct(client, created.id, env);
  sendSuccess(res, { product, warnings }, 201);
});

export const updateProduct = asyncHandler(async (req, res) => {
  const { id } = parseInput(idParamSchema, req.params);
  const input = parseInput(updateProductSchema, req.body);
  const client = req.bugzilla!;

  const before = await fetchProduct(client, id, env);
  const renaming = input.name !== undefined && input.name !== before.name;

  const payload: Record<string, string | boolean> = {};
  if (renaming) payload.name = input.name!;
  if (input.description !== undefined) payload.description = input.description;
  if (input.isActive !== undefined) payload.is_active = input.isActive;

  await client.put(`/product/${id}`, payload);

  const warnings: string[] = [];
  if (renaming) {
    const service = new BugzillaClient(env.BUGZILLA_URL, { kind: 'api_key', apiKey: env.BUGZILLA_API_KEY });
    try {
      const groups = await service.get<{ groups: { id: number; name: string }[] }>('/group', { membership: 0 });
      const gate = groupNameForProduct(
        before.name,
        (groups.groups ?? []).map((group) => group.name),
      );
      const gateId = groups.groups?.find((group) => group.name === gate)?.id;
      if (gateId !== undefined) await service.put(`/group/${gateId}`, { name: input.name });
    } catch (err) {
      warnings.push(
        `The product was renamed, but its access group "${before.name}" could not be renamed to match (${
          err instanceof Error ? err.message : 'unknown error'
        }). Rename it in Groups so access scoping keeps working.`,
      );
    }
    clearGroupNameCache();
    clearAccessScope();
    clearMemo('admin-products');
    clearMemo('admin-products');
    clearMemo('directory');
    clearCategoryIndex();

    const old = before.name.toLowerCase();
    const named = [...parseTransferRoutes(env.PRODUCT_TRANSFER_ROUTES)].some(
      ([from, to]) => from === old || [...to].some((value) => value.toLowerCase() === old),
    );
    if (named) {
      warnings.push(
        `PRODUCT_TRANSFER_ROUTES in backend/.env still names "${before.name}". Change it to "${input.name}" and restart the backend, or transfers to and from this product stop.`,
      );
    }
  } else if (input.isActive !== undefined) {
    clearAccessScope();
    clearMemo('admin-products');
    clearMemo('admin-products');
    clearMemo('directory');
  }

  const product = await fetchProduct(client, id, env);
  sendSuccess(res, { product, warnings });
});

export const deleteProduct = asyncHandler(async (req, res) => {
  const { id } = parseInput(idParamSchema, req.params);
  const { confirmName } = parseInput(deleteProductSchema, req.body);
  const client = req.bugzilla!;
  const product = await fetchProduct(client, id, env);

  if (confirmName !== product.name) {
    throw badRequest(`Type the product name exactly - "${product.name}" - to confirm.`);
  }
  const bugs = (await bugCountsByProduct(env)).get(product.name.toLowerCase()) ?? 0;
  if (bugs > 0) {
    throw conflict(
      `${product.name} has ${bugs} bug${bugs === 1 ? '' : 's'}, so Bugzilla will not delete it. Deactivate it instead - that closes it for new bugs and keeps every existing one.`,
      undefined,
      { bugCount: bugs },
    );
  }

  await deleteProductViaBugzilla(env.BUGZILLA_URL, req.sessionUser!.bzToken, product.name);
  await purgeOrphanSubcomponents(env);
  clearAccessScope();
  clearMemo('admin-products');
  clearMemo('directory');
  clearCategoryIndex();
  console.info(`[admin] product "${product.name}" (id ${id}) deleted by ${req.sessionUser!.email}`);
  sendNoContent(res);
});

export const createComponent = asyncHandler(async (req, res) => {
  const { id } = parseInput(idParamSchema, req.params);
  const input = parseInput(createComponentSchema, req.body);
  const client = req.bugzilla!;

  const productBeforeCreate = await fetchProduct(client, id, env);

  const writer = req.sessionUser!.permissions.canManageProducts ? client : directoryClient(env);
  if (writer !== client) {
    console.info(
      `[admin] component "${input.name}" added to "${productBeforeCreate.name}" by ${req.sessionUser!.email} (via service key)`,
    );
  }

  await writer.post('/component', {
    product: productBeforeCreate.name,
    name: input.name,
    description: input.description,
    default_assignee: input.defaultAssignee,
  });

  clearSubcomponents();
  clearAccessScope();
  clearMemo('admin-products');
  clearMemo('directory');
  const product = await fetchProduct(client, id, env);
  sendSuccess(res, { product }, 201);
});

export const addSubcomponent = asyncHandler(async (req, res) => {
  const { id } = parseInput(idParamSchema, req.params);
  const input = parseInput(createSubcomponentSchema, req.body);
  const product = await fetchProduct(req.bugzilla!, id, env);
  const component = product.components.find((candidate) => candidate.id === input.componentId);
  if (!component) throw badRequest('That component is not part of this product.');
  const name = cleanSubcomponentName(input.name);
  if (component.subcomponents.some((x) => x.name.toLowerCase() === name.toLowerCase())) {
    throw conflict(`${component.name} already has a sub-component called "${name}".`);
  }
  await createSubcomponent(env, component.id, name);
  clearMemo('admin-products');
  console.info(
    `[admin] sub-component "${name}" added to ${product.name} / ${component.name} by ${req.sessionUser!.email}`,
  );
  sendSuccess(res, { product: await fetchProduct(req.bugzilla!, id, env) }, 201);
});

export const editSubcomponent = asyncHandler(async (req, res) => {
  const { id, subId: subcomponentId } = parseInput(subcomponentParamSchema, req.params);
  const input = parseInput(updateSubcomponentSchema, req.body);
  const product = await fetchProduct(req.bugzilla!, id, env);
  const { component, sub: subcomponent } = findSubcomponent(product, subcomponentId);
  const name = input.name !== undefined ? cleanSubcomponentName(input.name) : undefined;
  if (
    name !== undefined &&
    component.subcomponents.some((x) => x.id !== subcomponentId && x.name.toLowerCase() === name.toLowerCase())
  ) {
    throw conflict(`${component.name} already has a sub-component called "${name}".`);
  }
  await updateSubcomponent(env, subcomponentId, { name, isActive: input.isActive });
  clearMemo('admin-products');
  console.info(
    `[admin] sub-component "${subcomponent.name}" (${product.name} / ${component.name}) updated by ${req.sessionUser!.email}: ${JSON.stringify(input)}`,
  );
  sendSuccess(res, { product: await fetchProduct(req.bugzilla!, id, env) });
});

export const updateComponent = asyncHandler(async (req, res) => {
  const { id, componentId } = parseInput(componentParamSchema, req.params);
  const input = parseInput(updateComponentSchema, req.body);
  const product = await fetchProduct(req.bugzilla!, id, env);
  const component = product.components.find((candidate) => candidate.id === componentId);
  if (!component) throw notFound('That component could not be found in this product.');

  const renaming = input.name !== undefined && input.name !== component.name;
  if (
    renaming &&
    product.components.some(
      (other) => other.id !== componentId && other.name.toLowerCase() === input.name!.toLowerCase(),
    )
  ) {
    throw conflict(`${product.name} already has a component called "${input.name}".`);
  }

  const body: Record<string, unknown> = { id: componentId };
  if (renaming) body.name = input.name;
  if (input.description !== undefined && input.description !== component.description)
    body.description = input.description;
  if (
    input.defaultAssignee !== undefined &&
    input.defaultAssignee.toLowerCase() !== component.defaultAssignee.toLowerCase()
  ) {
    body.default_assignee = input.defaultAssignee;
  }
  if (input.isActive !== undefined && input.isActive !== component.isActive) body.is_active = input.isActive;

  if (Object.keys(body).length > 1) {
    await directoryClient(env).post('/subcomponent/component/update', body);
    invalidateBugSnapshot();
    clearSubcomponents();
    clearAccessScope();
    clearMemo('admin-products');
    clearMemo('directory');
    const { id: _id, ...changed } = body;
    console.info(
      `[admin] component "${component.name}" (${product.name}) updated by ${req.sessionUser!.email}: ${JSON.stringify(changed)}`,
    );
  }
  sendSuccess(res, { product: await fetchProduct(req.bugzilla!, id, env) });
});

export const deleteComponent = asyncHandler(async (req, res) => {
  const { id, componentId } = parseInput(componentParamSchema, req.params);
  const { confirmName } = parseInput(deleteProductSchema, req.body);
  const product = await fetchProduct(req.bugzilla!, id, env);
  const component = product.components.find((candidate) => candidate.id === componentId);
  if (!component) throw notFound('That component could not be found in this product.');

  if (confirmName !== component.name) {
    throw badRequest(`Type the component name exactly - "${component.name}" - to confirm.`);
  }
  if (product.components.length === 1) {
    throw conflict(
      `${component.name} is the only component of ${product.name}. A product needs at least one, so add another before deleting this one.`,
    );
  }
  const live = await directoryClient(env).get<{ bugs: unknown[] }>('/bug', {
    product: product.name,
    component: component.name,
    include_fields: 'id',
    limit: 0,
  });
  const bugs = live.bugs?.length ?? 0;
  if (bugs > 0) {
    throw conflict(
      `${component.name} has ${bugs} bug${bugs === 1 ? '' : 's'}, so Bugzilla will not delete it. Move those bugs to another component first.`,
      undefined,
      { bugCount: bugs },
    );
  }

  const removed: string[] = [];
  try {
    for (const subcomponent of component.subcomponents) {
      await removeSubcomponent(env, subcomponent.id);
      removed.push(subcomponent.name);
    }
    if (req.sessionUser!.permissions.canManageProducts) {
      await deleteComponentViaBugzilla(env.BUGZILLA_URL, req.sessionUser!.bzToken, product.name, component.name);
    } else {
      await directoryClient(env).post('/subcomponent/component/remove', { id: component.id });
    }
  } catch (err) {
    for (const name of removed) {
      await createSubcomponent(env, component.id, name).catch((error) =>
        console.error(
          `[admin] could not restore sub-component "${name}" on ${product.name} / ${component.name}:`,
          error instanceof Error ? error.message : error,
        ),
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
      (removed.length ? ` (with sub-components: ${removed.join(', ')})` : ''),
  );
  sendSuccess(res, { product: await fetchProduct(req.bugzilla!, id, env) });
});

export const deleteSubcomponent = asyncHandler(async (req, res) => {
  const { id, subId: subcomponentId } = parseInput(subcomponentParamSchema, req.params);
  const product = await fetchProduct(req.bugzilla!, id, env);
  const { component, sub: subcomponent } = findSubcomponent(product, subcomponentId);
  const used = (await bugCountsBySubcomponent(env)).get(subcomponent.value) ?? 0;
  if (used > 0) {
    throw conflict(
      `"${subcomponent.name}" is set on ${used} bug${used === 1 ? '' : 's'}, so it cannot be deleted. Deactivate it instead - existing bugs keep it and it stops being offered.`,
    );
  }
  await removeSubcomponent(env, subcomponentId);
  clearMemo('admin-products');
  console.info(
    `[admin] sub-component "${subcomponent.name}" deleted from ${product.name} / ${component.name} by ${req.sessionUser!.email}`,
  );
  sendSuccess(res, { product: await fetchProduct(req.bugzilla!, id, env) });
});
