#!/usr/bin/perl -T
# Unlock one account after too many wrong passwords, and optionally set a new
# password. Clears Bugzilla's own lockout (the login_failure rows behind
# max_login_attempts); the Bug Tracker app's own 5-minute lock expires by itself.
#
#   cd C:\Bugzilla
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\bugzilla\unlock-account.pl user@example.com
#   $env:NEW_PASSWORD = 'Something2026'; perl -T ...\unlock-account.pl user@example.com --set-password
#
# The password comes from the NEW_PASSWORD environment variable, never the
# command line (which would land in shell history).

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

my $set_password = 0;
GetOptions('set-password' => \$set_password) or die "Bad arguments\n";
my ($login) = ($ARGV[0] // '') =~ /^(\S+\@\S+)$/ or die "Usage: unlock-account.pl <login> [--set-password]\n";

my $dbh  = Bugzilla->dbh;
my $user = Bugzilla::User->check({name => $login});
my ($failures) = $dbh->selectrow_array('SELECT COUNT(*) FROM login_failure WHERE user_id = ?', undef, $user->id);

$dbh->do('DELETE FROM login_failure WHERE user_id = ?', undef, $user->id);
say "UNLOCKED  " . $user->login . " ($failures recent failed attempts cleared)";

if ($user->disabledtext) {
  say "NOTE      the account is DISABLED (\"" . $user->disabledtext . "\") - unlocking does not enable it";
}

if ($set_password) {
  my ($pw) = ($ENV{NEW_PASSWORD} // '') =~ /^(.+)$/ or die "Set NEW_PASSWORD first\n";
  $user->set_password($pw);
  $user->update();
  say "PASSWORD  set for " . $user->login;
}
