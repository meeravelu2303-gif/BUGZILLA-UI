#!/usr/bin/perl -T
# Narrow DEVELOPER access on the products imported from Mantis.
#
#   cd C:\Bugzilla
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\migration\trim-developer-access.pl <admin login> --report <file>             (dry run)
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\migration\trim-developer-access.pl <admin login> --report <file> --execute   (writes)
#
# Step 1 granted a product's access group to anyone who appeared ANYWHERE on
# its Mantis bugs - a single comment or CC was enough - so every product's
# developer list holds people who never worked it. Here a developer keeps a
# product only if, for that product, they:
#   - were assigned at least one bug in Mantis (bugs_mantis, read only), or
#   - are assigned at least one bug in live Bugzilla, or
#   - are a component's default assignee or QA contact.
# Everyone else loses that ONE product group. Nothing else changes:
#   - testers (canconfirm) and admins (editusers/editcomponents) are never
#     touched - they keep every product;
#   - service accounts are skipped;
#   - only the 45 Mantis products (step1-state.json) are considered;
#   - only DIRECT grants are removed (group-inherited or regexp grants stay).
# Removal goes through Bugzilla::User->set_groups, so profiles_activity
# records it. One transaction; re-running finds nothing more to remove.

use 5.14.0;
use strict;
use warnings;
use utf8;

use lib qw(. lib local/lib/perl5);

use DBI;
use Getopt::Long qw(GetOptions);
use JSON::PP;

use Bugzilla;
use Bugzilla::Constants;
use Bugzilla::Group;
use Bugzilla::User;

Bugzilla->usage_mode(USAGE_MODE_CMDLINE);
Bugzilla->error_mode(ERROR_MODE_DIE);

my $STATE  = 'D:/TEST-BENCH-AUTOMATIONS/_backups/mantis-migration/step1-state.json';
my %SERVICE = map { $_ => 1 } qw(bugtracker-transfer@kpost.in admin@example.com mantis-unknown@mantis.invalid);

my ($execute, $report) = (0, '');
GetOptions('execute' => \$execute, 'report=s' => \$report) or die "Bad arguments\n";
my ($admin_login) = @ARGV;
die "Usage: perl -T trim-developer-access.pl <admin login> --report <file> [--execute]\n" unless $admin_login && $report;
($admin_login) = $admin_login =~ /^(\S+)$/ or die "Bad login\n";
($report) = $report =~ /^([\w:\\\/.\- ~]+)$/ or die "Bad report path\n";

my $admin = Bugzilla::User->check({name => $admin_login});
$admin->in_group('admin') or die "$admin_login is not a Bugzilla admin\n";
Bugzilla->set_user($admin);

my $state = do { local $/; open my $fh, '<', $STATE or die "Cannot read $STATE: $!\n"; decode_json(<$fh>) };
my %live_login_of_mantis = %{$state->{users}};      # mantis userid -> live login
my %product_of_mantis    = %{$state->{products}};   # mantis product id -> live product name

my $dbh = Bugzilla->dbh;

# ---- who is a developer (not tester, not admin, not service)
my %role_member;
for my $g (qw(canconfirm editusers editcomponents)) {
  my $ids = $dbh->selectcol_arrayref(
    'SELECT m.user_id FROM user_group_map m JOIN groups g ON g.id = m.group_id WHERE g.name = ? AND m.isbless = 0', undef, $g);
  $role_member{$_} = 1 for @$ids;
}
my %login_of = @{$dbh->selectcol_arrayref('SELECT userid, login_name FROM profiles', {Columns => [1, 2]})};
my %id_of    = map { lc($login_of{$_}) => $_ } keys %login_of;

# ---- evidence 1: assigned in Mantis (read-only connection to bugs_mantis)
my $src = DBI->connect('DBI:MariaDB:database=bugs_mantis;host=127.0.0.1;port=3307', 'bugs_mantis', 'Bugzilla@2026',
  {RaiseError => 1, ReadOnly => 1});
