# Creates (or refreshes) the staging robot admin used for testing. Staging only - StagingGuard refuses elsewhere.
#   cd /d/Bugzilla-staging && GUARD_DIR=<this folder> perl <this folder>/staging-robot.pl
use 5.14.0; use strict; use warnings;
use lib $ENV{GUARD_DIR}; use StagingGuard;
use Bugzilla::Constants; use Bugzilla::User;
Bugzilla->usage_mode(USAGE_MODE_CMDLINE);
Bugzilla->set_user(Bugzilla::User->new({name => $ENV{BZ_ADMIN} || 'meeravelu2303@gmail.com'}) or die "admin account not found\n");
my $login = 'qa-staging-admin@kpost.local';
my $u = Bugzilla::User->new({name => $login})
  || Bugzilla::User->create({login_name => $login, realname => 'QA Staging Admin', cryptpassword => $ENV{STAGING_ROBOT_PASSWORD} || 'Staging-Test-Passw0rd!'});
$u->set_groups({add => [qw(admin editcomponents creategroups editusers tweakparams editbugs canconfirm), 'KPost API', 'KPost UI']});
$u->update;
say "staging robot: $login (id ", $u->id, ")";
