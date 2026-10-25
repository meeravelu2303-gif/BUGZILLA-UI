#!/usr/bin/perl -T
# Changes an account's login (email address), keeping everything else: its id,
# password, groups, bugs, comments and history all stay with the account.
#
#   cd C:\Bugzilla
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\bugzilla\change-login.pl <old login> <new login>
#
# Goes through Bugzilla::User (set_login + update), so the new address is
# validated like editusers.cgi would, the change is recorded in the account's
# history (profiles_activity), and Bugzilla refuses a login already in use.
# If the old login is the "maintainer" parameter, that is moved to the new one.

use 5.14.0;
use strict;
use warnings;

use lib qw(. lib local/lib/perl5);

use Bugzilla;
use Bugzilla::Constants;
use Bugzilla::Config qw(SetParam write_params);
use Bugzilla::User;

Bugzilla->usage_mode(USAGE_MODE_CMDLINE);

my ($old, $new) = map { /^(\S+@\S+)$/ ? $1 : undef } @ARGV;
die "Usage: perl -T change-login.pl <old login> <new login>\n" unless $old && $new;

my $user = Bugzilla::User->new({name => $old}) or die "No account with the login $old\n";
die "$new is already used by another account\n" if Bugzilla::User->new({name => $new});

# Act as the account itself, so the history row names a real person.
Bugzilla->set_user($user);
$user->set_login($new);
$user->update();
say sprintf('Account %d (%s): login %s -> %s', $user->id, $user->name, $old, $user->login);

if (lc(Bugzilla->params->{maintainer} // '') eq lc($old)) {
  SetParam('maintainer', $new);
  write_params();
  say "Parameter maintainer: $old -> $new";
}
