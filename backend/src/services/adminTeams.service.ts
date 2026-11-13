import { BugzillaClient } from '../clients/bugzilla.client';
import { env } from '../config/app.config';

export const teamsClient = () =>
  new BugzillaClient(env.BUGZILLA_URL, { kind: 'api_key', apiKey: env.BUGZILLA_API_KEY });
