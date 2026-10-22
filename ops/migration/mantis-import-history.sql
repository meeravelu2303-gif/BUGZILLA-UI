-- Import Mantis change history into Bugzilla's activity log (bugs.bugs_activity),
-- so every bug imported from Mantis shows its real past in the Bug Tracker's
-- Activity panel: who confirmed it, who fixed it, who reopened it, and when.
--
-- Run as root (reads mantis_real, writes bugs.bugs_activity):
--   mysql -uroot ... -e "SET @execute = 0; SOURCE mantis-import-history.sql;"   (dry run: stage + report)
--   mysql -uroot ... -e "SET @execute = 1; SOURCE mantis-import-history.sql;"   (writes)
--
-- What is imported (Mantis history type 0 = a field change), for every Mantis
-- bug that exists in live Bugzilla (cf_mantis_ref):
--   status      -> bug_status   (10,20 UNCONFIRMED; 30,40 CONFIRMED; 50 IN_PROGRESS; 80 RESOLVED; 90 VERIFIED)
--   resolution  -> resolution   (20 FIXED; 40 WORKSFORME; 60 DUPLICATE; 70 INVALID; 50,80,90 WONTFIX; 10,30 none)
--   handler_id  -> assigned_to  (Mantis user -> live login via zz_user_map)
--   category    -> component    (names, as stored)
--   project_id  -> product      (Mantis project name = live product name)
--   summary     -> short_desc
-- The value mapping is the one the import itself produced (verified against
-- each bug's final Mantis status/resolution and its live status/resolution).
-- A change that maps to the same value on both sides (e.g. new -> feedback,
-- both UNCONFIRMED) is skipped. Who made it: their live account, or the
-- "Unknown (deleted Mantis user)" placeholder for accounts Mantis has deleted.
-- Times: FROM_UNIXTIME, exactly how the imported bugs' own dates were set.
--
-- Safe to re-run: rows already imported are flagged in the staging table and
-- skipped. Every write is logged with its bugs_activity id range in
-- mantis_real.zz_history_import_log; to undo a run:
--   DELETE FROM bugs.bugs_activity WHERE id BETWEEN <min_id> AND <max_id>;
-- Writes only bugs.bugs_activity and mantis_real.zz_* tables. bugs_mantis is never touched.

CREATE TABLE IF NOT EXISTS mantis_real.zz_history_import (
  mantis_hist_id INT UNSIGNED PRIMARY KEY,
  bug_id MEDIUMINT NOT NULL,
  who MEDIUMINT NOT NULL,
  bug_when DATETIME NOT NULL,
  fieldid MEDIUMINT NOT NULL,
  removed VARCHAR(255),
  added VARCHAR(255),
  imported TINYINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mantis_real.zz_history_import_log (
  run_at DATETIME NOT NULL,
  rows_written INT NOT NULL,
  min_id INT,
  max_id INT
);

SET @unknown := (SELECT userid FROM bugs.profiles WHERE login_name = 'mantis-unknown@mantis.invalid');
SET @f_status := (SELECT id FROM bugs.fielddefs WHERE name = 'bug_status');
SET @f_res := (SELECT id FROM bugs.fielddefs WHERE name = 'resolution');
SET @f_assignee := (SELECT id FROM bugs.fielddefs WHERE name = 'assigned_to');
SET @f_component := (SELECT id FROM bugs.fielddefs WHERE name = 'component');
SET @f_product := (SELECT id FROM bugs.fielddefs WHERE name = 'product');
SET @f_summary := (SELECT id FROM bugs.fielddefs WHERE name = 'short_desc');

-- Stage (re-staging leaves already-imported rows alone).
INSERT IGNORE INTO mantis_real.zz_history_import (mantis_hist_id, bug_id, who, bug_when, fieldid, removed, added)
SELECT * FROM (
  SELECT
    h.id,
    b.bug_id,
    COALESCE(um.live_uid, @unknown) who,
    FROM_UNIXTIME(h.date_modified) bug_when,
    CASE h.field_name
      WHEN 'status' THEN @f_status WHEN 'resolution' THEN @f_res WHEN 'handler_id' THEN @f_assignee
      WHEN 'category' THEN @f_component WHEN 'project_id' THEN @f_product WHEN 'summary' THEN @f_summary END fieldid,
    LEFT(CASE h.field_name
      WHEN 'status' THEN CASE h.old_value WHEN '10' THEN 'UNCONFIRMED' WHEN '20' THEN 'UNCONFIRMED' WHEN '30' THEN 'CONFIRMED' WHEN '40' THEN 'CONFIRMED'
                                          WHEN '50' THEN 'IN_PROGRESS' WHEN '80' THEN 'RESOLVED' WHEN '90' THEN 'VERIFIED' ELSE h.old_value END
      WHEN 'resolution' THEN CASE h.old_value WHEN '20' THEN 'FIXED' WHEN '40' THEN 'WORKSFORME' WHEN '60' THEN 'DUPLICATE' WHEN '70' THEN 'INVALID'
                                              WHEN '50' THEN 'WONTFIX' WHEN '80' THEN 'WONTFIX' WHEN '90' THEN 'WONTFIX' ELSE '' END
      WHEN 'handler_id' THEN CASE WHEN h.old_value IN ('', '0') THEN '' ELSE COALESCE(om.live_login, 'mantis-unknown@mantis.invalid') END
      WHEN 'project_id' THEN COALESCE(op.name, h.old_value)
      ELSE h.old_value END, 255) removed,
    LEFT(CASE h.field_name
      WHEN 'status' THEN CASE h.new_value WHEN '10' THEN 'UNCONFIRMED' WHEN '20' THEN 'UNCONFIRMED' WHEN '30' THEN 'CONFIRMED' WHEN '40' THEN 'CONFIRMED'
                                          WHEN '50' THEN 'IN_PROGRESS' WHEN '80' THEN 'RESOLVED' WHEN '90' THEN 'VERIFIED' ELSE h.new_value END
      WHEN 'resolution' THEN CASE h.new_value WHEN '20' THEN 'FIXED' WHEN '40' THEN 'WORKSFORME' WHEN '60' THEN 'DUPLICATE' WHEN '70' THEN 'INVALID'
                                              WHEN '50' THEN 'WONTFIX' WHEN '80' THEN 'WONTFIX' WHEN '90' THEN 'WONTFIX' ELSE '' END
      WHEN 'handler_id' THEN CASE WHEN h.new_value IN ('', '0') THEN '' ELSE COALESCE(nm.live_login, 'mantis-unknown@mantis.invalid') END
      WHEN 'project_id' THEN COALESCE(np.name, h.new_value)
      ELSE h.new_value END, 255) added
  FROM mantis_real.mantis_bug_history_table h
  JOIN bugs.bugs b ON b.cf_mantis_ref <> '' AND BINARY b.cf_mantis_ref = CAST(h.bug_id AS CHAR)
  LEFT JOIN mantis_real.zz_user_map um ON um.mantis_uid = h.user_id
  LEFT JOIN mantis_real.zz_user_map om ON h.field_name = 'handler_id' AND om.mantis_uid = CAST(NULLIF(h.old_value, '') AS UNSIGNED)
  LEFT JOIN mantis_real.zz_user_map nm ON h.field_name = 'handler_id' AND nm.mantis_uid = CAST(NULLIF(h.new_value, '') AS UNSIGNED)
  LEFT JOIN mantis_real.mantis_project_table op ON h.field_name = 'project_id' AND op.id = CAST(NULLIF(h.old_value, '') AS UNSIGNED)
  LEFT JOIN mantis_real.mantis_project_table np ON h.field_name = 'project_id' AND np.id = CAST(NULLIF(h.new_value, '') AS UNSIGNED)
  WHERE h.type = 0 AND h.field_name IN ('status', 'resolution', 'handler_id', 'category', 'project_id', 'summary')
) s
WHERE BINARY COALESCE(s.removed, '') <> BINARY COALESCE(s.added, '');

-- Report.
SELECT f.name AS field, COUNT(*) AS staged, SUM(z.imported) AS already_imported, SUM(z.who = @unknown) AS by_deleted_user,
       COUNT(DISTINCT z.bug_id) AS bugs
  FROM mantis_real.zz_history_import z JOIN bugs.fielddefs f ON f.id = z.fieldid
 GROUP BY f.name ORDER BY staged DESC;

-- Write (only with @execute = 1).
SET @before := (SELECT COALESCE(MAX(id), 0) FROM bugs.bugs_activity);
INSERT INTO bugs.bugs_activity (bug_id, attach_id, who, bug_when, fieldid, added, removed, comment_id)
SELECT bug_id, NULL, who, bug_when, fieldid, added, removed, NULL
  FROM mantis_real.zz_history_import
 WHERE @execute = 1 AND imported = 0
 ORDER BY bug_when, mantis_hist_id;
SET @written := ROW_COUNT();
UPDATE mantis_real.zz_history_import SET imported = 1 WHERE @execute = 1 AND imported = 0;
INSERT INTO mantis_real.zz_history_import_log (run_at, rows_written, min_id, max_id)
SELECT NOW(), @written, @before + 1, (SELECT MAX(id) FROM bugs.bugs_activity) FROM DUAL WHERE @execute = 1 AND @written > 0;
SELECT IF(@execute = 1, CONCAT('WROTE ', @written, ' activity rows'), 'DRY RUN - nothing written to bugs (SET @execute = 1 to write)') AS result;
SELECT * FROM mantis_real.zz_history_import_log ORDER BY run_at DESC LIMIT 3;
