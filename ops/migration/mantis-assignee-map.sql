-- Real assignee for one reporter's Mantis bugs, for mantis-step2-bugs.pl --assignee-map.
--
-- The rule the owner confirmed on 2026-10-20, for EVERY imported bug:
--   1. the developer who RESOLVED it (last status change to 80 by someone other
--      than the reporter), if they have a live account;
--   2. else, if the bug's Mantis handler was a DELETED Mantis account (or the
--      reporter themself), the bug's COMPONENT OWNER - emitted as the literal
--      'component-owner', which the importer turns into "no assignee", so
--      Bug->create falls back to the component default;
--   3. else the preview's handler (no row emitted; importer keeps it).
-- Mantis handed resolved bugs back to the reporter, so the preview's handler is
-- the tester on most closed bugs - that is why rule 1 wins over the handler.
--
-- Also lists resolvers lacking product access (how = 'needs-access'): grant it
-- BEFORE importing, or Bugzilla refuses the create. Reads bugs/bugs_mantis;
-- writes only mantis_real.zz_* tables.
--
--   mysql -uroot ... -e "SET @rep = <mantis reporter user id>; SOURCE mantis-assignee-map.sql;"
--   export: SELECT mantis_no, live_login FROM mantis_real.zz_assignee_map WHERE live_login IS NOT NULL

CREATE OR REPLACE TABLE mantis_real.zz_assignee_cand AS
SELECT b.id mantis_no, p.name product, b.handler_id, b.reporter_id,
  (SELECT h.user_id FROM mantis_real.mantis_bug_history_table h
    WHERE h.bug_id = b.id AND h.field_name = 'status' AND h.new_value = '80' AND h.user_id <> b.reporter_id
    ORDER BY h.id DESC LIMIT 1) resolver,
  EXISTS (SELECT 1 FROM mantis_real.mantis_user_table u WHERE u.id = b.handler_id) handler_exists
FROM mantis_real.mantis_bug_table b
JOIN mantis_real.mantis_project_table p ON p.id = b.project_id
WHERE b.reporter_id = @rep;

CREATE OR REPLACE TABLE mantis_real.zz_assignee_map AS
SELECT c.mantis_no, c.product, c.resolver, c.handler_id,
  CASE
    WHEN mr.live_uid IS NOT NULL THEN mr.live_login
    WHEN NOT c.handler_exists OR c.handler_id = c.reporter_id OR c.handler_id = 0 OR mh.live_uid IS NULL THEN 'component-owner'
  END live_login,
  CASE
    WHEN mr.live_uid IS NULL AND (NOT c.handler_exists OR c.handler_id = c.reporter_id OR c.handler_id = 0 OR mh.live_uid IS NULL) THEN 'component-owner'
    WHEN mr.live_uid IS NULL THEN 'keep-handler'
    WHEN EXISTS (SELECT 1 FROM bugs.user_group_map m JOIN bugs.groups g ON g.id = m.group_id
         WHERE CONVERT(g.name USING utf8mb4) COLLATE utf8mb4_general_ci = c.product AND m.user_id = mr.live_uid AND m.isbless = 0)
      THEN 'resolver'
    ELSE 'needs-access'
  END how,
  mr.live_uid resolver_uid
FROM mantis_real.zz_assignee_cand c
LEFT JOIN mantis_real.zz_user_map mr ON mr.mantis_uid = c.resolver
LEFT JOIN mantis_real.zz_user_map mh ON mh.mantis_uid = c.handler_id;
