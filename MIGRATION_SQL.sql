-- ============================================================================
--  MIGRATION_SQL.sql
--  Bugzilla configuration parity: laptop (local) -> office desktop
--
--  Generated 2026-10-19 from a row-level diff of the live local `bugs` database
--  against the office baseline dump 16_10_2026_bugs_dump.sql.
--
--  WHAT THIS DOES
--    Adds the REOPENED status, the DELETED resolution + "Deleted bugs" group
--    (soft delete), six workflow transitions, and 24 group memberships.
--
--  WHAT THIS DOES NOT DO
--    No ALTER TABLE. No CREATE TABLE. No schema change of any kind - the audit
--    found zero DDL drift between local and office. Every statement below is a
--    guarded INSERT of configuration rows.
--    It does not touch any bug, comment, attachment or password.
--
--  SAFETY
--    * Every statement is guarded by NOT EXISTS, so re-running changes nothing.
--    * Ids are resolved by name, never hardcoded. The local REOPENED happens to
--      be id 6 and DELETED id 7; on the office box they may differ, and that is
--      fine - nothing here or in the application depends on the number.
--    * Wrapped in a single transaction: it all applies or none of it does.
--
--  HOW TO RUN  (confirm the database name first - locally it is `bugs`)
--    mysql -u root -p --port=3306 bugs < MIGRATION_SQL.sql
--
--  TAKE A BACKUP FIRST
--    mysqldump -u root -p --port=3306 --single-transaction bugs > pre-migration.sql
--
--  AFTER RUNNING
--    Restart Apache so the CGI processes pick up the new status list.
-- ============================================================================

START TRANSACTION;

-- ---------------------------------------------------------------------------
-- 1. The REOPENED status
--
-- A developer marks a bug RESOLVED, QA re-tests, it is still broken. Moving it
-- back to CONFIRMED loses that story; REOPENED keeps "it came back" as its own
-- state, which is what the dashboard's Reopened tile counts.
--
-- sortkey 350 places it between IN_PROGRESS (300) and RESOLVED (400).
-- is_open = 1: a reopened bug is open work.
-- ---------------------------------------------------------------------------
INSERT INTO bug_status (value, sortkey, isactive, is_open)
SELECT 'REOPENED', 350, 1, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM bug_status WHERE value = 'REOPENED');

-- ---------------------------------------------------------------------------
-- 2. Workflow transitions
--
-- Bugzilla refuses any transition absent from status_workflow, so without these
-- rows the status would exist but be unreachable.
--
-- require_comment = 1 on the two routes INTO REOPENED: if a fix did not hold,
-- the reason is the only useful part of the record.
--
-- VERIFIED -> RESOLVED is included because soft delete sets a bug to
-- RESOLVED/DELETED, and without this row an already-verified bug could not be
-- deleted. (This row was added by hand locally - no setup script creates it.)
-- ---------------------------------------------------------------------------
INSERT INTO status_workflow (old_status, new_status, require_comment)
SELECT o.id, n.id, w.rc
FROM (
            SELECT 'RESOLVED'    AS o, 'REOPENED'    AS n, 1 AS rc
  UNION ALL SELECT 'VERIFIED',        'REOPENED',        1
  UNION ALL SELECT 'REOPENED',        'CONFIRMED',       0
  UNION ALL SELECT 'REOPENED',        'IN_PROGRESS',     0
  UNION ALL SELECT 'REOPENED',        'RESOLVED',        0
  UNION ALL SELECT 'VERIFIED',        'RESOLVED',        0
) w
JOIN bug_status o ON o.value = w.o
JOIN bug_status n ON n.value = w.n
WHERE NOT EXISTS (
  SELECT 1 FROM status_workflow s WHERE s.old_status = o.id AND s.new_status = n.id
);

-- ---------------------------------------------------------------------------
-- 3. Soft delete: the DELETED resolution
--
-- Bugzilla has no delete API. "Delete" in the UI means RESOLVED + DELETED, plus
-- membership of the "Deleted bugs" group (step 4) - closed, hidden, and fully
-- restorable, with the reason in a comment.
--
-- sortkey 1000 keeps it last, well clear of the stock values (100-600).
-- ---------------------------------------------------------------------------
INSERT INTO resolution (value, sortkey, isactive)
SELECT 'DELETED', 1000, 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM resolution WHERE value = 'DELETED');

