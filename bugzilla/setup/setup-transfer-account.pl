#!/usr/bin/perl -T
# One-time (idempotent): the service account that carries out cross-product transfers.
#
#   cd C:\Bugzilla
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\bugzilla\setup-transfer-account.pl <admin login>
#   perl -T ...\setup-transfer-account.pl <admin login> --rotate     revoke the old key, issue a new one
#
# Then put the printed key in backend\.env as TRANSFER_API_KEY=... and restart the backend.
#
# Why a separate account. A KPost UI tester cannot move a bug into KPost API in
# Bugzilla without joining the KPost API group, which would show them every API
# bug. The Bug Tracker BFF does the move for them (backend/src/lib/productTransfer.ts),
# after checking on THEIR token that they may. The move itself needs an account
# that can enter both products - and if that is an admin's personal key, every
# transfer is recorded in Bugzilla's history as that admin, with full admin rights
# behind it. This account is the narrow alternative:
#
#   member of   editbugs, canconfirm, and each product's same-named group
#   NOT in      admin, editusers, editcomponents, tweakparams, Deleted bugs
#   no mail     bugmail disabled, so being CC'd/assigned never emails it
#   no login    random password nobody knows; it is used only through its API key
#
# Re-running adds any product group created since (run it after adding a product).

use 5.14.0;
use strict;
use warnings;

use lib qw(. lib local/lib/perl5);

use Getopt::Long qw(GetOptions);

use Bugzilla;
use Bugzilla::Constants;
use Bugzilla::Group;
use Bugzilla::Product;
use Bugzilla::User;
use Bugzilla::User::APIKey;
use Bugzilla::Util qw(generate_random_password);

use constant LOGIN       => 'bugtracker-transfer@kpost.in';
use constant REALNAME    => 'Bug Tracker (transfers)';
use constant KEY_PURPOSE => 'Bug Tracker BFF - cross-product transfers';
use constant ROLE_GROUPS => qw(editbugs canconfirm);

Bugzilla->usage_mode(USAGE_MODE_CMDLINE);

my $rotate;
GetOptions('rotate' => \$rotate) or die "Bad arguments\n";
my ($admin_login) = @ARGV;
die "Usage: perl -T setup-transfer-account.pl <admin login> [--rotate]\n" unless $admin_login;
($admin_login) = $admin_login =~ /^([^\s]+)$/ or die "Bad login\n";

my $admin = Bugzilla::User->check({name => $admin_login});
$admin->in_group('admin') or die "$admin_login is not a Bugzilla admin\n";
Bugzilla->set_user($admin);

my $dbh = Bugzilla->dbh;
$dbh->bz_start_transaction();

# 1. The account.
my $bot = Bugzilla::User->new({name => LOGIN});
if ($bot) {
  say "ok      account " . LOGIN . " exists (id " . $bot->id . ")";
}
else {
  $bot = Bugzilla::User->create({
    login_name    => LOGIN,
    realname      => REALNAME,
    cryptpassword => generate_random_password(48),
  });
  say "created account " . LOGIN . " (id " . $bot->id . ")";
}
$bot->set_disable_mail(1);

# 2. Groups: the role groups plus every product's same-named group.
my %have = map { lc($_) => 1 } @{
  $dbh->selectcol_arrayref(
    'SELECT g.name FROM user_group_map m JOIN groups g ON g.id = m.group_id
      WHERE m.user_id = ? AND m.isbless = 0 AND m.grant_type = ?', undef, $bot->id, GRANT_DIRECT
  )
};
my @want = (ROLE_GROUPS);
foreach my $product (Bugzilla::Product->get_all) {
  my $group = Bugzilla::Group->new({name => $product->name});
  push @want, $group->name if $group && $group->is_active;
}
my @add = grep { !$have{lc $_} } @want;
if (@add) {
  $bot->set_groups({add => \@add});
  say "added   groups: " . join(', ', @add);
}
else {
  say "ok      groups: " . join(', ', @want);
}
$bot->update();

# Guard rail: this account must never hold instance-wide power. Re-loaded so
# in_group sees the memberships just written, not the object's cached list.
$bot = Bugzilla::User->new($bot->id);
foreach my $forbidden (qw(admin editusers editcomponents tweakparams creategroups)) {
  die "REFUSING: " . LOGIN . " is in '$forbidden' - remove it in editusers.cgi\n" if $bot->in_group($forbidden);
}

# 3. The API key.
my $keys = Bugzilla::User::APIKey->match({user_id => $bot->id, revoked => 0});
my ($current) = grep { $_->description eq KEY_PURPOSE } @$keys;
my $new_key;
if ($current && !$rotate) {
  say "ok      API key exists (last used " . ($current->last_used // 'never') . "); --rotate issues a new one";
}
else {
  if ($current) {
    $current->set_all({revoked => 1});
    $current->update();
    say "revoked previous API key";
  }
  $new_key = Bugzilla::User::APIKey->create({user_id => $bot->id, description => KEY_PURPOSE});
}

$dbh->bz_commit_transaction();

if ($new_key) {
  say "";
  say "API key (shown once - store it now):";
  say "";
  say "  TRANSFER_API_KEY=" . $new_key->api_key;
  say "";
  say "Add that line to backend\\.env and restart the backend.";
}
