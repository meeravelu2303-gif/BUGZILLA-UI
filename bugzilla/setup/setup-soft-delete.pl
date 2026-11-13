#!/usr/bin/perl -T
# One-time (idempotent) Bugzilla configuration for the UI's soft delete.
#
#   cd C:\Bugzilla
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\bugzilla\setup-soft-delete.pl admin@example.com
#
# Bugzilla has no delete API, so "delete" in the UI is:
#   * status RESOLVED + resolution DELETED   - closed, with the reason in a comment
#   * the bug added to the "Deleted bugs" group - a bug in several groups is
#     visible only to people in ALL of them, so it disappears for everyone
#     outside that group while staying fully intact and restorable.
#
# This script creates what that needs, through Bugzilla's own objects:
#   1. the DELETED resolution
#   2. the "Deleted bugs" bug group
#   3. membership: everyone in `canconfirm` (testers + admins) is a member, by
#      group inheritance - the same row editgroups.cgi writes - so new testers
#      are covered without anyone remembering to add them
#   4. a group control on every product (members: Shown, others: N/A), without
#      which Bugzilla refuses to put a bug in the group
#
# Re-run after creating a product: step 4 only adds what is missing.

use 5.14.0;
use strict;
use warnings;

use lib qw(. lib local/lib/perl5);

use Bugzilla;
use Bugzilla::Constants;
use Bugzilla::Field::Choice;
use Bugzilla::Group;
use Bugzilla::Product;
use Bugzilla::User;

use constant RESOLUTION => 'DELETED';
use constant GROUP_NAME => 'Deleted bugs';
use constant MEMBER_OF  => 'canconfirm';

Bugzilla->usage_mode(USAGE_MODE_CMDLINE);

my ($login) = @ARGV;
die "Usage: perl -T setup-soft-delete.pl <admin login>\n" unless $login;
($login) = $login =~ /^([^\s]+)$/ or die "Bad login\n";

my $admin = Bugzilla::User->check({name => $login});
$admin->in_group('admin') or die "$login is not a Bugzilla admin\n";
Bugzilla->set_user($admin);

my $dbh = Bugzilla->dbh;
$dbh->bz_start_transaction();

# 1. Resolution
my $resolution = Bugzilla::Field::Choice->type('resolution')->new({name => RESOLUTION});
if ($resolution) {
  say "ok      resolution " . RESOLUTION . " already exists";
}
else {
  Bugzilla::Field::Choice->type('resolution')->create({value => RESOLUTION, sortkey => 1000, isactive => 1});
  say "created resolution " . RESOLUTION;
}

# 2. Group
my $group = Bugzilla::Group->new({name => GROUP_NAME});
if ($group) {
  say "ok      group '" . GROUP_NAME . "' already exists";
}
else {
  $group = Bugzilla::Group->create({
    name        => GROUP_NAME,
    description => 'Soft-deleted bugs. Visible only to testers and admins, who can restore them.',
    isbuggroup  => 1,
    isactive    => 1,
  });
  say "created group '" . GROUP_NAME . "'";
}

# 3. canconfirm members inherit membership
my $parent = Bugzilla::Group->new({name => MEMBER_OF}) or die MEMBER_OF . " group not found\n";
my ($inherits) = $dbh->selectrow_array(
  'SELECT 1 FROM group_group_map WHERE member_id = ? AND grantor_id = ? AND grant_type = ?',
  undef, $parent->id, $group->id, GROUP_MEMBERSHIP
);
if ($inherits) {
  say "ok      members of " . MEMBER_OF . " are already members";
}
else {
  $dbh->do('INSERT INTO group_group_map (member_id, grantor_id, grant_type) VALUES (?, ?, ?)',
    undef, $parent->id, $group->id, GROUP_MEMBERSHIP);
  say "granted members of " . MEMBER_OF . " membership of '" . GROUP_NAME . "'";
}

# 4. Product group controls
foreach my $product (Bugzilla::Product->get_all) {
  my $current = $product->group_controls->{$group->id};
  if ($current && $current->{membercontrol} == CONTROLMAPSHOWN && $current->{othercontrol} == CONTROLMAPNA) {
    say "ok      " . $product->name;
    next;
  }
  $product->set_group_controls($group, {
    membercontrol => CONTROLMAPSHOWN,
    othercontrol  => CONTROLMAPNA,
    entry         => 0,
    canedit       => 0,
    editcomponents => 0,
    editbugs      => 0,
    canconfirm    => 0,
  });
  $product->update();
  say "enabled " . $product->name;
}

$dbh->bz_commit_transaction();
say "done.";
