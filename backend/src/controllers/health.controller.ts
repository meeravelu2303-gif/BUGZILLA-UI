import { rpcCall } from '../clients/bugzilla.client';
import { env } from '../config/app.config';
import { asyncHandler } from '../helpers/response.helper';

export const getHealth = asyncHandler(async (req, res) => {
  const body: Record<string, unknown> = {
    ok: true,
    uptimeSeconds: Math.round(process.uptime()),
    sessionStore: env.SESSION_STORE,
  };
  if (req.query.deep === '1') {
    try {
      const upstream = await rpcCall<{ version: string }>(
        env.BUGZILLA_URL,
        'Bugzilla.version',
        {},
        { kind: 'api_key', apiKey: env.BUGZILLA_API_KEY },
      );
      body.bugzilla = { ok: true, version: upstream.version };
    } catch (err) {
      body.ok = false;
      body.bugzilla = { ok: false, error: err instanceof Error ? err.message : 'unreachable' };
      res.status(503);
    }
  }
  res.set('Cache-Control', 'no-store').json(body);
});
