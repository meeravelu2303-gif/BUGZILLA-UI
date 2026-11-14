#!/bin/bash
# Starts Bugzilla in a container:
#   1. waits for the database,
#   2. runs checksetup.pl with answers taken from environment variables (writes localconfig,
#      installs extension tables, compiles templates),
#   3. starts the mail queue runner, then Apache in the foreground.
#
# Required: BZ_DB_HOST BZ_DB_NAME BZ_DB_USER BZ_DB_PASS BZ_URLBASE
# Optional: BZ_DB_PORT (3306), BZ_SITE_WIDE_SECRET (keep the old server's to keep its tokens valid),
#           BZ_ADMIN_EMAIL / BZ_ADMIN_PASSWORD / BZ_ADMIN_REALNAME (only used on an empty database),
#           BZ_APP_URL (the Bug Tracker app's address, for password-reset emails)
set -euo pipefail

: "${BZ_DB_HOST:?BZ_DB_HOST is required}" "${BZ_DB_NAME:?BZ_DB_NAME is required}"
: "${BZ_DB_USER:?BZ_DB_USER is required}" "${BZ_DB_PASS:?BZ_DB_PASS is required}" "${BZ_URLBASE:?BZ_URLBASE is required}"
export BZ_DB_PORT="${BZ_DB_PORT:-3306}"

cd /var/www/html

until nc -z "$BZ_DB_HOST" "$BZ_DB_PORT"; do
  echo "Waiting for the database at $BZ_DB_HOST:$BZ_DB_PORT ..."
  sleep 2
done

# checksetup.pl only fills in localconfig values that are missing, so localconfig is rebuilt from
# the environment on every start (a changed BZ_DB_PASS takes effect). Only site_wide_secret is
# carried over from the previous start, kept in the data volume, so tokens stay valid.
if [ -z "${BZ_SITE_WIDE_SECRET:-}" ] && [ -f data/localconfig ]; then
  BZ_SITE_WIDE_SECRET="$(perl -e 'our $site_wide_secret; do "./data/localconfig"; print $site_wide_secret // ""')"
  export BZ_SITE_WIDE_SECRET
fi
rm -f localconfig data/localconfig

answers="$(mktemp)"
trap 'rm -f "$answers"' EXIT
perl -MData::Dumper -e '
  $Data::Dumper::Terse = 1; $Data::Dumper::Useqq = 1; $Data::Dumper::Indent = 0;
  my %answer = (
    db_driver => "mariadb", db_host => $ENV{BZ_DB_HOST}, db_port => $ENV{BZ_DB_PORT},
    db_name => $ENV{BZ_DB_NAME}, db_user => $ENV{BZ_DB_USER}, db_pass => $ENV{BZ_DB_PASS},
    db_sock => "", db_check => 1, webservergroup => "www-data", use_suexec => 0,
    create_htaccess => 1, index_html => 0, urlbase => $ENV{BZ_URLBASE},
    webdotbase => "/usr/bin/dot", diffpath => "/usr/bin",
  );
  $answer{site_wide_secret} = $ENV{BZ_SITE_WIDE_SECRET} if $ENV{BZ_SITE_WIDE_SECRET};
  if ($ENV{BZ_ADMIN_EMAIL}) {
    @answer{qw(ADMIN_EMAIL ADMIN_PASSWORD ADMIN_REALNAME ADMIN_OK)} =
      ($ENV{BZ_ADMIN_EMAIL}, $ENV{BZ_ADMIN_PASSWORD} // "", $ENV{BZ_ADMIN_REALNAME} // "Administrator", "Y");
  }
  print "\$answer{" . Dumper($_) . "} = " . Dumper($answer{$_}) . ";\n" for sort keys %answer;
' > "$answers"

echo "Running checksetup.pl ..."
perl checksetup.pl "$answers"
rm -f "$answers"

mv localconfig data/localconfig
ln -s data/localconfig localconfig

# The "forgot password" email links to the Bug Tracker app. The template it installs lives in the
# image's filesystem, not a volume, so it is applied again on every start.
if [ -n "${BZ_APP_URL:-}" ]; then
  perl -T /opt/bugtracker/setup/setup-password-reset.pl --app-url "$BZ_APP_URL" ||
    echo "setup-password-reset.pl reported a problem - reset emails may link to Bugzilla's own page" >&2
fi

# Sends queued email (Bugzilla's use_mailer_queue) in the background.
perl jobqueue.pl start || echo "jobqueue.pl did not start - queued email will wait" >&2

echo "Starting Apache ..."
exec apache2ctl -D FOREGROUND