-- ---------------------------------------------------------------------------
-- 4. Soft delete: the "Deleted bugs" group
--
-- isbuggroup = 1: it can be applied to bugs, not just to people.
-- With or_groups = 0 (the Bugzilla default, and the current setting), a bug in
-- several groups is visible only to someone in ALL of them - which is exactly
-- what makes a deleted bug vanish for everyone outside this group.
-- ---------------------------------------------------------------------------
INSERT INTO groups (name, description, isbuggroup, userregexp, isactive)
SELECT 'Deleted bugs',
       'Soft-deleted bugs. Visible only to testers and admins, who can restore them.',
       1, '', 1 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM groups WHERE name = 'Deleted bugs');

-- 4a. Who is in it, by inheritance rather than by a list of names - so a tester
--     added next month is covered without anyone remembering this step.
--
--     grant_type: 0 = membership, 1 = can bless (grant to others), 2 = visible.
--     admin gets all three; canconfirm (testers) gets membership.
INSERT INTO group_group_map (member_id, grantor_id, grant_type)
SELECT m.id, g.id, w.gt
FROM (
            SELECT 'admin'      AS member, 0 AS gt
  UNION ALL SELECT 'admin',          1
  UNION ALL SELECT 'admin',          2
  UNION ALL SELECT 'canconfirm',     0
) w
JOIN groups m ON m.name = w.member
JOIN groups g ON g.name = 'Deleted bugs'
WHERE NOT EXISTS (
  SELECT 1 FROM group_group_map x
  WHERE x.member_id = m.id AND x.grantor_id = g.id AND x.grant_type = w.gt
);

-- 4b. A group control on every product. Without it Bugzilla refuses to put a
--     bug of that product into the group, and delete fails at the last step.
--
--     entry = 0           : membership is not required to file into the product
--     membercontrol = 1   : SHOWN   - members may set the group on a bug
--     othercontrol  = 0   : NA      - everyone else cannot
--
--     Applied to all products including inactive ones, so re-activating a
--     product never leaves delete broken for it. Re-run after adding a product.
INSERT INTO group_control_map
  (group_id, product_id, entry, membercontrol, othercontrol, canedit,
   editcomponents, editbugs, canconfirm)
SELECT g.id, p.id, 0, 1, 0, 0, 0, 0, 0
FROM groups g
CROSS JOIN products p
WHERE g.name = 'Deleted bugs'
  AND NOT EXISTS (
    SELECT 1 FROM group_control_map c WHERE c.group_id = g.id AND c.product_id = p.id
  );

