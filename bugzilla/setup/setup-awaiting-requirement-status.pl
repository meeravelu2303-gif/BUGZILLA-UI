#!/usr/bin/perl -T
# One-time (idempotent) Bugzilla configuration: the AWAITING_REQUIREMENT status.
#
#   cd C:\Bugzilla
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\bugzilla\setup-awaiting-requirement-status.pl <admin login>
#
# The behaviour the tester filed is not covered by any requirement yet. The
# requirement has to be RAISED first (by the project manager / analyst); only
# then can the bug be worked. Until then it is AWAITING_REQUIREMENT: open, but
# blocked on a document, not on a developer.
#
# Different from PENDING_APPROVAL, which waits for a yes/no DECISION. A bug
# often goes PENDING_APPROVAL -> (approved, but needs a spec) -> AWAITING_REQUIREMENT.
#
# Creates, through Bugzilla's own objects and the rows editworkflow.cgi writes:
#   1. the AWAITING_REQUIREMENT status (open, sorted after PENDING_APPROVAL, before IN_PROGRESS)
#   2. its workflow:
#        UNCONFIRMED, CONFIRMED, PENDING_APPROVAL, IN_PROGRESS, REOPENED -> AWAITING_REQUIREMENT
#            comment required: which requirement is missing, who will raise it
#        AWAITING_REQUIREMENT -> CONFIRMED, IN_PROGRESS   (requirement raised - give its ID / link)
#        AWAITING_REQUIREMENT -> RESOLVED                 (dropped - WONTFIX / INVALID)
#            comment required on every move out
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

use constant STATUS => 'AWAITING_REQUIREMENT';
use constant INTO   => qw(UNCONFIRMED CONFIRMED PENDING_APPROVAL IN_PROGRESS REOPENED);
use constant OUT_TO => qw(CONFIRMED IN_PROGRESS RESOLVED);

Bugzilla->usage_mode(USAGE_MODE_CMDLINE);

my ($login) = @ARGV;
die "Usage: perl -T setup-awaiting-requirement-status.pl <admin login>\n" unless $login;
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
  $status = Bugzilla::Status->create({value => STATUS, sortkey => 270, is_open => 1, isactive => 1});
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
