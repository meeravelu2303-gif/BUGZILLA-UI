#!/usr/bin/perl -T
# Mantis -> Bugzilla migration, STEP 2: bugs, with their comments and attachments.
#
#   cd C:\Bugzilla
#   set MANTIS_DB_PASSWORD=<password of the bugs_mantis MariaDB user>
#   perl -T ...\mantis-step2-bugs.pl <admin login> --reporter ajith.kumar@mantis.invalid                 (dry run)
#   perl -T ...\mantis-step2-bugs.pl <admin login> --reporter ajith.kumar@mantis.invalid --show 3          (dry run + 3 full previews)
#   perl -T ...\mantis-step2-bugs.pl <admin login> --reporter ajith.kumar@mantis.invalid --execute         (writes)
#   --bug <mantis bugzilla id>  limits to one bug; --limit N caps how many.
#
# Source: `bugs_mantis` (read only - this script never writes to it).
# Target: the live Bugzilla this runs in. Needs step 1 (users + products) done.
#
# Each Mantis bug becomes a live bug IN OUR MANUAL-FILING FORMAT:
#   title        [MT-<mantis no>] <Module>: <original title>
#   whiteboard   [cat:Functional][source:manual][mantis:<no>]  (+ Mantis tags)
#   report       Classification / Category / Module / Severity, Summary,
#                Expected, Actual, Steps to reproduce, Additional information,
#                Environment, Reproducibility, "Filed by: manual - <reporter> via Mantis"
#   alias        mantis-<no>   - Bugzilla refuses a duplicate alias, so a re-run
#                                can never create the same bug twice.
#   cf_mantis_ref <no>         - the Mantis number as its own column (add-mantis-ref-field.pl
#                                must have run first); the UI shows bugs as KPA-<id>.
# and keeps from Mantis: reporter, assignee, CC, status/resolution, severity,
# priority, creation and last-change times, every non-empty comment (author +
# time), and every attachment (file, type, uploader, time).
#
# One transaction per bug: a failure rolls that bug back completely and the run
# continues. No email is sent (Bugzilla mails only from its web pages).

use 5.14.0;
use strict;
use warnings;
# This file's own literals ("—", "…") are UTF-8 text, the same as the decoded
# strings DBD::MariaDB hands back - without this they are raw bytes and the two
# mix into mojibake ("â€”") in every report.
use utf8;

use lib qw(. lib local/lib/perl5);

use DBI;
use Getopt::Long qw(GetOptions);
use JSON::XS;

use Bugzilla;
use Bugzilla::Constants;
use Bugzilla::Attachment;
use Encode ();
use Bugzilla::Bug;
use Bugzilla::User;

Bugzilla->usage_mode(USAGE_MODE_CMDLINE);
Bugzilla->error_mode(ERROR_MODE_DIE);
binmode STDOUT, ':encoding(UTF-8)';

my ($execute, $reporter_filter, $only_bug, $limit, $show, $preview_file, $assignee_map, $reporter_as) = (0, undef, undef, 0, 0, undef, undef, undef);
my $state_file = 'D:/TEST-BENCH-AUTOMATIONS/_backups/mantis-migration/step1-state.json';
GetOptions(
  'execute'    => \$execute,
  'reporter=s' => \$reporter_filter,
  'bug=i'      => \$only_bug,
  'limit=i'    => \$limit,
  'show=i'     => \$show,
  'preview=s'  => \$preview_file,
  'state=s'    => \$state_file,
  'assignee-map=s' => \$assignee_map,
  # File every selected bug under THIS preview login as reporter instead of the
  # bug's own. For bugs whose Mantis reporter was deleted (preview reporter =
  # the mantis-unknown placeholder): the owner chose a real person to stand in.
  'reporter-as=s'  => \$reporter_as,
) or die "Bad arguments\n";

my ($admin_login) = @ARGV;
die "Usage: perl -T mantis-step2-bugs.pl <admin login> --reporter <mantis login> [--execute]\n" unless $admin_login;
die "Pass --reporter or --bug: this script imports in deliberate slices, never everything at once by accident.\n"
  unless $reporter_filter || $only_bug;
