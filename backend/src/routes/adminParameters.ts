import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../config/env';
import { adminExtension } from '../lib/adminExtension';
import { parseInput } from '../lib/validate';
import { requireAuth, requirePermission } from '../middleware/auth';

const paramName = z.string().regex(/^[a-z0-9_]+$/i, 'Not a parameter name').max(64);

const updateSchema = z
  .object({
    /** name -> new value. Multi-select ('m') values are arrays; everything else a string or boolean. */
    changes: z.record(paramName, z.union([z.string().max(100_000), z.boolean(), z.array(z.string().max(255)).max(200)])).default({}),
    reset: z.array(paramName).max(200).default([]),
    /**
     * Dangerous parameters the admin has explicitly confirmed by typing the name. The extension
     * refuses any dangerous change not listed here - the typed confirmation is enforced server-side,
     * not just in the browser.
     */
    confirm: z.array(paramName).max(200).default([]),
  })
  .refine((v) => Object.keys(v.changes).length + v.reset.length > 0, { message: 'Nothing to change' });

interface RawParam {
  name: string;
  type: string;
  value: string | boolean | string[];
  default: string | boolean | string[];
  description: string;
  dangerous: boolean;
  no_reset: boolean;
  choices?: string[];
  is_set?: boolean;
}

interface RawParams {
  panels: Array<{ name: string; title: string; desc: string; params: RawParam[] }>;
  shutdown_active: boolean;
  changed?: string[];
}

function normalize(r: RawParams) {
  return {
    panels: r.panels.map((p) => ({
      name: p.name,
      title: p.title,
      description: p.desc,
      params: p.params.map((x) => ({
        name: x.name,
        type: x.type,
        value: x.value,
        default: x.default,
        description: x.description,
        dangerous: x.dangerous,
        noReset: x.no_reset,
        ...(x.choices ? { choices: x.choices } : {}),
        // Passwords and credential parameters: the value is never sent, only whether one is set.
        ...(x.is_set !== undefined ? { secret: true, isSet: x.is_set } : {}),
      })),
    })),
    shutdownActive: r.shutdown_active,
    ...(r.changed ? { changed: r.changed } : {}),
  };
}

/**
 * Instance parameters via the UeducateAdmin extension: the same validation as editparams.cgi
 * (each parameter's own checker), all changes validated before any is written, and every change
 * recorded in audit_log with its old and new value.
 */
export function adminParametersRouter(env: Env): Router {
  const router = Router();
  const gate = [requireAuth(env), requirePermission('canEditParameters')];

  router.get('/', ...gate, async (req, res, next) => {
    try {
      res.json(normalize(await adminExtension(req.bugzilla!).get<RawParams>('/params')));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/', ...gate, async (req, res, next) => {
    try {
      const input = parseInput(updateSchema, req.body);
      res.json(normalize(await adminExtension(req.bugzilla!).put<RawParams>('/params', input)));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
