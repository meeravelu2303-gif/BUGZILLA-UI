# Refuses to run anywhere but the staging instance. `use`d first by every staging fixture script.
package StagingGuard;
use strict; use warnings; use Cwd qw(getcwd);
BEGIN {
  die "REFUSING: run from D:/Bugzilla-staging (cwd is ", getcwd(), ")\n" unless getcwd() =~ m{[\/]Bugzilla-staging$}i;
}
use lib qw(. lib);
use Bugzilla;
# Local databases staging may point at. Never `bugs` (live).
my %STAGING_DBS = map { $_ => 1 } qw(bugs_staging bugs_preview_copy bugs_preview);
die "REFUSING: localconfig db_name is not a staging database\n" unless $STAGING_DBS{Bugzilla->localconfig->{db_name}};
my ($db) = Bugzilla->dbh->selectrow_array('SELECT DATABASE()');
die "REFUSING: connected to '$db', not a staging database\n" unless $STAGING_DBS{$db};
1;
