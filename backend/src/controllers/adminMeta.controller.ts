import type { RequestHandler } from 'express';
import { type Request } from 'express';
import { AppError } from '../helpers/errors.helper';

/**
 * Read-only administration metadata that Bugzilla's REST API *does* expose, so
 * the corresponding admin screens can render native panels instead of embedding
 * (or linking out to) the clumsy Perl pages. Writes still happen in Bugzilla —
 * these endpoints are deliberately GET-only.
 */
// Request handlers for routes/adminMeta.route.ts.
export function createAdminMetaController() {

  const isAdmin = (req: Request) =>
    Boolean(req.sessionUser?.permissions.canManageUsers || req.sessionUser?.permissions.canManageProducts);

  // GET /api/admin/meta/parameters
  // Bugzilla only surfaces a small, safe subset of parameters over REST
  // (maintainer, requirelogin, etc.). We pass through whatever it returns.
  const getParameters: RequestHandler = async (req, res, next) => {
    try {
      if (!isAdmin(req)) throw new AppError(403, 'FORBIDDEN', 'You do not have permission to view parameters.');
      const raw = await req.bugzilla!.get<{ parameters?: Record<string, unknown> }>('/parameters');
      res.json({ parameters: raw.parameters ?? {} });
    } catch (err) {
      next(err);
    }
  };

  // GET /api/admin/meta/groups
  // Bugzilla has no reliable "list every group" REST call for regular admins,
  // but a user can always read their own group membership. We return that plus
  // the bugzillaWebUrl so the UI can link out for full group administration.
  const getGroups: RequestHandler = async (req, res, next) => {
    try {
      if (!isAdmin(req)) throw new AppError(403, 'FORBIDDEN', 'You do not have permission to view groups.');
      const ownId = req.sessionUser!.bzUserId;
      const resp = await req.bugzilla!.get<{ users: { groups?: { name: string; description?: string }[] }[] }>(
        `/user/${ownId}`
      );
      const groups = (resp.users[0]?.groups ?? []).map((g) => ({ name: g.name, description: g.description ?? '' }));
      res.json({ groups });
    } catch (err) {
      next(err);
    }
  };

  return {
    getParameters,
    getGroups,
  };
}
