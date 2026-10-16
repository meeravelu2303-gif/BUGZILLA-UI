import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../config/env';
import { adminExtension } from '../lib/adminExtension';
import { parseInput } from '../lib/validate';
import { requireAuth, requirePermission } from '../middleware/auth';

/** The standard fields the extension allows (EDITABLE_FIELDS in its WebService.pm). */
export const FIELD_NAMES = ['bug_severity', 'priority', 'bug_status', 'resolution', 'op_sys', 'rep_platform'] as const;

const fieldParam = z.object({ field: z.enum(FIELD_NAMES) });
const fieldValueParam = fieldParam.extend({ id: z.coerce.number().int().positive() });

const valueName = z
  .string()
  .trim()
  .min(1, 'A value is required')
  .max(64, 'At most 64 characters')
  // Bugzilla keeps these as plain strings, but a comma breaks every list that joins them.
  .refine((v) => !v.includes(','), 'Values cannot contain a comma.');

const sortkey = z.coerce.number().int().min(0).max(32767);

const createValueSchema = z.object({
  value: valueName,
  sortkey: sortkey.optional(),
  /** Status only, and permanent - Bugzilla cannot change it after creation. */
  isOpen: z.boolean().optional(),
});

const updateValueSchema = z
  .object({ value: valueName.optional(), sortkey: sortkey.optional(), isActive: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });

const reorderSchema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(500) });

interface RawValue {
  id: number;
  name: string;
  sortkey: number;
  is_active: boolean;
  bug_count: number;
  is_default: boolean;
  is_static: boolean;
  delete_block: string;
  is_open?: boolean;
}

function normalizeValue(v: RawValue) {
  return {
    id: v.id,
    name: v.name,
    sortkey: v.sortkey,
    isActive: v.is_active,
    bugCount: v.bug_count,
    isDefault: v.is_default,
    isStatic: v.is_static,
    /** Why Bugzilla would refuse a delete ('' when it would not) - shown before anyone tries. */
    deleteBlock: v.delete_block,
    ...(v.is_open !== undefined ? { isOpen: v.is_open } : {}),
  };
}

function normalizeList(r: { field: string; label: string; values: RawValue[] }) {
  return { field: r.field, label: r.label, values: r.values.map(normalizeValue) };
}

/**
 * Field values (severity, priority, status, resolution, OS, platform) via the UeducateAdmin
 * extension, which uses Bugzilla::Field::Choice / Bugzilla::Status - so renames, the in-use check
 * on delete and the audit log behave exactly as on editvalues.cgi.
 */
export function adminFieldValuesRouter(env: Env): Router {
  const router = Router();
  const gate = [requireAuth(env), requirePermission('isBugzillaAdmin')];

  router.get('/:field', ...gate, async (req, res, next) => {
    try {
      const { field } = parseInput(fieldParam, req.params);
      const r = await adminExtension(req.bugzilla!).get<{ field: string; label: string; values: RawValue[] }>(`/field/${field}/values`);
      res.json(normalizeList(r));
    } catch (err) {
      next(err);
    }
  });

  router.post('/:field', ...gate, async (req, res, next) => {
    try {
      const { field } = parseInput(fieldParam, req.params);
      const input = parseInput(createValueSchema, req.body);
      const r = await adminExtension(req.bugzilla!).post<{ value: RawValue }>(`/field/${field}/values`, {
        value: input.value,
        ...(input.sortkey !== undefined ? { sortkey: input.sortkey } : {}),
        ...(field === 'bug_status' ? { is_open: input.isOpen ?? true } : {}),
      });
      res.status(201).json({ value: normalizeValue(r.value) });
    } catch (err) {
      next(err);
    }
  });

  // Registered before /:field/:id so "order" is never read as an id.
  router.put('/:field/order', ...gate, async (req, res, next) => {
    try {
      const { field } = parseInput(fieldParam, req.params);
      const { ids } = parseInput(reorderSchema, req.body);
      const r = await adminExtension(req.bugzilla!).put<{ field: string; label: string; values: RawValue[] }>(`/field/${field}/order`, { ids });
      res.json(normalizeList(r));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:field/:id', ...gate, async (req, res, next) => {
    try {
      const { field, id } = parseInput(fieldValueParam, req.params);
      const input = parseInput(updateValueSchema, req.body);
      const r = await adminExtension(req.bugzilla!).put<{ value: RawValue; changes: string[] }>(`/field/${field}/values/${id}`, {
        ...(input.value !== undefined ? { value: input.value } : {}),
        ...(input.sortkey !== undefined ? { sortkey: input.sortkey } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
      });
      res.json({ value: normalizeValue(r.value), changes: r.changes });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:field/:id', ...gate, async (req, res, next) => {
    try {
      const { field, id } = parseInput(fieldValueParam, req.params);
      const r = await adminExtension(req.bugzilla!).delete<{ name: string }>(`/field/${field}/values/${id}`);
      res.json({ deleted: true, name: r.name });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
