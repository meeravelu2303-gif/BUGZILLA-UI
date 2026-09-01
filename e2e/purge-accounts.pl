#!/usr/bin/perl
# Removes the E2E robot accounts again, so the user list holds only people.
#
#   perl purge-accounts.pl                (run from C:\Bugzilla)
#
# Bugzilla has allowuserdeletion=0 and no User->remove_from_db, so the rows are
# deleted directly. That is only safe because these accounts never author
# anything: the suite reads bugs and reassigns them, it does not file them.
# The guard below refuses if that ever stops being true - deleting an account
# that HAD authored something would orphan the history it left behind.
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

my @LOGINS = ('qa-e2e@kpost.local', 'qa-e2e-lockout@kpost.local');

# Every table that references profiles.userid and could hold a row for an
# account that has never touched a bug.
my @CHILD_TABLES = (
  ['user_group_map',              'user_id'],
  ['email_setting',               'user_id'],
  ['profile_setting',             'user_id'],
  ['profile_search',              'user_id'],
  ['namedqueries_link_in_footer', 'user_id'],
  ['namedqueries',                'userid'],
  ['logincookies',                'userid'],
  ['login_failure',               'user_id'],
  ['tokens',                      'userid'],
  ['user_api_keys',               'user_id'],
  ['bug_user_last_visit',         'user_id'],
  ['email_bug_ignore',            'user_id'],
  ['component_cc',                'user_id'],
  ['cc',                          'who'],
  ['tag',                         'user_id'],
  ['reports',                     'user_id'],
  ['series',                      'creator'],
  ['quips',                       'userid'],
  ['whine_events',                'owner_userid'],
  ['audit_log',                   'user_id'],
);

my $dbh = Bugzilla->dbh;
$dbh->bz_start_transaction();

for my $login (@LOGINS) {
  my $user = Bugzilla::User->new({name => $login});
  if (!$user) { print "not found: $login\n"; next; }
  my $id = $user->id;

  my ($authored) = $dbh->selectrow_array(
    'SELECT (SELECT COUNT(*) FROM bugs WHERE reporter=? OR assigned_to=?)
          + (SELECT COUNT(*) FROM longdescs WHERE who=?)
          + (SELECT COUNT(*) FROM attachments WHERE submitter_id=?)',
    undef, $id, $id, $id, $id
  );
  if ($authored) {
    $dbh->bz_rollback_transaction();
    die "REFUSING: $login has authored $authored record(s). Disable it instead of deleting.\n";
  }

  $dbh->do("DELETE FROM $_->[0] WHERE $_->[1] = ?", undef, $id) for @CHILD_TABLES;
  $dbh->do('DELETE FROM watch WHERE watcher = ? OR watched = ?', undef, $id, $id);
  $dbh->do('DELETE FROM profiles_activity WHERE who = ? OR userid = ?', undef, $id, $id);
  $dbh->do('DELETE FROM profiles WHERE userid = ?', undef, $id);
  print "removed: $login\n";
}

$dbh->bz_commit_transaction();
print "DONE\n";
