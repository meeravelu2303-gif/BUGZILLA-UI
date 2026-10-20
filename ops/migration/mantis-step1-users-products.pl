#!/usr/bin/perl -T
# Mantis -> Bugzilla migration, STEP 1: users and products (no bugs).
#
#   cd C:\Bugzilla
#   set MANTIS_DB_PASSWORD=<password of the bugs_mantis MariaDB user>
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\migration\mantis-step1-users-products.pl <admin login>            (dry run)
#   perl -T ...\mantis-step1-users-products.pl <admin login> --execute                                                  (writes)
#
# Source: database `bugs_mantis` (the converted Mantis preview, already in Bugzilla
# schema). Target: the live Bugzilla this script runs in.
#
# What it does
#   USERS     The 17 people who already have a Bugzilla account are MAPPED, never
#             re-created (their Mantis and Bugzilla emails differ - see %MAP).
#             Everyone else is created with sign-in DISABLED and no mail, so their
#             names stay on bugs and history but nobody can log in as them.
#   PRODUCTS  Every Mantis product that has bugs, with its components, version
#             "unspecified" and milestone "---". Each gets the live format:
#               - a same-named access group, Entry + Mandatory/Mandatory
#                 (exactly like KPost API / KPost UI);
#               - the "Deleted bugs" control, Shown/NA, so soft delete works.
#             Component descriptions in the source are the placeholder "seed" and
#             every component is owned by the placeholder admin@example.com, so the
#             default assignee is the person most often ASSIGNED bugs in that
#             component in Mantis (an active account where possible).
#   ACCESS    Testers and admins (canconfirm / editusers / editcomponents / admin)
#             get every new product group. Everyone else gets the groups of the
#             products they reported, were assigned, or commented on in Mantis.
#
# Safe to re-run: every user, product, group, component and membership is looked
# up first and only created when missing. Dry run changes nothing.
# Writes a state file mapping Mantis ids to live accounts/products, for step 2.

use 5.14.0;
use strict;
use warnings;

use lib qw(. lib local/lib/perl5);

use DBI;
use Getopt::Long qw(GetOptions);
use JSON::XS;
use File::Path qw(make_path);

use Bugzilla;
use Bugzilla::Constants;
use Bugzilla::Component;
use Bugzilla::Group;
use Bugzilla::Product;
use Bugzilla::User;
use Bugzilla::Util qw(generate_random_password);

# Same person, different email: Mantis login (lower-case) => live Bugzilla login.
# Confirmed by the project owner on 2026-10-20.
my %MAP = (
  'sohailahmedksa95@gmail.com'     => 'sohail2795@kpostindia.com',
  'karkuvelrajan6@gmail.com'       => 'rajan@kpost.in',
  'vp22081998@gmail.com'           => 'prakash@kpost.in',
  'baskarnov@gmail.com'            => 'baskar1992@kpost.in',
  'karthikalai1991@gmail.com'      => 'karthikalai91@kpost.in',
  'lakshmiganthan@mantis.invalid'  => 'lakshmiganthan027@kpost.in',
  'mothismart@gmail.com'           => 'mothilal@kpost.in',
  'jmkmani55@gmail.com'            => 'jmkmani55@kpostindia.com',
  'ajith.kumar@mantis.invalid'     => 'ajithkumar16@kpost.in',
  'ayyappan1072@gmail.com'         => 'ayyappan@kpostindia.com',
  'karan341997.1@gmail.com'        => 'karans@kpost.in',
  'jaganathamurthy31@gmail.com'    => 'jagan@kpost.in',
  'jksrivatsa@gmail.com'           => 'jitendra@kpost.in',
  'kiruba@mantis.invalid'          => 'kiruba18@kpost.in',
  'priya.dharshini@mantis.invalid' => 'priya@kpost.in',
  'meera@mantis.invalid'           => 'meeravelu2303@gmail.com',
  'srirampeter45@gmail.com'        => 'sriram@kpost.in',
);

