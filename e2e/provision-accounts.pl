#!/usr/bin/perl
# Creates the two accounts the E2E suite signs in as.
#
#   perl provision-accounts.pl            (run from C:\Bugzilla)
#
# These are deliberately NOT left on the instance between runs: they are robot
# accounts, and a bug tracker's user list should contain people. They hold no
# bugs and no comments, so creating and removing them costs nothing.
#
# Run this before `npm test` if global-setup reports the account cannot sign in.
# Remove them afterwards with purge-accounts.pl.
use 5.14.0;
use strict;
use warnings;
use lib qw(. lib);

use Bugzilla;
use Bugzilla::Constants;
use Bugzilla::User;

Bugzilla->usage_mode(USAGE_MODE_CMDLINE);

my $ADMIN = $ENV{BZ_ADMIN} || 'meeravelu2303@gmail.com';
my $admin = Bugzilla::User->new({name => $ADMIN})
  or die "Admin '$ADMIN' not found. Set BZ_ADMIN to an account with editusers.\n";
Bugzilla->set_user($admin);

# Mirrors e2e/support/env.ts. The main account needs BOTH product groups: the
# products are MANDATORY-gated, so an account outside them sees zero bugs and
# every UI assertion would pass vacuously against an empty table.
my @ACCOUNTS = (
  { login  => 'qa-e2e@kpost.local',
    name   => 'QA E2E Bot',
    pass   => 'E2e-Test-Passw0rd!',
    groups => ['editbugs', 'KPost API', 'KPost UI'] },

  # Sacrificial: one spec drives this past Bugzilla's own max_login_failures,
  # which locks it for loginfailure_interval. Kept separate so that lockout can
  # never strand the account the rest of the suite signs in with.
  { login  => 'qa-e2e-lockout@kpost.local',
    name   => 'QA E2E Lockout Probe',
    pass   => 'E2e-Lockout-Passw0rd!',
    groups => [] },
);

for my $acct (@ACCOUNTS) {
  my $user = Bugzilla::User->new({name => $acct->{login}});
  if ($user) {
    print "exists:  $acct->{login}\n";
  }
  else {
    $user = Bugzilla::User->create({
      login_name    => $acct->{login},
      realname      => $acct->{name},
      cryptpassword => $acct->{pass},
    });
    print "created: $acct->{login}\n";
  }

  for my $group (@{$acct->{groups}}) {
    next if $user->in_group($group);
    $user->set_groups({add => [$group]});
    $user->update();
    print "  + $group\n";
  }
}
print "DONE\n";