($admin_login) = $admin_login =~ /^(\S+)$/ or die "Bad login\n";
($state_file)  = $state_file =~ /^([\w:\\\/. -]+)$/ or die "Bad --state\n";
($reporter_filter) = ($reporter_filter // '') =~ /^([^\s']*)$/ or die "Bad --reporter\n";
my ($db_pass) = ($ENV{MANTIS_DB_PASSWORD} // '') =~ /^(.*)$/s;
die "Set MANTIS_DB_PASSWORD\n" if $db_pass eq '';

my $admin = Bugzilla::User->check({name => $admin_login});
$admin->in_group('admin') or die "$admin_login is not a Bugzilla admin\n";
Bugzilla->set_user($admin);

my $src = DBI->connect('dbi:MariaDB:database=bugs_mantis;host=127.0.0.1;port=3307', 'bugs_mantis', $db_pass,
  {RaiseError => 1, PrintError => 0, AutoCommit => 1});
my $dbh = Bugzilla->dbh;

# ------------------------------------------------------------- mappings
open my $sfh, '<', $state_file or die "Cannot read $state_file (run step 1 first): $!\n";
my $state = JSON::XS->new->decode(do { local $/; <$sfh> });
close $sfh;
my %excluded_bug = map { $_ => 1 } @{$state->{excluded_bugs} // []};

my %live_user_id;    # mantis userid -> live userid
my $unknown = Bugzilla::User->new({name => 'mantis-unknown@mantis.invalid'})
  or die "Placeholder mantis-unknown\@mantis.invalid missing (step 1)\n";
for my $mid (keys %{$state->{users}}) {
  my $u = Bugzilla::User->new({name => $state->{users}{$mid}});
  $live_user_id{$mid} = $u ? $u->id : $unknown->id;    # deleted/unknown -> the placeholder
}
my $user_of = sub { $live_user_id{$_[0]} // $unknown->id };
my $login_of = sub { my $u = Bugzilla::User->new($user_of->($_[0])); $u->login };
my $name_of  = sub { my $u = Bugzilla::User->new($user_of->($_[0])); $u->name || $u->login };

# --assignee-map: "<mantis no>\t<live login>" per line, built from the REAL
# Mantis history (mantis_real) - the developer who resolved the bug, because
# Mantis handed resolved bugs back to the reporter and bugs_mantis kept that.
# A mapped bug is created with that developer; any other keeps the preview's.
my %assignee_override;
if ($assignee_map) {
  ($assignee_map) = $assignee_map =~ /^([\w:\\\/.\- ~]+)$/ or die "Bad --assignee-map path\n";
  open my $afh, '<:encoding(UTF-8)', $assignee_map or die "Cannot read $assignee_map: $!\n";
  while (my $line = <$afh>) {
    $line =~ s/\s+$//;
    my ($no, $login) = split /\t/, $line;
    next unless defined $login && $no =~ /^\d+$/;
    # 'component-owner' = the developer was deleted from Mantis: leave the
    # assignee unset so Bug->create uses the component's default owner.
    if ($login eq 'component-owner') { $assignee_override{$no} = ''; next; }
    my $u = Bugzilla::User->new({name => $login}) or die "--assignee-map: no live account '$login' (mantis $no)\n";
    $assignee_override{$no} = $u->login;
  }
  close $afh;
}
my $assignee_of = sub {
  my ($b) = @_;
  my ($no) = ($b->{alias} // '') =~ /mantis-(\d+)/;
  return $assignee_override{$no} if $no && exists $assignee_override{$no};    # '' = component owner
  return $login_of->($b->{assigned_to});
};

# ------------------------------------------------------------ selection
my @where = ('1=1');
my @bind;
if ($reporter_filter) {
  push @where, 'b.reporter = (SELECT userid FROM profiles WHERE login_name = ?)';
  push @bind, $reporter_filter;
}
if ($only_bug) { push @where, 'b.bug_id = ?'; push @bind, $only_bug; }
my $sql = 'SELECT b.*, a.alias FROM bugs b LEFT JOIN bugs_aliases a ON a.bug_id = b.bug_id WHERE '
  . join(' AND ', @where) . ' ORDER BY b.bug_id' . ($limit ? " LIMIT $limit" : '');
my @bugs = grep { !$excluded_bug{$_->{bug_id}} } @{$src->selectall_arrayref($sql, {Slice => {}}, @bind)};

# ------------------------------------------------------------ conversion
sub unescape {
  my ($t) = @_;
  $t //= '';
  # Every converted description stores line breaks as a literal backslash-n.
  $t =~ s/\\r\\n|\\n/\n/g;
  $t =~ s/\r\n/\n/g;
  return $t;
}
sub trim { my $s = shift // ''; $s =~ s/^\s+|\s+$//g; return $s; }

# Splits the converted Mantis description into its parts.
sub parse_mantis {
  my ($raw) = @_;
  my $text = unescape($raw);
  my %h;
  my ($head, $body) = $text =~ /\A(.*?)\n-{10,}\n(.*)\z/s ? ($1, $2) : ('', $text);
  for my $line (split /\n/, $head) {
    $h{assignee_text} = trim($1) if $line =~ /^Assigned to \(Mantis\):\s*(.*)$/;
    if ($line =~ /^Mantis status:\s*(.*)$/) {
      my $s = $1;
      $h{mantis_status}   = $1 if $s =~ /status:\s*(\S+)/ || $s =~ /^(\S+)/;
      $h{resolution}      = $1 if $s =~ /resolution:\s*(\S+)/;
      $h{reproducibility} = $1 if $s =~ /reproducibility:\s*(.+?)\s*$/;
    }
    $h{category} = trim($1) if $line =~ /^Category:\s*(.*)$/;
    $h{os}       = trim($1) if $line =~ /^OS \/ build \/ platform:\s*(.*)$/;
    $h{module}   = trim($1) if $line =~ /^Module:\s*(.*)$/;
    $h{submodule} = trim($1) if $line =~ /^Sub Module:\s*(.*)$/;
  }
  my ($summary, $steps, $additional) = ($body, '', '');
  if ($summary =~ /\A(.*?)\n\s*Additional information:\s*\n(.*)\z/s) { ($summary, $additional) = ($1, $2); }
  if ($summary =~ /\A(.*?)\n\s*Steps to reproduce:\s*\n(.*)\z/s)   { ($summary, $steps) = ($1, $2); }
  # Expected / Actual usually live inside "Additional information" - written as
  # "Expected Result:" on its own line or with the text after the colon, or as
  # "Expected Behavior" / "Actual Output". Checked there first, then in the body.
  my ($expected, $actual, $rest) = split_expected_actual($additional);
  my ($e2, $a2, $body2) = ('', '', $summary);
  ($e2, $a2, $body2) = split_expected_actual($summary) if $expected eq '' && $actual eq '';
  ($expected, $actual, $summary) = ($e2, $a2, $body2) if $e2 ne '' || $a2 ne '';
  return {%h, summary => trim($summary), steps => trim($steps), expected => $expected, actual => $actual, additional => trim($rest)};
}

# Lines are assigned to Expected, Actual or "the rest" by the last heading seen.
# Returns (expected, actual, rest); expected/actual are '' when not stated.
sub split_expected_actual {
  my ($text) = @_;
  my %part = (expected => [], actual => [], rest => []);
  my $cur = 'rest';
  my $head = qr/^\s*(Expected|Actual)\s*(?:Result|Results|Behaviou?r|Output|Outcome)?\s*(?:[:\-\x{2013}\x{2014}]+\s*(.*))?$/i;
  for my $line (split /\n/, $text // '') {
    if ($line =~ $head) {
      $cur = lc $1;
      my $inline = $2 // '';
      push @{$part{$cur}}, $inline if trim($inline) ne '';
      next;
    }
    push @{$part{$cur}}, $line;
  }
  my ($e, $a) = map { trim(join("\n", @{$part{$_}})) } qw(expected actual);
  # Only a real split counts: both sections, or at least one with the other heading absent.
  return ('', '', $text) if $e eq '' && $a eq '';
  return ($e, $a, trim(join("\n", @{$part{rest}})));
}

sub environment_of {
  my ($os) = @_;
  return '' unless $os;
  my @p = map { trim($_) } split m{\s*/\s*}, $os;
  my ($sys, $ver, $app) = @p;
  return join(' ', grep { $_ ne '' } ($sys // ''), ($ver // '')) . (($app // '') ne '' ? " ($app)" : '');
}

sub numbered {
  my ($steps) = @_;
  my @l = grep { /\S/ } map { trim($_) } split /\n/, $steps;
  # Reporters often typed the heading again inside the field.
  shift @l while @l && $l[0] =~ /^steps(?: to reproduce)?\s*:?$/i;
  return '' unless @l;
  return join("\n", @l) if grep { /^\d+\s*[.)]/ } @l;
  my $i = 0;
  return join("\n", map { ++$i . ". $_" } @l);
}

sub build_report {
  my ($b, $m, $reporter_name, $reporter_login) = @_;
  my $module = join(' / ', grep { $_ ne '' } ($m->{module} // ''), ($m->{submodule} // ''));
  my @L = (
    "Classification: $b->{short_desc}",
    'Category: Functional',
    'Module: ' . ($module || $b->{component_name}),
    "Severity: $b->{bug_severity} / Priority: $b->{priority}",
    '',
    'Summary:',
    $m->{summary} || $b->{short_desc},
  );
  push @L, '', 'Expected:', $m->{expected} if $m->{expected} ne '';
  push @L, '', 'Actual:',   $m->{actual}   if $m->{actual} ne '';
  push @L, '', 'Steps to reproduce:', numbered($m->{steps}) if $m->{steps} ne '';
  push @L, '', 'Additional information:', $m->{additional} if $m->{additional} ne '';
  my $env = environment_of($m->{os});
  push @L, '', "Environment: $env" if $env;
  push @L, "Reproducibility: $m->{reproducibility}" if $m->{reproducibility};
  push @L, "Mantis category: $m->{category}" if $m->{category};
  my ($no) = ($b->{alias} // '') =~ /mantis-(\d+)/;
  push @L, "Filed by: manual — $reporter_name <$reporter_login> via Mantis (issue #" . ($no // '?') . ')';
  return join("\n", @L);
}

sub title_of {
  my ($b, $m) = @_;
  my ($no) = ($b->{alias} // '') =~ /mantis-(\d+)/;
  my $mod = trim($m->{module} // '');
  my $t = "[MT-" . ($no // $b->{bug_id}) . '] ' . ($mod ne '' ? "$mod: " : '') . trim($b->{short_desc});
  $t =~ s/\s+/ /g;
  return length($t) > 255 ? substr($t, 0, 254) . '…' : $t;
}

sub whiteboard_of {
  my ($b) = @_;
  my ($no) = ($b->{alias} // '') =~ /mantis-(\d+)/;
  my $wb = '[cat:Functional][source:manual]' . ($no ? "[mantis:$no]" : '');
  if (($b->{status_whiteboard} // '') =~ /mantis-tags:\s*(.+)/) {
    $wb .= join('', map { '[mantis-tag:' . trim($_) . ']' } split /,/, $1);
  }
  return $wb;
}

# ------------------------------------------------------------ preview / plan
my $comp_name = $src->prepare('SELECT name FROM components WHERE id = ?');
my $prod_name = $src->prepare('SELECT name FROM products WHERE id = ?');
my %by_product;
my ($n_new, $n_dup, $n_comments, $n_attach) = (0, 0, 0, 0);
my $reporter_as_id;
if (defined $reporter_as) {
  ($reporter_as) = $reporter_as =~ /^([^\s']+)$/ or die "Bad --reporter-as\n";
  ($reporter_as_id) = $src->selectrow_array('SELECT userid FROM profiles WHERE login_name = ?', undef, $reporter_as);
  die "--reporter-as: no preview account '$reporter_as'\n" unless $reporter_as_id;
  say "REPORTER every bug filed as $reporter_as (live: " . $login_of->($reporter_as_id) . ')';
}
my @work;
for my $b (@bugs) {
  $comp_name->execute($b->{component_id}); ($b->{component_name}) = $comp_name->fetchrow_array;
  $prod_name->execute($b->{product_id});   ($b->{product_name})   = $prod_name->fetchrow_array;
  my $exists = $b->{alias} && $dbh->selectrow_array('SELECT bug_id FROM bugs_aliases WHERE alias = ?', undef, $b->{alias});
  if ($exists) { $n_dup++; next; }
  my $comments = $src->selectall_arrayref(
    'SELECT comment_id, who, bug_when, thetext, isprivate FROM longdescs WHERE bug_id = ? ORDER BY bug_when, comment_id',
    {Slice => {}}, $b->{bug_id});
  my $atts = $src->selectall_arrayref(
    'SELECT a.*, LENGTH(d.thedata) AS bytes FROM attachments a JOIN attach_data d ON d.id = a.attach_id WHERE a.bug_id = ? ORDER BY a.attach_id',
    {Slice => {}}, $b->{bug_id});
  my $first = shift @$comments;
  my @rest = grep { trim(unescape($_->{thetext})) ne '' } @$comments;
  $b->{reporter} = $reporter_as_id if defined $reporter_as_id;
  push @work, {bug => $b, first => $first, comments => \@rest, attachments => $atts};
  $n_new++;
  $n_comments += @rest;
  $n_attach   += @$atts;
  $by_product{$b->{product_name}}++;
}

say $execute ? 'MODE    EXECUTE' : 'MODE    DRY RUN - nothing is written (add --execute)';
say 'SLICE   ' . ($reporter_filter ? "reporter $reporter_filter" : '') . ($only_bug ? " bug $only_bug" : '');
say "BUGS    $n_new to import, $n_dup already imported (skipped), " . scalar(keys %excluded_bug) . ' excluded test bug(s)';
say "        $n_comments comments, $n_attach attachments";
say sprintf('        %-44s %d', $_, $by_product{$_}) for sort { $by_product{$b} <=> $by_product{$a} } keys %by_product;

# Previews can go to a file with an explicit UTF-8 layer: the Windows console
# cannot show these characters, and its encoding warnings corrupt the output.
my $PV = \*STDOUT;
if ($preview_file) {
  ($preview_file) = $preview_file =~ /^([\w:\\\/. ~-]+)$/ or die "Bad --preview path\n";
  open my $pfh, '>:encoding(UTF-8)', $preview_file or die "Cannot write $preview_file: $!\n";
  $PV = $pfh;
}
for my $w (@work[0 .. ($show > @work ? $#work : $show - 1)]) {
  next unless $w && $show;
  my $b = $w->{bug};
  my $m = parse_mantis($w->{first}{thetext});
  say $PV '';
  say $PV '=' x 78;
  say $PV 'TITLE      ' . title_of($b, $m);
  say $PV 'ALIAS      ' . ($b->{alias} // '-');
  say $PV "PRODUCT    $b->{product_name} / $b->{component_name}";
  say $PV "STATUS     $b->{bug_status}" . ($b->{resolution} ? " / $b->{resolution}" : '') . "   severity $b->{bug_severity}   priority $b->{priority}";
  say $PV 'REPORTER   ' . $name_of->($b->{reporter}) . ' <' . $login_of->($b->{reporter}) . '>';
  my ($pno) = ($b->{alias} // '') =~ /mantis-(\d+)/;
  my $asg = $assignee_of->($b);
  say $PV 'ASSIGNEE   ' . ($asg eq '' ? 'component owner (Mantis developer deleted)'
                         : $pno && $assignee_override{$pno} ? "$asg   (resolver, from real Mantis history)" : $asg);
  say $PV "CREATED    $b->{creation_ts}    LAST CHANGE $b->{delta_ts}";
  say $PV 'WHITEBOARD ' . whiteboard_of($b);
  say $PV '-' x 78;
  say $PV build_report($b, $m, $name_of->($b->{reporter}), $login_of->($b->{reporter}));
  say $PV '-' x 78;
  for my $c (@{$w->{comments}}) {
    my $t = trim(unescape($c->{thetext}));
    say $PV 'COMMENT by ' . $name_of->($c->{who}) . " at $c->{bug_when}" . ($c->{isprivate} ? ' (private)' : '') . ": " . (length($t) > 200 ? substr($t, 0, 200) . '…' : $t);
  }
  say $PV "ATTACHMENT $_->{filename} ($_->{mimetype}, " . sprintf('%.1f', $_->{bytes} / 1048576) . ' MB) by ' . $name_of->($_->{submitter_id}) . " at $_->{creation_ts}" for @{$w->{attachments}};
}

unless ($execute) { say ''; say 'DRY RUN complete - nothing changed.'; exit 0; }

# =================================================================== EXECUTE
my ($ok_bugs, $failed) = (0, 0);
my $att_data = $src->prepare('SELECT thedata FROM attach_data WHERE id = ?');
for my $w (@work) {
  my $b = $w->{bug};
  my $m = parse_mantis($w->{first}{thetext});
  $dbh->bz_start_transaction();
  my $ok = eval {
    Bugzilla->set_user($admin);

    # Bugzilla caps a comment at 65,535 characters. A few Mantis descriptions
    # are far larger (pasted API responses, up to ~930 KB): the report is cut
    # to fit, says so, and the COMPLETE original text goes on the bug as a
    # text attachment - so nothing is lost and the create no longer fails.
    my $report = build_report($b, $m, $name_of->($b->{reporter}), $login_of->($b->{reporter}));
    my $full_report;
    my ($mno) = ($b->{alias} // '') =~ /mantis-(\d+)/;
    if (length($report) > MAX_COMMENT_LENGTH) {
      $full_report = $report;
      my $note = "\n\n[Cut here: the original Mantis description is " . length($report)
        . " characters, over Bugzilla's 65,535-character limit. The complete text is attached as mantis-$mno-description.txt]";
      $report = substr($report, 0, MAX_COMMENT_LENGTH - length($note) - 100) . $note;
    }

    my $bug = Bugzilla::Bug->create({
      product           => $b->{product_name},
      component         => $b->{component_name},
      short_desc        => title_of($b, $m),    # Bug->create's name; "summary" is only the WebService alias
      version           => 'unspecified',
      op_sys            => 'All',
      rep_platform      => 'All',
      bug_severity      => $b->{bug_severity},
      priority          => $b->{priority},
      bug_status        => 'CONFIRMED',
      assigned_to       => $assignee_of->($b),
      status_whiteboard => whiteboard_of($b),
      alias             => $b->{alias} ? [$b->{alias}] : [],
      comment           => $report,
    });
    my $id = $bug->id;

    if (defined $full_report) {
      my $att = Bugzilla::Attachment->create({
        bug         => $bug,
        data        => Encode::encode('UTF-8', $full_report),
        description => 'Original Mantis description (full text - too long for a comment)',
        filename    => "mantis-$mno-description.txt",
        mimetype    => 'text/plain',
        ispatch     => 0,
        isprivate   => 0,
      });
      $dbh->do('UPDATE attachments SET submitter_id = ?, creation_ts = ?, modification_time = ? WHERE attach_id = ?',
        undef, $user_of->($b->{reporter}), $b->{creation_ts}, $b->{creation_ts}, $att->id);
    }

    # History as it happened in Mantis: who filed it, when, and where it ended up.
    $dbh->do('UPDATE bugs SET reporter = ?, creation_ts = ?, delta_ts = ?, lastdiffed = ?, bug_status = ?, resolution = ?, everconfirmed = 1, cf_mantis_ref = ? WHERE bug_id = ?',
      undef, $user_of->($b->{reporter}), $b->{creation_ts}, $b->{delta_ts}, $b->{delta_ts}, $b->{bug_status}, $b->{resolution} // '', (($b->{alias} // '') =~ /mantis-(\d+)/)[0], $id);
    $dbh->do('UPDATE longdescs SET who = ?, bug_when = ? WHERE bug_id = ?',
      undef, $user_of->($b->{reporter}), $b->{creation_ts}, $id);

    for my $c (@{$w->{comments}}) {
      $dbh->do('INSERT INTO longdescs (bug_id, who, bug_when, thetext, isprivate, already_wrapped, type) VALUES (?, ?, ?, ?, ?, 0, 0)',
        undef, $id, $user_of->($c->{who}), $c->{bug_when}, trim(unescape($c->{thetext})), $c->{isprivate} ? 1 : 0);
    }

    for my $a (@{$w->{attachments}}) {
      $att_data->execute($a->{attach_id});
      my ($data) = $att_data->fetchrow_array;
      my $att = Bugzilla::Attachment->create({
        bug         => $bug,
        data        => $data,
        description => $a->{description} || $a->{filename},
        filename    => $a->{filename},
        mimetype    => $a->{mimetype},
        ispatch     => 0,
        isprivate   => $a->{isprivate} ? 1 : 0,
      });
      $dbh->do('UPDATE attachments SET submitter_id = ?, creation_ts = ?, modification_time = ? WHERE attach_id = ?',
        undef, $user_of->($a->{submitter_id}), $a->{creation_ts}, $a->{modification_time} // $a->{creation_ts}, $att->id);
    }

    for my $who (@{$src->selectcol_arrayref('SELECT who FROM cc WHERE bug_id = ?', undef, $b->{bug_id})}) {
      $dbh->do('INSERT IGNORE INTO cc (bug_id, who) VALUES (?, ?)', undef, $id, $user_of->($who));
    }

    # Search index: Bug->create already inserted this bug's row, so refresh it to
    # include the comments written above (new_bug => 1 would insert a duplicate).
    Bugzilla::Bug->new($id)->_sync_fulltext(update_comments => 1, update_short_desc => 1);
    1;
  };
  if ($ok) {
    $dbh->bz_commit_transaction();
    $ok_bugs++;
  }
  else {
    my $err = $@;
    $err = $err->message if ref $err && eval { $err->can('message') };
    $dbh->bz_rollback_transaction();
    $failed++;
    say "FAILED  $b->{alias} (mantis bug $b->{bug_id}): $err";
  }
}
say '';
say "DONE    imported $ok_bugs, failed $failed (rolled back individually), skipped $n_dup already imported";