# Never imported: a staging test account, plus 11 accounts with no activity
# anywhere (no bugs, comments, attachments or history in Mantis or Bugzilla),
# deleted from the live Bugzilla on 2026-10-20 at the owner's request. Listed so
# a re-run does not create them again. They remain in bugs_mantis untouched.
my %EXCLUDE_USER = map { $_ => 1 } (
  'qa-staging-admin@kpost.local',
  'kpostredhat2022@gmail.com',       'chandranmc1999@gmail.com',  'divyakannaiya18@gmail.com',
  'jfchammany@gmail.com',            'nagappan@mantis.invalid',   'narmadha@mantis.invalid',
  'prithivi.kpost@gmail.com',        'nandysankaran@gmail.com',   'angulardev@mantis.invalid',
  'shaliniveeramani@kpostindia.com', 'sitarama@kpostindia.com',
);

# Mantis placeholders, kept (disabled) so later steps can attribute history to them,
# with names that say what they are.
my %PLACEHOLDER_NAME = (
  'admin@example.com'             => 'Mantis admin (placeholder)',
  'mantis-unknown@mantis.invalid' => 'Unknown (deleted Mantis user)',
);

# Test rows that must not count towards anything.
my %EXCLUDE_BUG = (13201 => 1);

my $FALLBACK_OWNER = 'meeravelu2303@gmail.com';
my $DISABLED_TEXT  = 'Historical account imported from Mantis - sign-in disabled. '
  . 'An administrator can enable it from Administration > Users.';

Bugzilla->usage_mode(USAGE_MODE_CMDLINE);

my ($execute, $state_file, $db_host, $db_port, $db_name, $db_user) =
  (0, 'D:/TEST-BENCH-AUTOMATIONS/_backups/mantis-migration/step1-state.json', '127.0.0.1', 3307, 'bugs_mantis', 'bugs_mantis');
GetOptions(
  'execute'   => \$execute,
  'state=s'   => \$state_file,
  'db-host=s' => \$db_host,
  'db-port=i' => \$db_port,
  'db-name=s' => \$db_name,
  'db-user=s' => \$db_user,
) or die "Bad arguments\n";

