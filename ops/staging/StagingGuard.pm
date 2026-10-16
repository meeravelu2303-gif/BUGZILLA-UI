# Refuses to run anywhere but the staging instance. `use`d first by every staging fixture script.
package StagingGuard;
use strict; use warnings; use Cwd qw(getcwd);
BEGIN {
  die "REFUSING: run from D:/Bugzilla-staging (cwd is ", getcwd(), ")\n" unless getcwd() =~ m{[\/]Bugzilla-staging$}i;
}
use lib qw(. lib);
use Bugzilla;
die "REFUSING: localconfig db_name is not bugs_staging\n" unless Bugzilla->localconfig->{db_name} eq 'bugs_staging';
my ($db) = Bugzilla->dbh->selectrow_array('SELECT DATABASE()');
die "REFUSING: connected to '$db', not bugs_staging\n" unless $db eq 'bugs_staging';
1;
