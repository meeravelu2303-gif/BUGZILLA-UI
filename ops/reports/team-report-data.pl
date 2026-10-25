#!/usr/bin/perl
# Daily team report - step 1 of 3: gathers ONE day's activity for every team
# (ops/bugzilla/extensions/Teams) and writes it as JSON. Read-only.
#
#   cd C:\Bugzilla
#   perl D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\reports\team-report-data.pl --date 2026-10-24 --out C:\path\data.json
#
# --date (one day) or --from and --to (several days, e.g. a weekend), server time (IST); default today. Per team: the leader, and per
# member what they did that day (bugs filed, status changes, reassignments,
# other edits, comments - each with the bug's product and current status) and
# what is pending on them. A team whose members are mostly testers gets the
# tester figures; any other team the developer figures.
#
# Step 2 (build-team-report.cjs) turns this into one Excel file per team;
# step 3 (send-team-reports.pl) emails each file to its team leader.
use 5.14.0;
use strict;
use warnings;
use utf8;

use lib qw(. lib local/lib/perl5);

use Getopt::Long qw(GetOptions);
use JSON::PP;
use POSIX qw(strftime);
use Time::Local qw(timelocal);

use Bugzilla;
use Bugzilla::Constants;

Bugzilla->usage_mode(USAGE_MODE_CMDLINE);

my ($date, $start, $end, $out);
GetOptions('date=s' => \$date, 'from=s' => \$start, 'to=s' => \$end, 'out=s' => \$out) or die "bad options\n";
die "Usage: team-report-data.pl (--date YYYY-MM-DD | --from YYYY-MM-DD --to YYYY-MM-DD) --out file.json\n" unless $out;
# One day (--date), or several days together (--from .. --to, both included).
$start //= $date // strftime('%Y-%m-%d', localtime);
$end   //= $date // $start;
for ($start, $end) { die "Dates must be YYYY-MM-DD\n" unless /^\d{4}-\d{2}-\d{2}$/ }
die "--from must not be after --to\n" if $start gt $end;

my $dbh = Bugzilla->dbh;
my ($from, $to) = ("$start 00:00:00", $dbh->selectrow_array('SELECT DATE_ADD(?, INTERVAL 1 DAY)', undef, "$end 00:00:00"));

# ---------------------------------------------------------------- reference data
my %open_status = map { $_->[0] => $_->[1] } @{$dbh->selectall_arrayref('SELECT value, is_open FROM bug_status')};
my @open = grep { $open_status{$_} } keys %open_status;
my $open_in = join(',', map { $dbh->quote($_) } @open);
my %field_id = map { $_->[0] => $_->[1] } @{$dbh->selectall_arrayref(
  q{SELECT name, id FROM fielddefs WHERE name IN ('bug_status','resolution','assigned_to','product','component','priority','bug_severity','short_desc','cf_subcomponent','dependson','blocked','cc','keywords','bug_file_loc','op_sys','rep_platform','version','target_milestone','status_whiteboard')})};
my %field_label = (
  priority => 'Priority', bug_severity => 'Severity', product => 'Product', component => 'Component',
  short_desc => 'Title', cf_subcomponent => 'Sub-component', dependson => 'Depends on', blocked => 'Blocks',
  keywords => 'Keywords', version => 'Version', target_milestone => 'Milestone', op_sys => 'OS',
  rep_platform => 'Platform', bug_file_loc => 'URL', status_whiteboard => 'Whiteboard',
);
my %is_tester = map { $_->[0] => 1 } @{$dbh->selectall_arrayref(q{
  SELECT DISTINCT m.user_id FROM user_group_map m JOIN `groups` g ON g.id = m.group_id
  WHERE g.name = 'canconfirm' AND m.isbless = 0
    AND m.user_id NOT IN (SELECT m2.user_id FROM user_group_map m2 JOIN `groups` g2 ON g2.id = m2.group_id
                          WHERE g2.name IN ('editusers','editcomponents') AND m2.isbless = 0)})};

# Bug details, cached: id -> {id, title, product, component, status, resolution, severity, priority, assignee, reporter, created, changed}
my %bug;
sub bugs_info {
  my @want = grep { !$bug{$_} } @_;
  while (my @chunk = splice(@want, 0, 500)) {
    my $in = join(',', map { int } @chunk);
    my $rows = $dbh->selectall_arrayref(qq{
      SELECT b.bug_id, b.short_desc, p.name, c.name, b.bug_status, b.resolution, b.bug_severity, b.priority,
             a.realname, a.login_name, r.realname, r.login_name, b.creation_ts, b.delta_ts
      FROM bugs b JOIN products p ON p.id = b.product_id JOIN components c ON c.id = b.component_id
      JOIN profiles a ON a.userid = b.assigned_to JOIN profiles r ON r.userid = b.reporter
      WHERE b.bug_id IN ($in)});
    for my $r (@$rows) {
      $bug{$r->[0]} = {
        id => 0 + $r->[0], title => $r->[1], product => $r->[2], component => $r->[3], status => $r->[4],
        resolution => $r->[5], severity => $r->[6], priority => $r->[7],
        assignee => $r->[8] || $r->[9], reporter => $r->[10] || $r->[11], created => $r->[12], changed => $r->[13],
      };
    }
  }
  return map { $bug{$_} } grep { $bug{$_} } @_;
}

