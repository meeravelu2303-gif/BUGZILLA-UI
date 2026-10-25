import { Router } from 'express';
import { z } from 'zod';
import type { Env } from '../config/env';
import { BugzillaClient } from '../lib/bugzillaClient';
import { parseInput } from '../lib/validate';
import { requireAuth, requirePermission } from '../middleware/auth';

/**
 * Teams: a name, one team leader and the members (ops/bugzilla/extensions/Teams).
 * A team says nothing about products - members may work on any of them; it is
 * who reports to whom, so each leader can be sent their team's activity.
 *
 * Admin only (`canManageUsers`, i.e. Bugzilla's editusers). Calls go out on the
 * SERVICE key, after this check, the same way the sub-component routes do.
 */
const person = z.string().trim().email('Choose a person from the list.');

const createTeamSchema = z.object({
  name: z.string().trim().min(1, 'Please give the team a name.').max(64, 'A team name can be at most 64 characters.'),
  leader: person,
  members: z.array(person).max(500).default([]),
});

const updateTeamSchema = createTeamSchema.partial();

const idSchema = z.object({ id: z.coerce.number().int().positive() });

export interface TeamPerson {
  id: number;
  email: string;
  name: string;
}

export interface Team {
  id: number;
  name: string;
  leader: TeamPerson | null;
  members: TeamPerson[];
  created: string;
}

export function adminTeamsRouter(env: Env): Router {
  const router = Router();
  const gate = [requireAuth(env), requirePermission('canManageUsers')];
  const service = () => new BugzillaClient(env.BUGZILLA_URL, { kind: 'api_key', apiKey: env.BUGZILLA_API_KEY });

  // GET /api/admin/teams
  router.get('/', ...gate, async (_req, res, next) => {
    try {
      const resp = await service().get<{ teams: Team[] }>('/team');
      res.set('Cache-Control', 'no-store').json({ teams: resp.teams ?? [] });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/admin/teams  {name, leader, members[]}
  router.post('/', ...gate, async (req, res, next) => {
    try {
      const input = parseInput(createTeamSchema, req.body);
      const resp = await service().post<{ team: Team }>('/team', input);
      res.status(201).json({ team: resp.team });
    } catch (err) {
      next(err);
    }
  });

  // PATCH /api/admin/teams/:id  {name?, leader?, members?} - members replaces the list
  router.patch('/:id', ...gate, async (req, res, next) => {
    try {
      const { id } = parseInput(idSchema, req.params);
      const input = parseInput(updateTeamSchema, req.body);
      const resp = await service().post<{ team: Team }>('/team/update', { id, ...input });
      res.json({ team: resp.team });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/admin/teams/:id - the people are untouched; only the team goes
  router.delete('/:id', ...gate, async (req, res, next) => {
    try {
      const { id } = parseInput(idSchema, req.params);
      await service().post('/team/remove', { id });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
