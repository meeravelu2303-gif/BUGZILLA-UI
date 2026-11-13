/** Read-only administration metadata that Bugzilla's REST API *does* expose. */
import { forbidden } from '../helpers/errors.helper';
import { asyncHandler, sendSuccess } from '../helpers/response.helper';
import { isAdmin } from '../services/adminMeta.service';

export const getParameters = asyncHandler(async (req, res) => {
  if (!isAdmin(req)) throw forbidden('You do not have permission to view parameters.');
  const raw = await req.bugzilla!.get<{ parameters?: Record<string, unknown> }>('/parameters');
  sendSuccess(res, { parameters: raw.parameters ?? {} });
});

export const getGroups = asyncHandler(async (req, res) => {
  if (!isAdmin(req)) throw forbidden('You do not have permission to view groups.');
  const ownId = req.sessionUser!.bzUserId;
  const response = await req.bugzilla!.get<{ users: { groups?: { name: string; description?: string }[] }[] }>(
    `/user/${ownId}`,
  );
  const groups = (response.users[0]?.groups ?? []).map((group) => ({
    name: group.name,
    description: group.description ?? '',
  }));
  sendSuccess(res, { groups });
});
