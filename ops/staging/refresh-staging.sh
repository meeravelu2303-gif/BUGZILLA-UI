#!/usr/bin/env bash
# Refreshes the STAGING database from a fresh dump of LIVE. Run in Git Bash on the server.
#
#   ops/staging/refresh-staging.sh            # dumps live now, then restores it into bugs_staging
#   ops/staging/refresh-staging.sh dump.sql   # restores an existing live dump instead
#
# Live is only READ (mysqldump --single-transaction, no locks held). Staging keeps its own files:
# localconfig (-> bugs_staging), data/params.json (urlbase :8081, mail off, STAGING banner) live in
# D:\Bugzilla-staging and are untouched by a database refresh. Everything in the staging DATABASE
# (test bugs, robot accounts, value/workflow experiments) is replaced by live's current data.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
MYSQL="/c/Program Files/MariaDB 10.11/bin"
STAGING_DIR=/d/Bugzilla-staging
PERL=/c/Strawberry/perl/bin/perl.exe
# Reads one value from a Bugzilla localconfig: cfg <file> <name>  ("$db_name = 'x';" -> x)
cfg() { grep -E "^.$2 = " "$1" | sed -E "s/.*'(.*)'.*/\1/"; }

[ "$(cfg $STAGING_DIR/localconfig db_name)" = bugs_staging ] || { echo "REFUSING: $STAGING_DIR/localconfig is not bugs_staging"; exit 1; }
SP=$(cfg $STAGING_DIR/localconfig db_pass)

DUMP="${1:-}"
if [ -z "$DUMP" ]; then
  DUMP=/d/backups/bugzilla/staging-refresh-$(date +%Y%m%d-%H%M%S).sql
  LP=$(cfg /d/Bugzilla/localconfig db_pass)
  echo "1/5 dumping LIVE (read-only) -> $DUMP"
  "$MYSQL/mysqldump.exe" -ubugs -p"$LP" -P3307 -h127.0.0.1 --single-transaction --quick --hex-blob \
    --max-allowed-packet=512M --routines --triggers --databases bugs > "$DUMP" </dev/null
fi
tail -c 200 "$DUMP" | grep -q "Dump completed" || { echo "REFUSING: $DUMP is incomplete"; exit 1; }

echo "2/5 recreating bugs_staging (root, Windows authentication)"
"$MYSQL/mysql.exe" -uroot -P3307 -h127.0.0.1 </dev/null -e \
  "DROP DATABASE IF EXISTS bugs_staging; CREATE DATABASE bugs_staging DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

echo "3/5 restoring into bugs_staging as the staging user (it has no rights on live)"
# The dump starts with CREATE DATABASE `bugs` / USE `bugs`; only those two header lines are removed.
sed '0,/^CREATE DATABASE/{/^CREATE DATABASE/d}; 0,/^USE `bugs`;/{/^USE `bugs`;/d}' "$DUMP" \
  | "$MYSQL/mysql.exe" -ubugs_staging -p"$SP" -P3307 -h127.0.0.1 --max-allowed-packet=512M bugs_staging

echo "4/5 checksetup.pl + staging parameters + robot account"
( cd "$STAGING_DIR" && "$PERL" checksetup.pl >/dev/null \
  && GUARD_DIR="$HERE" "$PERL" "$HERE/staging-params.pl" \
  && GUARD_DIR="$HERE" "$PERL" "$HERE/staging-robot.pl" )

echo "5/5 check"
"$MYSQL/mysql.exe" -uroot -P3307 -h127.0.0.1 -N </dev/null -e \
  "select concat('live bugs=',(select count(*) from bugs.bugs),'  staging bugs=',(select count(*) from bugs_staging.bugs));"
echo "Done. Staging: http://127.0.0.1:8081/   UI: npm run dev:staging -> http://localhost:5176/"
