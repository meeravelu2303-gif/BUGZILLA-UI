#!/usr/bin/perl -T
# Set ONE password on every tester, developer and reporter account.
#
#   cd C:\Bugzilla
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\bugzilla\set-bulk-password.pl <admin login>            (dry run: lists accounts)
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\bugzilla\set-bulk-password.pl <admin login> --execute  (writes)
#
# The password comes from the BULK_PASSWORD environment variable, never from
# the command line (which would land in shell history). Skipped: admins
# (editusers / editcomponents), disabled accounts, and the service accounts
# (the bench, transfers, placeholders). Goes through Bugzilla::User->set_password
# so hashing and the password policy are Bugzilla's own.

use 5.14.0;
use strict;
use warnings;

use lib qw(. lib local/lib/perl5);

use Getopt::Long qw(GetOptions);

use Bugzilla;
use Bugzilla::Constants;
use Bugzilla::User;

Bugzilla->usage_mode(USAGE_MODE_CMDLINE);
Bugzilla->error_mode(ERROR_MODE_DIE);

my %SERVICE = map { $_ => 1 } qw(bugtracker-transfer@kpost.in admin@example.com mantis-unknown@mantis.invalid);

my $execute = 0;
GetOptions('execute' => \$execute) or die "Bad arguments\n";
my ($admin_login) = @ARGV;
die "Usage: perl -T set-bulk-password.pl <admin login> [--execute]\n" unless $admin_login;
($admin_login) = $admin_login =~ /^(\S+)$/ or die "Bad login\n";
my ($password) = ($ENV{BULK_PASSWORD} // '') =~ /^(.*)$/s;
die "Set BULK_PASSWORD in the environment\n" if $password eq '';

my $admin = Bugzilla::User->check({name => $admin_login});
$admin->in_group('admin') or die "$admin_login is not a Bugzilla admin\n";
Bugzilla->set_user($admin);

my $dbh = Bugzilla->dbh;
my $ids = $dbh->selectcol_arrayref('SELECT userid FROM profiles ORDER BY login_name');
my (@targets, @skipped);
for my $id (@$ids) {
  my $u = Bugzilla::User->new($id);
  my $why = !$u->is_enabled ? 'disabled'
    : $SERVICE{lc $u->login} ? 'service account'
    : ($u->in_group('editusers') || $u->in_group('editcomponents')) ? 'admin'
    : '';
  if ($why) { push @skipped, [$u, $why]; next; }
  my $role = $u->in_group('canconfirm') ? 'tester' : $u->in_group('reporter') ? 'reporter' : 'developer';
  push @targets, [$u, $role];
}

say $execute ? 'MODE    EXECUTE' : 'MODE    DRY RUN - nothing is written (add --execute)';
say sprintf('%-9s %-40s %s', 'ROLE', 'LOGIN', 'NAME');
say sprintf('%-9s %-40s %s', $_->[1], $_->[0]->login, $_->[0]->name) for @targets;
say '';
say 'SKIPPED ' . $_->[0]->login . "  ($_->[1])" for @skipped;
say '';
say 'TOTAL   ' . scalar(@targets) . ' accounts will get the new password; ' . scalar(@skipped) . ' skipped';
unless ($execute) { say 'DRY RUN complete - nothing changed.'; exit 0; }

$dbh->bz_start_transaction();
my $ok = eval {
  for my $t (@targets) {
    $t->[0]->set_password($password);
    $t->[0]->update();
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
say 'DONE    password set on ' . scalar(@targets) . ' accounts';
