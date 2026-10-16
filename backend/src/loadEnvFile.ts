import dotenv from 'dotenv';

/**
 * Loads exactly ONE env file before anything else reads process.env (imported first in index.ts).
 *
 *   npm run dev            -> .env           (live Bugzilla)
 *   npm run dev:staging    -> .env.staging   (staging Bugzilla, via `--env-file=.env.staging`)
 *
 * Deliberately not dotenv's usual "load .env, then layer another file on top": a key missing from
 * .env.staging would then silently fall back to the LIVE value - BUGZILLA_URL above all - and a
 * staging session would read and write the live tracker. With one file, a missing key fails
 * startup validation instead (config/env.ts).
 */
const flag = process.argv.find((a) => a.startsWith('--env-file='));
const path = flag ? flag.slice('--env-file='.length) : '.env';

const result = dotenv.config({ path });
if (result.error) {
  console.error(`Could not load environment file "${path}": ${result.error.message}`);
  process.exit(1);
}
if (flag) console.log(`[env] loaded ${path}`);
