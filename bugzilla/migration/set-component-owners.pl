#!/usr/bin/perl -T
# Set the default owner (assignee) of EVERY component of one or more products,
# and make sure that owner can access the product.
#
#   cd C:\Bugzilla
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\migration\set-component-owners.pl <admin login> \
#        --set "API and SERVER Issue=jitendra@kpost.in" --set "APK FILE ISSUES=manohar@kpost.in"            (dry run)
#   ... same, plus --execute                                                                                 (writes)
#
# Each --set is "<product name>=<owner login>". For every component of that
# product the default assignee becomes the owner (QA contact is not touched).
# If the owner is not a member of the product's same-named access group, they
# are added - an owner who cannot see the product's bug list cannot work it.
#
# Only the component's DEFAULT changes: bugs already filed keep their current
# assignee. Runs through Bugzilla's own objects in one transaction; re-running
# with the same arguments changes nothing.

use 5.14.0;
use strict;
use warnings;

use lib qw(. lib local/lib/perl5);

use Getopt::Long qw(GetOptions);

use Bugzilla;
use Bugzilla::Constants;
use Bugzilla::Component;
use Bugzilla::Group;
use Bugzilla::Product;
use Bugzilla::User;

Bugzilla->usage_mode(USAGE_MODE_CMDLINE);
Bugzilla->error_mode(ERROR_MODE_DIE);

my ($execute, @sets) = (0);
GetOptions('execute' => \$execute, 'set=s' => \@sets) or die "Bad arguments\n";
my ($admin_login) = @ARGV;
die "Usage: perl -T set-component-owners.pl <admin login> --set \"Product=owner\" [--set ...] [--execute]\n"
  unless $admin_login && @sets;
($admin_login) = $admin_login =~ /^(\S+)$/ or die "Bad login\n";

my $admin = Bugzilla::User->check({name => $admin_login});
$admin->in_group('admin') or die "$admin_login is not a Bugzilla admin\n";
Bugzilla->set_user($admin);

my @plan;
for my $set (@sets) {
  my ($pname, $login) = $set =~ /^(.+?)\s*=\s*(\S+)$/ or die "Bad --set '$set' (expected \"Product=owner\")\n";
  my $product = Bugzilla::Product->new({name => $pname}) or die "No product '$pname'\n";
  my $owner   = Bugzilla::User->new({name => $login})    or die "No account '$login'\n";
  die "Account $login is disabled - enable it first\n" unless $owner->is_enabled;
  my $group = Bugzilla::Group->new({name => $product->name});
  push @plan, {product => $product, owner => $owner, group => $group};
}

say $execute ? "MODE    EXECUTE" : "MODE    DRY RUN - nothing is written (add --execute)";
for my $p (@plan) {
  say "";
  say sprintf('%s  ->  %s (%s)', $p->{product}->name, $p->{owner}->login, $p->{owner}->name);
  for my $c (@{$p->{product}->components}) {
    my $was = $c->default_assignee->login;
    say sprintf('    %-24s %s', $c->name, $was eq $p->{owner}->login ? "already $was" : "$was  ->  " . $p->{owner}->login);
  }
  if ($p->{group}) {
    say $p->{owner}->in_group($p->{group}->name)
      ? "    access: already in group '" . $p->{group}->name . "'"
      : "    access: will be ADDED to group '" . $p->{group}->name . "'";
  }
}
say "";
unless ($execute) { say "DRY RUN complete - nothing changed."; exit 0; }

my $dbh = Bugzilla->dbh;
$dbh->bz_start_transaction();
my ($n_comp, $n_group) = (0, 0);
my $ok = eval {
  for my $p (@plan) {
    for my $c (@{$p->{product}->components}) {
      next if $c->default_assignee->id == $p->{owner}->id;
      $c->set_default_assignee($p->{owner}->login);
      $c->update();
      $n_comp++;
    }
    if ($p->{group} && !$p->{owner}->in_group($p->{group}->name)) {
      $p->{owner}->set_groups({add => [$p->{group}->name]});
      $p->{owner}->update();
      $n_group++;
    }
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
say "DONE    components updated $n_comp, access granted $n_group";
