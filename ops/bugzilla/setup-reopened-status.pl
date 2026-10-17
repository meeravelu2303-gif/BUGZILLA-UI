#!/usr/bin/perl -T
# One-time (idempotent) Bugzilla configuration: the REOPENED status.
#
#   cd C:\Bugzilla
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\bugzilla\setup-reopened-status.pl admin@example.com
#
# A developer marks a bug RESOLVED, the tester re-tests and it is still broken.
# Moving it back to CONFIRMED loses that story; REOPENED keeps it visible as its
# own state, so the dashboard can count bugs that came back.
#
# Creates, through Bugzilla's own objects:
#   1. the REOPENED status (open, sorted between IN_PROGRESS and RESOLVED)
#   2. its workflow - the same rows editworkflow.cgi writes:
#        RESOLVED, VERIFIED -> REOPENED   (a comment is required: why is it still broken?)
#        REOPENED -> CONFIRMED, IN_PROGRESS, RESOLVED
#
# The UI additionally limits reopening to testers and admins. Re-running only adds what is missing.

use 5.14.0;
use strict;
use warnings;

use lib qw(. lib local/lib/perl5);

use Bugzilla;
use Bugzilla::Constants;
use Bugzilla::Status;
use Bugzilla::User;

use constant STATUS => 'REOPENED';
use constant INTO   => qw(RESOLVED VERIFIED);
use constant OUT_TO => qw(CONFIRMED IN_PROGRESS RESOLVED);

Bugzilla->usage_mode(USAGE_MODE_CMDLINE);

my ($login) = @ARGV;
die "Usage: perl -T setup-reopened-status.pl <admin login>\n" unless $login;
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
  $status = Bugzilla::Status->create({value => STATUS, sortkey => 350, is_open => 1, isactive => 1});
  say "created status " . STATUS;
}

sub transition {
  my ($from_name, $to_name, $require_comment) = @_;
  my $from = Bugzilla::Status->new({name => $from_name}) or die "No status $from_name\n";
  my $to   = Bugzilla::Status->new({name => $to_name})   or die "No status $to_name\n";
  my ($exists) = $dbh->selectrow_array(
    'SELECT 1 FROM status_workflow WHERE old_status = ? AND new_status = ?', undef, $from->id, $to->id);
  if ($exists) {
    say "ok      $from_name -> $to_name";
    return;
  }
  $dbh->do('INSERT INTO status_workflow (old_status, new_status, require_comment) VALUES (?, ?, ?)',
    undef, $from->id, $to->id, $require_comment ? 1 : 0);
  say "added   $from_name -> $to_name" . ($require_comment ? ' (comment required)' : '');
}

transition($_, STATUS, 1) for (INTO);
transition(STATUS, $_, 0) for (OUT_TO);

$dbh->bz_commit_transaction();

# Status lists are cached per process; clear the shared cache so the web pages see it at once.
Bugzilla->memcached->clear_all() if Bugzilla->can('memcached');
say "done.";