my %worked;   # "product\0userid" -> reason
for my $r (@{$src->selectall_arrayref('SELECT product_id, assigned_to, COUNT(*) FROM bugs GROUP BY 1, 2')}) {
  my ($mp, $mu, $n) = @$r;
  my $product = $product_of_mantis{$mp} or next;
  my $login   = $live_login_of_mantis{$mu} or next;
  my $uid     = $id_of{lc $login} or next;
  $worked{"$product\0$uid"} = "assigned $n in Mantis";
}
$src->disconnect;

# ---- evidence 2: assigned in live Bugzilla; evidence 3: component owner / QA contact
for my $r (@{$dbh->selectall_arrayref(
  'SELECT p.name, b.assigned_to, COUNT(*) FROM bugs b JOIN products p ON p.id = b.product_id GROUP BY 1, 2')}) {
  my ($product, $uid, $n) = @$r;
  $worked{"$product\0$uid"} //= "assigned $n in Bugzilla";
}
for my $r (@{$dbh->selectall_arrayref(
  'SELECT p.name, c.initialowner, c.initialqacontact, c.name FROM components c JOIN products p ON p.id = c.product_id')}) {
  my ($product, $owner, $qa, $comp) = @$r;
  $worked{"$product\0$owner"} = "owns component '$comp'";
  $worked{"$product\0$qa"}  //= "QA contact of '$comp'" if $qa;
}

# ---- plan
my (%remove, @lines, $n_keep, $n_remove);
my %products = map { $_ => 1 } values %product_of_mantis;
for my $product (sort { lc $a cmp lc $b } keys %products) {
  my $group = Bugzilla::Group->new({name => $product});
  unless ($group) { push @lines, "", "== $product: no same-named group - skipped"; next; }
  my $members = $dbh->selectcol_arrayref(
    'SELECT user_id FROM user_group_map WHERE group_id = ? AND isbless = 0 AND grant_type = ?', undef, $group->id, GRANT_DIRECT);
  my @devs = grep { !$role_member{$_} && !$SERVICE{lc($login_of{$_} // '')} } @$members;
  my @keep = grep { $worked{"$product\0$_"} } @devs;
  my @drop = grep { !$worked{"$product\0$_"} } @devs;
  $n_keep += @keep; $n_remove += @drop;
  push @{$remove{$_}}, $group->name for @drop;

  push @lines, "", sprintf('== %s   (developers now %d -> keep %d, remove %d)', $product, scalar @devs, scalar @keep, scalar @drop);
  push @lines, map { sprintf('   KEEP    %-40s %s', $login_of{$_}, $worked{"$product\0$_"}) } sort { $login_of{$a} cmp $login_of{$b} } @keep;
  push @lines, map { sprintf('   REMOVE  %s', $login_of{$_}) } sort { $login_of{$a} cmp $login_of{$b} } @drop;
}

open my $out, '>:encoding(UTF-8)', $report or die "Cannot write $report: $!\n";
say $out ($execute ? 'MODE EXECUTE' : 'MODE DRY RUN - nothing written');
say $out "Developers kept $n_keep, product grants removed $n_remove, accounts affected " . scalar(keys %remove);
say $out "Testers/admins/service accounts are not listed - they keep every product.";
say $out $_ for @lines;
close $out;

say $execute ? "MODE    EXECUTE" : "MODE    DRY RUN - nothing is written (add --execute)";
say "PLAN    keep $n_keep developer grants, remove $n_remove, across " . scalar(keys %remove) . " accounts";
say "REPORT  $report";
unless ($execute) { say "DRY RUN complete - nothing changed."; exit 0; }

$dbh->bz_start_transaction();
my $ok = eval {
  for my $uid (sort { $a <=> $b } keys %remove) {
    my $user = Bugzilla::User->new($uid);
    $user->set_groups({remove => $remove{$uid}});
    $user->update();
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
say "DONE    removed $n_remove product grants from " . scalar(keys %remove) . " accounts";