# Severity and priority as the Bug Tracker app shows them (backend/src/lib/classification.ts).
my %SEVERITY = (blocker => 'Critical', critical => 'Critical', major => 'Major', normal => 'Minor', minor => 'Minor',
                trivial => 'Trivial', enhancement => 'Enhancement');
my %PRIORITY = (Highest => 'P0', High => 'P1', Normal => 'P2', Low => 'P3', Lowest => 'P3', '---' => '-');
sub display_value {
  my ($field, $value) = @_;
  return $SEVERITY{$value} // $value if $field eq 'bug_severity';
  return $PRIORITY{$value} // $value if $field eq 'priority';
  return $value eq '' ? '-' : $value;
}

sub epoch {
  my ($y, $mo, $d, $h, $mi, $s) = $_[0] =~ /^(\d+)-(\d+)-(\d+) (\d+):(\d+):(\d+)/ or return 0;
  return timelocal($s, $mi, $h, $d, $mo - 1, $y);
}

sub name_of_login {
  my ($login) = @_;
  state %cache;
  return $cache{$login} //= ($dbh->selectrow_array('SELECT realname FROM profiles WHERE login_name = ?', undef, $login) || $login);
}

# ---------------------------------------------------------------- one member
sub member_report {
  my ($uid, $kind) = @_;
  my @events;    # {time, bug, action, kind}

  # Bugs filed that day.
  my $filed = $dbh->selectall_arrayref(
    q{SELECT bug_id, creation_ts FROM bugs WHERE reporter = ? AND creation_ts >= ? AND creation_ts < ?}, undef, $uid, $from, $to);
  my %filed = map { $_->[0] => $_->[1] } @$filed;
  push @events, {time => $_->[1], bug => $_->[0], kind => 'filed', action => 'Filed this bug'} for @$filed;

  # Field changes made that day, grouped per bug and moment so a status change
  # and its resolution read as one line.
  my $changes = $dbh->selectall_arrayref(q{
    SELECT a.bug_id, a.bug_when, f.name, a.removed, a.added
    FROM bugs_activity a JOIN fielddefs f ON f.id = a.fieldid
    WHERE a.who = ? AND a.bug_when >= ? AND a.bug_when < ? ORDER BY a.bug_when, a.id}, undef, $uid, $from, $to);
  my (%moment, @order);
  for my $c (@$changes) {
    my ($bug_id, $when, $field, $removed, $added) = @$c;
    next if $filed{$bug_id} && $when eq $filed{$bug_id};    # set while filing
    my $key = "$bug_id|$when";
    push @order, $key unless $moment{$key};
    push @{$moment{$key}}, {field => $field, removed => $removed // '', added => $added // ''};
  }
  my (%fixed, %closed, %reopened_by_me, %status_changed);
  for my $key (@order) {
    my ($bug_id, $when) = split /\|/, $key, 2;
    my @parts;
    my %by = map { $_->{field} => $_ } @{$moment{$key}};
    if (my $s = $by{bug_status}) {
      my $res = $by{resolution} && $by{resolution}{added} ne '' ? " ($by{resolution}{added})" : '';
      push @parts, "Status: $s->{removed} → $s->{added}$res";
      $status_changed{$bug_id} = 1;
      $fixed{$bug_id}          = 1 if $s->{added} eq 'RESOLVED' || $s->{added} eq 'IN_REVIEW';
      $closed{$bug_id}         = 1 if $s->{added} eq 'CLOSED';
      $reopened_by_me{$bug_id} = 1 if $s->{added} eq 'REOPENED';
    }
    elsif (my $r = $by{resolution}) {
      push @parts, "Resolution: " . ($r->{added} || 'cleared');
    }
    if (my $a = $by{assigned_to}) {
      push @parts, 'Reassigned to ' . name_of_login($a->{added});
    }
    push @parts, "Moved to product $by{product}{added}" if $by{product};
    for my $f (grep { $by{$_} } qw(component priority bug_severity)) {
      my ($old, $new) = map { display_value($f, $_) } @{$by{$f}}{qw(removed added)};
      push @parts, "$field_label{$f}: $old → $new";
    }
    my @other = map { $field_label{$_} // $_ }
      grep { !/^(bug_status|resolution|assigned_to|product|component|priority|bug_severity|cc|longdesc|bug_group|attachments\..*|flagtypes\.name)$/ } sort keys %by;
    push @parts, 'Changed ' . join(', ', @other) if @other;
    push @parts, 'Added an attachment' if grep {/^attachments\./} keys %by;
    next unless @parts;
    push @events, {time => $when, bug => 0 + $bug_id, kind => 'change', action => join('; ', @parts)};
  }

  # Comments written that day (not the description written while filing).
  my $comments = $dbh->selectall_arrayref(q{
    SELECT l.bug_id, l.bug_when, l.thetext FROM longdescs l
    WHERE l.who = ? AND l.bug_when >= ? AND l.bug_when < ? ORDER BY l.bug_when}, undef, $uid, $from, $to);
  my $comment_count = 0;
  for my $c (@$comments) {
    my ($bug_id, $when, $text) = @$c;
    next if $filed{$bug_id} && $when eq $filed{$bug_id};
    $text //= '';
    my $action;
    if ($text =~ /^\s*\[report-revision\]/) {
      $action = 'Edited the bug report';
    }
    else {
      $text =~ s/\s+/ /g;
      $text =~ s/^\s+|\s+$//g;
      next if $text eq '';
      $text = substr($text, 0, 140) . '…' if length($text) > 140;
      $action = "Commented: $text";
      $comment_count++;
    }
    # A comment saved with a change (same bug, within a minute) joins that
    # change's line, so one action never reads as two.
    if (my ($same) = grep { $_->{bug} == $bug_id && $_->{kind} eq 'change' && abs(epoch($_->{time}) - epoch($when)) <= 60 } @events) {
      $same->{action} .= "; $action";
      next;
    }
    push @events, {time => $when, bug => 0 + $bug_id, kind => 'comment', action => $action};
  }

  bugs_info(map { $_->{bug} } @events);
  @events = sort { $a->{time} cmp $b->{time} || $a->{bug} <=> $b->{bug} } grep { $bug{$_->{bug}} } @events;
  my %worked = map { $_->{bug} => 1 } @events;

  my %m = (events => \@events, worked => scalar(keys %worked), filed => scalar(keys %filed), comments => $comment_count);
  if ($kind eq 'tester') {
    my $pending = $dbh->selectcol_arrayref(qq{SELECT bug_id FROM bugs WHERE reporter = ? AND bug_status IN ($open_in)}, undef, $uid);
    my $retest  = $dbh->selectcol_arrayref(
      q{SELECT bug_id FROM bugs WHERE reporter = ? AND bug_status = 'RESOLVED' AND resolution <> 'DELETED' ORDER BY delta_ts}, undef, $uid);
    %m = (%m, closed => scalar(keys %closed), reopened => scalar(keys %reopened_by_me),
          open_reported => scalar(@$pending), retest => [map { $_->{id} } bugs_info(@$retest)]);
  }
  else {
    my $pending = $dbh->selectcol_arrayref(
      qq{SELECT bug_id FROM bugs WHERE assigned_to = ? AND bug_status IN ($open_in) ORDER BY creation_ts}, undef, $uid);
    my $reopened = $dbh->selectcol_arrayref(qq{
      SELECT DISTINCT a.bug_id FROM bugs_activity a JOIN bugs b ON b.bug_id = a.bug_id
      WHERE b.assigned_to = ? AND a.fieldid = ? AND a.added = 'REOPENED' AND a.bug_when >= ? AND a.bug_when < ?},
      undef, $uid, $field_id{bug_status}, $from, $to);
    my @pending = bugs_info(@$pending);
    my $top = grep { $_->{severity} =~ /^(blocker|critical)$/ || $_->{priority} eq 'Highest' } @pending;
    %m = (%m, fixed => scalar(keys %fixed), reopened => scalar(@$reopened), pending => [map { $_->{id} } @pending], top_priority => $top);
  }
  return \%m;
}

# ---------------------------------------------------------------- every team
my $teams = $dbh->selectall_arrayref(q{
  SELECT t.id, t.name, l.userid, l.realname, l.login_name
  FROM kp_teams t LEFT JOIN profiles l ON l.userid = t.leader_id ORDER BY t.name});
my @report;
for my $t (@$teams) {
  my ($team_id, $team_name, $leader_id, $leader_name, $leader_login) = @$t;
  my $members = $dbh->selectall_arrayref(q{
    SELECT p.userid, p.realname, p.login_name FROM kp_team_members m JOIN profiles p ON p.userid = m.user_id
    WHERE m.team_id = ? ORDER BY p.realname}, undef, $team_id);
  my $testers = grep { $is_tester{$_->[0]} } @$members;
  my $kind = @$members && $testers * 2 > @$members ? 'tester' : 'developer';
  push @report, {
    id      => 0 + $team_id,
    name    => $team_name,
    kind    => $kind,
    leader  => $leader_login ? {name => $leader_name || $leader_login, email => $leader_login} : undef,
    members => [map { {name => $_->[1] || $_->[2], email => $_->[2], %{member_report($_->[0], $kind)}} } @$members],
  };
}

my %bugs_out = map { $_ => $bug{$_} } keys %bug;
open my $fh, '>:raw', $out or die "$out: $!\n";
print $fh JSON::PP->new->utf8->canonical->pretty->encode({
  date => $end, start => $start, end => $end, generated => strftime('%Y-%m-%d %H:%M', localtime), app_url => 'http://192.168.0.50:5175',
  teams => \@report, bugs => \%bugs_out,
});
close $fh;
say "Wrote $out: " . scalar(@report) . ' teams, ' . scalar(keys %bug) . " bugs, $start to $end";
