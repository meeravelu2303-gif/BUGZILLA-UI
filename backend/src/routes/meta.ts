import { Router } from 'express';
import type { Env } from '../config/env';
import { requireAuth } from '../middleware/auth';
import { extractBugMeta } from '../schemas/meta';

export function metaRouter(env: Env): Router {
  const router = Router();

  router.get('/', requireAuth(env), async (req, res, next) => {
    try {
      const raw = await req.bugzilla!.get('/field/bug');
      const fieldMeta = extractBugMeta(raw);
      // The REST base is .../rest; Bugzilla's web (non-REST) admin pages live one level up.
      const bugzillaWebUrl = env.BUGZILLA_URL.replace(/\/rest\/?$/, '');
      res.json({
        ...fieldMeta,
        currentUser: req.sessionUser!.email,
        bugzillaWebUrl,
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
