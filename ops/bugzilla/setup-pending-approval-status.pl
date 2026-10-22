#!/usr/bin/perl -T
# One-time (idempotent) Bugzilla configuration: the PENDING_APPROVAL status.
#
#   cd C:\Bugzilla
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\bugzilla\setup-pending-approval-status.pl <admin login>
#
# A tester files a bug; the developer says it is not in the requirements, so the
# project manager has to decide whether it is wanted. Until then the bug is
# PENDING_APPROVAL: still open, but nobody should work on it yet.
#
# Creates, through Bugzilla's own objects and the rows editworkflow.cgi writes:
#   1. the PENDING_APPROVAL status (open, sorted between CONFIRMED and IN_PROGRESS)
#   2. its workflow:
#        UNCONFIRMED, CONFIRMED, IN_PROGRESS, REOPENED -> PENDING_APPROVAL
#            comment required: why it needs approval (e.g. "not in the requirements")
#        PENDING_APPROVAL -> CONFIRMED, IN_PROGRESS    (approved)
#        PENDING_APPROVAL -> RESOLVED                  (rejected - WONTFIX / INVALID)
#            comment required: the project manager's decision
#
# Re-running only adds what is missing.

use 5.14.0;
use strict;
use warnings;

use lib qw(. lib local/lib/perl5);

use Bugzilla;
use Bugzilla::Constants;
use Bugzilla::Status;
use Bugzilla::User;

use constant STATUS => 'PENDING_APPROVAL';
use constant INTO   => qw(UNCONFIRMED CONFIRMED IN_PROGRESS REOPENED);
use constant OUT_TO => qw(CONFIRMED IN_PROGRESS RESOLVED);

Bugzilla->usage_mode(USAGE_MODE_CMDLINE);

my ($login) = @ARGV;
die "Usage: perl -T setup-pending-approval-status.pl <admin login>\n" unless $login;
($login) = $login =~ /^([^\s]+)$/ or die "Bad login\n";
my $admin = Bugzilla::User->check({name => $login});
$admin->in_group('admin') or die "$login is not a Bugzilla admin\n";
Bugzilla->set_user($admin);

my $dbh = Bugzilla->dbh;
$dbh->bz_start_transaction();

my $status = Bugzilla::Status->new({name => STATUS});
if ($status) {
  say "ok      status " . STATUS . " already exists";
}
else {
  $status = Bugzilla::Status->create({value => STATUS, sortkey => 250, is_open => 1, isactive => 1});
  say "created status " . STATUS;
}

sub transition {
  my ($from_name, $to_name, $require_comment) = @_;
  my $from = Bugzilla::Status->new({name => $from_name}) or die "No status $from_name\n";
  my $to   = Bugzilla::Status->new({name => $to_name})   or die "No status $to_name\n";
  my ($exists) = $dbh->selectrow_array(
    'SELECT 1 FROM status_workflow WHERE old_status = ? AND new_status = ?', undef, $from->id, $to->id);
  if ($exists) {
    # Bugzilla adds the move to RESOLVED itself when a status is created, without a comment rule.
    $dbh->do('UPDATE status_workflow SET require_comment = 1 WHERE old_status = ? AND new_status = ? AND require_comment = 0',
      undef, $from->id, $to->id) if $require_comment;
    say "ok      $from_name -> $to_name";
    return;
  }
  $dbh->do('INSERT INTO status_workflow (old_status, new_status, require_comment) VALUES (?, ?, ?)',
    undef, $from->id, $to->id, $require_comment ? 1 : 0);
  say "added   $from_name -> $to_name" . ($require_comment ? ' (comment required)' : '');
}

transition($_, STATUS, 1) for (INTO);
transition(STATUS, $_, 1) for (OUT_TO);

$dbh->bz_commit_transaction();
Bugzilla->memcached->clear_all() if Bugzilla->can('memcached');
say "done.";