my ($admin_login) = @ARGV;
die "Usage: perl -T mantis-step1-users-products.pl <admin login> [--execute]\n" unless $admin_login;
($admin_login) = $admin_login =~ /^(\S+)$/ or die "Bad login\n";
my ($db_pass) = ($ENV{MANTIS_DB_PASSWORD} // '') =~ /^(.*)$/s;
die "Set MANTIS_DB_PASSWORD to the bugs_mantis MariaDB password\n" if $db_pass eq '';
($state_file) = $state_file =~ /^([\w:\\\/. -]+)$/ or die "Bad --state path\n";
($db_host)    = $db_host    =~ /^([\w.-]+)$/       or die "Bad --db-host\n";
($db_name)    = $db_name    =~ /^(\w+)$/           or die "Bad --db-name\n";
($db_user)    = $db_user    =~ /^(\w+)$/           or die "Bad --db-user\n";

my $admin = Bugzilla::User->check({name => $admin_login});
$admin->in_group('admin') or die "$admin_login is not a Bugzilla admin\n";
Bugzilla->set_user($admin);

my $src = DBI->connect("dbi:MariaDB:database=$db_name;host=$db_host;port=$db_port", $db_user, $db_pass,
  {RaiseError => 1, PrintError => 0, AutoCommit => 1})
  or die "Cannot connect to $db_name\n";

my $dbh = Bugzilla->dbh;
say $execute ? "MODE    EXECUTE - changes will be written" : "MODE    DRY RUN - nothing is written (add --execute)";
say "";

# ------------------------------------------------------------------- source
my $profiles = $src->selectall_arrayref('SELECT userid, login_name, realname FROM profiles ORDER BY userid', {Slice => {}});
my %src_user = map { $_->{userid} => $_ } @$profiles;

my $excluded_bug_sql = join(',', keys %EXCLUDE_BUG) || '0';
my $products = $src->selectall_arrayref(
  "SELECT p.id, p.name, (SELECT COUNT(*) FROM bugs b WHERE b.product_id = p.id AND b.bug_id NOT IN ($excluded_bug_sql)) AS bugs
     FROM products p ORDER BY p.name", {Slice => {}});
my @products = grep { $_->{bugs} > 0 } @$products;
my @skipped_products = grep { $_->{bugs} == 0 } @$products;

# Live testers/admins: direct members of the role groups.
my $role_members = $dbh->selectcol_arrayref(
  "SELECT DISTINCT p.login_name FROM user_group_map m
     JOIN profiles p ON p.userid = m.user_id JOIN groups g ON g.id = m.group_id
    WHERE m.isbless = 0 AND m.grant_type = ? AND g.name IN ('canconfirm','editusers','editcomponents','admin')",
  undef, GRANT_DIRECT);
my %is_tester_or_admin = map { lc($_) => 1 } @$role_members;

# ------------------------------------------------------------------- users
say "== USERS ==";
my (%live_login_for, @create_users, @reuse_users);    # keyed by Mantis userid
for my $u (@$profiles) {
  my $login = lc $u->{login_name};
  next if $EXCLUDE_USER{$login};
  if (my $mapped = $MAP{$login}) {
    my $live = Bugzilla::User->new({name => $mapped}) or die "Mapped account $mapped does not exist in Bugzilla\n";
    $live_login_for{$u->{userid}} = $live->login;
    push @reuse_users, sprintf('%-34s -> %s', $u->{login_name}, $live->login);
    next;
  }
  my $existing = Bugzilla::User->new({name => $u->{login_name}});
  $live_login_for{$u->{userid}} = $u->{login_name};
  if ($existing) {
    push @reuse_users, sprintf('%-34s (already in Bugzilla)', $u->{login_name});
  }
  else {
    push @create_users, {login => $u->{login_name}, name => $PLACEHOLDER_NAME{$login} // ($u->{realname} || $u->{login_name})};
  }
}
say "  mapped / reused: " . scalar(@reuse_users);
say "    $_" for @reuse_users;
say "  create (sign-in disabled): " . scalar(@create_users);
say sprintf('    %-36s %s', $_->{login}, $_->{name}) for @create_users;
say "  excluded: " . join(', ', sort keys %EXCLUDE_USER);
say "";

# ------------------------------------------------------- component owners
# The person most often assigned bugs in the component, preferring an ENABLED
# live account; then the same over the whole product; then the fallback admin.
my $enabled_login = sub {
  my ($mantis_userid) = @_;
  my $login = $live_login_for{$mantis_userid} or return undef;
  return undef if $PLACEHOLDER_NAME{lc $src_user{$mantis_userid}{login_name}};
  # Mapped people are the active ones; created accounts are disabled.
  return $MAP{lc $src_user{$mantis_userid}{login_name}} ? $login : undef;
};
my $pick_owner = sub {
  my ($sql, @bind) = @_;
  my $rows = $src->selectall_arrayref($sql, undef, @bind);
  for my $r (@$rows) { my $l = $enabled_login->($r->[0]); return $l if $l; }
  return undef;
};

# ---------------------------------------------------------------- products
say "== PRODUCTS (" . scalar(@products) . " with bugs; " . scalar(@skipped_products) . " empty skipped) ==";
my @plan;
for my $p (@products) {
  my $components = $src->selectall_arrayref('SELECT id, name FROM components WHERE product_id = ? ORDER BY name', {Slice => {}}, $p->{id});
  my $product_owner = $pick_owner->(
    "SELECT assigned_to, COUNT(*) n FROM bugs WHERE product_id = ? AND bug_id NOT IN ($excluded_bug_sql) GROUP BY assigned_to ORDER BY n DESC", $p->{id});
  my @comps;
  for my $c (@$components) {
    my $owner = $pick_owner->(
      "SELECT assigned_to, COUNT(*) n FROM bugs WHERE component_id = ? AND bug_id NOT IN ($excluded_bug_sql) GROUP BY assigned_to ORDER BY n DESC", $c->{id})
      // $product_owner // $FALLBACK_OWNER;
    push @comps, {mantis_id => $c->{id}, name => $c->{name}, owner => $owner};
  }
  my $exists = Bugzilla::Product->new({name => $p->{name}}) ? ' (exists - will be completed, not duplicated)' : '';
  say sprintf('  %-44s %5d bugs  %2d components%s', $p->{name}, $p->{bugs}, scalar(@comps), $exists);
  say sprintf('      - %-28s owner %s', $_->{name}, $_->{owner}) for @comps;
  push @plan, {mantis_id => $p->{id}, name => $p->{name}, bugs => $p->{bugs}, components => \@comps};
}
say "  skipped (no bugs): " . join(', ', map { $_->{name} } @skipped_products) if @skipped_products;
say "";

# ------------------------------------------------------------- memberships
# Product groups each Mantis user gets from involvement (reported / assigned / commented).
my %involved;    # mantis userid => { product name => 1 }
for my $row (@{$src->selectall_arrayref(
  "SELECT DISTINCT x.who, p.name FROM (
       SELECT reporter AS who, product_id FROM bugs WHERE bug_id NOT IN ($excluded_bug_sql)
     UNION SELECT assigned_to, product_id FROM bugs WHERE bug_id NOT IN ($excluded_bug_sql)
     UNION SELECT l.who, b.product_id FROM longdescs l JOIN bugs b ON b.bug_id = l.bug_id WHERE b.bug_id NOT IN ($excluded_bug_sql)
   ) x JOIN products p ON p.id = x.product_id")})
{
  $involved{$row->[0]}{$row->[1]} = 1;
}
my %grants;    # live login => { group name => 1 }
my @product_names = map { $_->{name} } @plan;
for my $login (keys %is_tester_or_admin) { $grants{$login}{$_} = 1 for @product_names; }
for my $mid (keys %live_login_for) {
  my $login = lc $live_login_for{$mid};
  next if $is_tester_or_admin{$login};
  next if $PLACEHOLDER_NAME{lc $src_user{$mid}{login_name}};
  $grants{$login}{$_} = 1 for grep { my $n = $_; grep { $_ eq $n } @product_names } keys %{$involved{$mid} // {}};
}
say "== ACCESS ==";
my $total_grants = 0;
for my $login (sort keys %grants) {
  my $n = scalar keys %{$grants{$login}};
  next unless $n;
  $total_grants += $n;
  my $who = $is_tester_or_admin{$login} ? 'tester/admin - every new product' : 'by Mantis involvement';
  say sprintf('  %-34s %2d product groups  (%s)', $login, $n, $who);
}
say "  total memberships: $total_grants";
say "";

unless ($execute) {
  say "DRY RUN complete - nothing changed. Re-run with --execute to apply.";
  exit 0;
}

# ================================================================ EXECUTE
# Bugzilla's error handler can end the process without printing anything useful
# in command-line mode, so every failure is caught, reported in full, and rolled
# back explicitly - the database is either fully migrated or exactly as it was.
Bugzilla->error_mode(ERROR_MODE_DIE);
$dbh->bz_start_transaction();

my ($n_users, $n_products, $n_components, $n_groups, $n_members) = (0) x 5;
my $step = 'starting';
my $ok = eval {

for my $u (@create_users) {
  $step = "creating user $u->{login}";
  next if Bugzilla::User->new({name => $u->{login}});
  my $user = Bugzilla::User->create({
    login_name    => $u->{login},
    realname      => $u->{name},
    cryptpassword => generate_random_password(48),
    disabledtext  => $DISABLED_TEXT,
    disable_mail  => 1,
  });
  $n_users++;
}

my $deleted_group = Bugzilla::Group->new({name => 'Deleted bugs'});
for my $p (@plan) {
  $step = "creating product $p->{name}";
  my $product = Bugzilla::Product->new({name => $p->{name}});
  unless ($product) {
    $product = Bugzilla::Product->create({
      name               => $p->{name},
      description        => "$p->{name} - imported from Mantis.",
      version            => 'unspecified',
      defaultmilestone   => '---',
      allows_unconfirmed => 1,
      isactive           => 1,
      create_series      => 0,
    });
    $n_products++;
  }

  # Components BEFORE the product is locked to its group: Bugzilla hides a product
  # from anyone outside its mandatory entry group, and the admin running this is
  # only added to the new groups at the end - so a locked product would refuse
  # its own components ("does not exist or you don't have access").
  for my $c (@{$p->{components}}) {
    $step = "creating component $p->{name} / $c->{name} (owner $c->{owner})";
    next if Bugzilla::Component->new({product => $product, name => $c->{name}});
    Bugzilla::Component->create({
      product      => $product,
      name         => $c->{name},
      description  => "$c->{name} - imported from Mantis.",
      initialowner => $c->{owner},
      isactive     => 1,
    });
    $n_components++;
  }

  $step = "creating group $p->{name}";
  my $group = Bugzilla::Group->new({name => $p->{name}});
  unless ($group) {
    $group = Bugzilla::Group->create({
      name        => $p->{name},
      description => "Access scope for the $p->{name} product (imported from Mantis).",
      isbuggroup  => 1,
      userregexp  => '',
      isactive    => 1,
    });
    $n_groups++;
  }
  $step = "setting group controls on $p->{name}";
  # The live format: the product's own group is required to file and set on every bug.
  $product->set_group_controls($group, {
    entry => 1, membercontrol => CONTROLMAPMANDATORY, othercontrol => CONTROLMAPMANDATORY,
    canedit => 0, editcomponents => 0, editbugs => 0, canconfirm => 0,
  });
  # Soft delete: testers/admins may put a bug in "Deleted bugs"; nobody else.
  $product->set_group_controls($deleted_group, {
    entry => 0, membercontrol => CONTROLMAPSHOWN, othercontrol => CONTROLMAPNA,
    canedit => 0, editcomponents => 0, editbugs => 0, canconfirm => 0,
  }) if $deleted_group;
  $product->update();

}

for my $login (sort keys %grants) {
  $step = "granting product groups to $login";
  my @want = sort keys %{$grants{$login}};
  next unless @want;
  my $user = Bugzilla::User->new({name => $login}) or next;
  my %have = map { lc($_) => 1 } @{$dbh->selectcol_arrayref(
    'SELECT g.name FROM user_group_map m JOIN groups g ON g.id = m.group_id WHERE m.user_id = ? AND m.isbless = 0 AND m.grant_type = ?',
    undef, $user->id, GRANT_DIRECT)};
  my @add = grep { !$have{lc $_} } @want;
  next unless @add;
  $user->set_groups({add => \@add});
  $user->update();
  $n_members += @add;
}

  1;
};
unless ($ok) {
  my $err = $@;
  $err = $err->message if ref $err && eval { $err->can('message') };
  $dbh->bz_rollback_transaction();
  print STDERR "
FAILED while $step:
  $err
";
  print STDERR "Rolled back - nothing was written.
";
  exit 1;
}
$dbh->bz_commit_transaction();

# State for step 2 (bugs): Mantis ids -> live accounts / products / components.
my %state = (
  created_at => scalar(localtime),
  users      => {map { $_ => $live_login_for{$_} } keys %live_login_for},
  products   => {map { $_->{mantis_id} => $_->{name} } @plan},
  components => {map { my $p = $_; map { $_->{mantis_id} => {product => $p->{name}, component => $_->{name}} } @{$p->{components}} } @plan},
  excluded_bugs => [sort { $a <=> $b } keys %EXCLUDE_BUG],
);
my ($dir) = $state_file =~ m{^(.*)[\\/]};
make_path($dir) if $dir && !-d $dir;
open my $fh, '>', $state_file or die "Cannot write $state_file: $!\n";
print $fh JSON::XS->new->canonical->pretty->encode(\%state);
close $fh;

say "DONE    users created $n_users, products $n_products, groups $n_groups, components $n_components, memberships $n_members";
say "        state written to $state_file";
say "NEXT    re-run ops/bugzilla/setup-transfer-account.pl so the transfer account gets the new product groups.";
