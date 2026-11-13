#!/usr/bin/perl -T
# Create the "reporter" role group and put accounts in it.
#
#   cd C:\Bugzilla
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\bugzilla\add-reporter-role.pl <admin login> \
#        --user vijayakumarg@kpostindia.com --user sumithra@kpostindia.com            (dry run)
#   ... same, plus --execute                                                          (writes)
#
# A reporter is office staff who FILE and follow bugs but neither develop nor
# test: no `canconfirm` (no triage), and the app leaves them out of every
# assignee list. The group is a plain marker (not a bug group, no regexp);
# the app's role model (backend/src/lib/roles.ts) reads it as role "reporter".
# Membership changes go through Bugzilla::User->set_groups, so profiles_activity
# records them. Re-running changes nothing.

use 5.14.0;
use strict;
use warnings;

use lib qw(. lib local/lib/perl5);

use Getopt::Long qw(GetOptions);

use Bugzilla;
use Bugzilla::Constants;
use Bugzilla::Group;
use Bugzilla::User;

Bugzilla->usage_mode(USAGE_MODE_CMDLINE);
Bugzilla->error_mode(ERROR_MODE_DIE);

my $GROUP = 'reporter';
my $DESC  = 'Reporter: office staff who file and follow bugs; not a developer or tester, never assigned work';

my ($execute, @logins) = (0);
GetOptions('execute' => \$execute, 'user=s' => \@logins) or die "Bad arguments\n";
my ($admin_login) = @ARGV;
die "Usage: perl -T add-reporter-role.pl <admin login> --user <login> [--user ...] [--execute]\n" unless $admin_login;
($admin_login) = $admin_login =~ /^(\S+)$/ or die "Bad login\n";
@logins = map { /^(\S+)$/ ? $1 : die "Bad --user '$_'\n" } @logins;

my $admin = Bugzilla::User->check({name => $admin_login});
$admin->in_group('admin') or die "$admin_login is not a Bugzilla admin\n";
Bugzilla->set_user($admin);

my $group = Bugzilla::Group->new({name => $GROUP});
my @users = map { Bugzilla::User->check({name => $_}) } @logins;

say $execute ? "MODE    EXECUTE" : "MODE    DRY RUN - nothing is written (add --execute)";
say $group ? "GROUP   '$GROUP' already exists" : "GROUP   '$GROUP' will be CREATED";
for my $u (@users) {
  my $in = $group && $u->in_group($GROUP);
  say sprintf('USER    %-40s %s%s', $u->login, $in ? 'already a reporter' : 'will be ADDED',
    $u->in_group('canconfirm') ? '   (note: also holds canconfirm - a tester; remove that by hand if wrong)' : '');
}
unless ($execute) { say "DRY RUN complete - nothing changed."; exit 0; }

my $dbh = Bugzilla->dbh;
$dbh->bz_start_transaction();
my $ok = eval {
  $group //= Bugzilla::Group->create({
    name        => $GROUP,
    description => $DESC,
    isbuggroup  => 0,
    isactive    => 1,
    userregexp  => '',
    icon_url    => '',
  });
  for my $u (@users) {
    next if $u->in_group($GROUP);
    $u->set_groups({add => [$GROUP]});
    $u->update();
  }
  1;
};
unless ($ok) {
  my $err = $@;
  $err = $err->message if ref $err && eval { $err->can('message') };
  $dbh->bz_rollback_transaction();
  die "FAILED: $err\nRolled back - nothing was written.\n";
}
$dbh->bz_commit_transaction();
say "DONE    group '$GROUP' ready, " . scalar(@users) . " account(s) checked";
