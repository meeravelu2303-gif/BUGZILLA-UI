import { parseInput } from '../helpers/validate.helper';
import { asyncHandler, sendNoContent, sendSuccess } from '../helpers/response.helper';
import { teamsClient } from '../services/adminTeams.service';
import { updateTeamSchema, Team, createTeamSchema, idSchema } from '../dto/adminTeam.dto';

export const listTeams = asyncHandler(async (_req, res) => {
  const response = await teamsClient().get<{ teams: Team[] }>('/team');
  res.set('Cache-Control', 'no-store').json({ teams: response.teams ?? [] });
});

export const createTeam = asyncHandler(async (req, res) => {
  const input = parseInput(createTeamSchema, req.body);
  const response = await teamsClient().post<{ team: Team }>('/team', input);
  sendSuccess(res, { team: response.team }, 201);
});

export const updateTeam = asyncHandler(async (req, res) => {
  const { id } = parseInput(idSchema, req.params);
  const input = parseInput(updateTeamSchema, req.body);
  const response = await teamsClient().post<{ team: Team }>('/team/update', { id, ...input });
  sendSuccess(res, { team: response.team });
});

export const deleteTeam = asyncHandler(async (req, res) => {
  const { id } = parseInput(idSchema, req.params);
  await teamsClient().post('/team/remove', { id });
  sendNoContent(res);
});
