import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../config/env';
import { adminExtension } from '../lib/adminExtension';
import { parseInput } from '../lib/validate';
import { requireAuth, requirePermission } from '../middleware/auth';

/** from = 0 means "a new bug" (Bugzilla stores it as a NULL old_status). */
const pair = z.object({ from: z.number().int().min(0), to: z.number().int().positive() });

const workflowDiffSchema = z
  .object({
    add: z.array(pair.extend({ requireComment: z.boolean().optional() })).max(200).default([]),
    remove: z.array(pair).max(200).default([]),
    comment: z.array(pair.extend({ requireComment: z.boolean() })).max(200).default([]),
  })
  .refine((d) => d.add.length + d.remove.length + d.comment.length > 0, { message: 'Nothing to change' })
  .refine((d) => [...d.add, ...d.remove, ...d.comment].every((t) => t.from !== t.to), {
    message: 'A status cannot transition to itself',
  });

interface RawWorkflow {
  statuses: Array<{ id: number; name: string; is_open: boolean; is_active: boolean }>;
  transitions: Array<{ from: number; to: number; require_comment: boolean }>;
  duplicate_status: string;
  applied?: string[];
}

function normalize(w: RawWorkflow) {
  return {
    statuses: w.statuses.map((s) => ({ id: s.id, name: s.name, isOpen: s.is_open, isActive: s.is_active })),
    transitions: w.transitions.map((t) => ({ from: t.from, to: t.to, requireComment: t.require_comment })),
    /** Bugzilla's duplicate_or_move_bug_status - every status must be able to reach it. */
    duplicateStatus: w.duplicate_status,
    ...(w.applied ? { applied: w.applied } : {}),
  };
}

/**
 * The status workflow via the UeducateAdmin extension. Changes are an explicit diff that the UI
 * has shown the admin as a summary first; nothing outside it is touched.
 */
export function adminWorkflowRouter(env: Env): Router {
  const router = Router();
  const gate = [requireAuth(env), requirePermission('isBugzillaAdmin')];

  router.get('/', ...gate, async (req, res, next) => {
    try {
      res.json(normalize(await adminExtension(req.bugzilla!).get<RawWorkflow>('/workflow')));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/', ...gate, async (req, res, next) => {
    try {
      const diff = parseInput(workflowDiffSchema, req.body);
      const r = await adminExtension(req.bugzilla!).put<RawWorkflow>('/workflow', {
        add: diff.add.map((t) => ({ from: t.from, to: t.to, require_comment: t.requireComment ?? false })),
        remove: diff.remove,
        comment: diff.comment.map((t) => ({ from: t.from, to: t.to, require_comment: t.requireComment })),
      });
      res.json(normalize(r));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
