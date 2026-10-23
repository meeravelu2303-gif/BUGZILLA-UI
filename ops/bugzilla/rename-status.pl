#!/usr/bin/perl -T
# Rename a bug status everywhere, e.g. VERIFIED -> CLOSED.
#
#   cd C:\Bugzilla
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\bugzilla\rename-status.pl VERIFIED CLOSED            (dry run)
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\bugzilla\rename-status.pl VERIFIED CLOSED --execute  (writes)
#
# Through Bugzilla's own object (what editvalues.cgi does): renaming the status
# value rewrites every bug that has it. The workflow is stored by status id, so
# every allowed transition carries over unchanged. Additionally - Bugzilla does
# not do this itself - the change history and saved searches are updated, so a
# bug's activity reads consistently ("RESOLVED -> CLOSED", not a status that no
# longer exists) and nobody's saved search silently stops matching.

use 5.14.0;
use strict;
use warnings;

use lib qw(. lib local/lib/perl5);

use Getopt::Long qw(GetOptions);

use Bugzilla;
use Bugzilla::Constants;
use Bugzilla::Status;

Bugzilla->usage_mode(USAGE_MODE_CMDLINE);
Bugzilla->error_mode(ERROR_MODE_DIE);

my $execute = 0;
GetOptions('execute' => \$execute) or die "Bad arguments\n";
my ($from, $to) = map { /^([A-Z_]+)$/ ? $1 : die "Status names are UPPER_CASE words\n" } @ARGV[0, 1];
die "Usage: rename-status.pl FROM TO [--execute]\n" unless $from && $to;

my $dbh    = Bugzilla->dbh;
my $status = Bugzilla::Status->new({name => $from}) or die "No status $from\n";
die "A status named $to already exists\n" if Bugzilla::Status->new({name => $to});
my ($fid) = $dbh->selectrow_array("SELECT id FROM fielddefs WHERE name = 'bug_status'");

my ($bugs)    = $dbh->selectrow_array('SELECT COUNT(*) FROM bugs WHERE bug_status = ?', undef, $from);
my ($history) = $dbh->selectrow_array('SELECT COUNT(*) FROM bugs_activity WHERE fieldid = ? AND (added = ? OR removed = ?)', undef, $fid, $from, $from);
my ($queries) = $dbh->selectrow_array('SELECT COUNT(*) FROM namedqueries WHERE query LIKE ?', undef, "%$from%");

say $execute ? 'MODE     EXECUTE' : 'MODE     DRY RUN - nothing is written (add --execute)';
say "RENAME   $from -> $to (status id " . $status->id . ', ' . ($status->is_open ? 'open' : 'closed') . ')';
say "BUGS     $bugs";
say "HISTORY  $history activity rows";
say "SEARCHES $queries saved searches mention $from";
exit 0 unless $execute;

$dbh->bz_start_transaction();
$status->set_name($to);
$status->update();    # also rewrites bugs.bug_status
$dbh->do('UPDATE bugs_activity SET added = ? WHERE fieldid = ? AND added = ?', undef, $to, $fid, $from);
$dbh->do('UPDATE bugs_activity SET removed = ? WHERE fieldid = ? AND removed = ?', undef, $to, $fid, $from);
$dbh->do("UPDATE namedqueries SET query = REPLACE(query, ?, ?) WHERE query LIKE ?", undef, "bug_status=$from", "bug_status=$to", "%bug_status=$from%");
$dbh->bz_commit_transaction();
Bugzilla->memcached->clear_all() if Bugzilla->can('memcached');

my ($left)  = $dbh->selectrow_array('SELECT COUNT(*) FROM bugs WHERE bug_status = ?', undef, $from);
my ($moved) = $dbh->selectrow_array('SELECT COUNT(*) FROM bugs WHERE bug_status = ?', undef, $to);
say "DONE     $moved bugs now $to, $left still $from";
