import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../config/env';
import { adminExtension } from '../lib/adminExtension';
import { parseInput } from '../lib/validate';
import { requireAuth, requirePermission } from '../middleware/auth';

/** sanitycheck.cgi's repair actions - the extension accepts only these (SANITY_FIXES). */
export const SANITY_FIXES = [
  'createmissinggroupcontrolmapentries',
  'repair_creation_date',
  'repair_everconfirmed',
  'repair_bugs_fulltext',
  'rescanallBugMail',
  'remove_invalid_bug_references',
  'remove_invalid_attach_references',
  'remove_old_whine_targets',
  'remove_invalid_flags',
] as const;

const runSchema = z.object({ fix: z.enum(SANITY_FIXES).optional() });

interface RawCheck {
  title: string;
  steps: string[];
  alerts: Array<{ text: string; bug_ids: number[] }>;
  fixes: Array<{ action: string; label: string }>;
}

/**
 * Bugzilla's own sanity check, run through the UeducateAdmin extension. POST with no body only
 * reads; POST { fix } runs that one repair first - an explicit, separate request the UI makes only
 * after the admin confirms - then re-runs every check. Nothing is ever repaired automatically.
 */
export function adminSanityCheckRouter(env: Env): Router {
  const router = Router();
  // editcomponents is what sanitycheck.cgi itself requires.
  const gate = [requireAuth(env), requirePermission('canManageProducts')];

  router.post('/', ...gate, async (req, res, next) => {
    try {
      const { fix } = parseInput(runSchema, req.body ?? {});
      const started = Date.now();
      const r = await adminExtension(req.bugzilla!).post<{ checks: RawCheck[]; error_found: boolean; fix_applied: string }>(
        '/sanitycheck',
        fix ? { fix } : {}
      );
      res.json({
        checks: r.checks.map((c) => ({
          title: c.title,
          steps: c.steps,
          alerts: c.alerts.map((a) => ({ text: a.text, bugIds: a.bug_ids })),
          fixes: c.fixes,
        })),
        problemsFound: r.error_found,
        fixApplied: r.fix_applied || null,
        durationMs: Date.now() - started,
        ranAt: new Date().toISOString(),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