-- ---------------------------------------------------------------------------
-- 5. Group memberships (RBAC)
--
-- Two separate decisions, both additive - the audit found nothing removed:
--
--   a) Baskar is the testing team lead, so he gets editusers + editcomponents,
--      i.e. the admin role as this application defines it (lib/roles.ts).
--
--   b) Testers and admins get every product access group. A tester who cannot
--      see a product cannot re-test its bugs, and the dashboard counts would
--      silently exclude them. Developers are deliberately NOT widened here:
--      they keep only the products they already had.
--
-- Written as login + group names so it is reviewable, and so it survives any
-- difference in user ids between the two machines.
-- ---------------------------------------------------------------------------
INSERT INTO user_group_map (user_id, group_id, isbless, grant_type)
SELECT p.userid, g.id, 0, 0
FROM (
  -- (a) team lead -> admin
            SELECT 'baskar1992@kpost.in'       AS login, 'editusers'      AS grp
  UNION ALL SELECT 'baskar1992@kpost.in',            'editcomponents'

  -- (b) testers + admins -> all product groups
  UNION ALL SELECT 'meeravelu2303@gmail.com',        'TestProduct'
  UNION ALL SELECT 'meeravelu2303@gmail.com',        'KPost Admin'
  UNION ALL SELECT 'meeravelu2303@gmail.com',        'KMail API'
  UNION ALL SELECT 'meeravelu2303@gmail.com',        'Kpost Admin UI'
  UNION ALL SELECT 'baskar1992@kpost.in',            'TestProduct'
  UNION ALL SELECT 'baskar1992@kpost.in',            'Kpost Admin UI'
  UNION ALL SELECT 'lakshmiganthan027@kpost.in',     'TestProduct'
  UNION ALL SELECT 'lakshmiganthan027@kpost.in',     'KPost Admin'
  UNION ALL SELECT 'lakshmiganthan027@kpost.in',     'KMail API'
  UNION ALL SELECT 'lakshmiganthan027@kpost.in',     'Kpost Admin UI'
  UNION ALL SELECT 'sohail2795@kpostindia.com',      'TestProduct'
  UNION ALL SELECT 'sohail2795@kpostindia.com',      'Kpost Admin UI'
  UNION ALL SELECT 'prakash@kpost.in',               'TestProduct'
  UNION ALL SELECT 'prakash@kpost.in',               'Kpost Admin UI'
  UNION ALL SELECT 'ajithkumar16@kpost.in',          'TestProduct'
  UNION ALL SELECT 'ajithkumar16@kpost.in',          'Kpost Admin UI'
  UNION ALL SELECT 'mothilal@kpost.in',              'TestProduct'
  UNION ALL SELECT 'mothilal@kpost.in',              'Kpost Admin UI'
  UNION ALL SELECT 'rajan@kpost.in',                 'TestProduct'
  UNION ALL SELECT 'rajan@kpost.in',                 'Kpost Admin UI'
  UNION ALL SELECT 'karthikalai91@kpost.in',         'TestProduct'
  UNION ALL SELECT 'karthikalai91@kpost.in',         'Kpost Admin UI'
) w
JOIN profiles p ON p.login_name = w.login
JOIN groups   g ON g.name       = w.grp
WHERE NOT EXISTS (
  SELECT 1 FROM user_group_map m
  WHERE m.user_id = p.userid AND m.group_id = g.id
    AND m.isbless = 0 AND m.grant_type = 0
);

COMMIT;

-- ============================================================================
--  VERIFICATION - run these after the migration. Expected results in comments.
-- ============================================================================

-- Expect 6 rows, including REOPENED with sortkey 350 / is_open 1.
SELECT id, value, sortkey, isactive, is_open FROM bug_status ORDER BY sortkey;

-- Expect 7 rows, including DELETED.
SELECT id, value, sortkey, isactive FROM resolution ORDER BY sortkey;

-- Expect 22 rows. The two routes into REOPENED must show require_comment = 1.
SELECT COALESCE(o.value, '(initial)') AS from_status, n.value AS to_status, w.require_comment
FROM status_workflow w
LEFT JOIN bug_status o ON o.id = w.old_status
JOIN bug_status n ON n.id = w.new_status
ORDER BY o.sortkey, n.sortkey;

-- Expect one row per product (6 locally), membercontrol 1 / othercontrol 0.
SELECT p.name AS product, c.entry, c.membercontrol, c.othercontrol
FROM group_control_map c
JOIN groups g ON g.id = c.group_id
JOIN products p ON p.id = c.product_id
WHERE g.name = 'Deleted bugs'
ORDER BY p.name;

-- Expect 4 rows: admin (0,1,2) and canconfirm (0).
SELECT m.name AS member, g.name AS grantor, x.grant_type
FROM group_group_map x
JOIN groups m ON m.id = x.member_id
JOIN groups g ON g.id = x.grantor_id
WHERE g.name = 'Deleted bugs'
ORDER BY m.name, x.grant_type;

-- Expect ~10 rows for baskar1992@kpost.in, among them editusers + editcomponents.
SELECT p.login_name, g.name
FROM user_group_map m
JOIN profiles p ON p.userid = m.user_id
JOIN groups g ON g.id = m.group_id
WHERE p.login_name = 'baskar1992@kpost.in' AND m.isbless = 0 AND m.grant_type = 0
ORDER BY g.name;

-- Expect 9 users (the 8 canconfirm holders + Meera) each with 6 product groups.
SELECT p.login_name, COUNT(*) AS product_groups
FROM user_group_map m
JOIN profiles p ON p.userid = m.user_id
JOIN groups g ON g.id = m.group_id
WHERE g.isbuggroup = 1 AND g.name <> 'Deleted bugs'
  AND m.isbless = 0 AND m.grant_type = 0
GROUP BY p.login_name
HAVING product_groups >= 6
ORDER BY p.login_name;
