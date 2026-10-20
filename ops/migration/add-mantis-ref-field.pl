#!/usr/bin/perl -T
# Add the "Mantis bug #" reference column to bugs, and fill it for every bug
# already imported from Mantis.
#
#   cd C:\Bugzilla
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\migration\add-mantis-ref-field.pl            (dry run)
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\migration\add-mantis-ref-field.pl --execute  (writes)
#
# The column is a Bugzilla custom field (cf_mantis_ref, free text), created
# through Bugzilla::Field so fielddefs, the bugs column and search all agree -
# a hand-made ALTER TABLE would be invisible to Bugzilla.
#
# The value is copied from the bug's alias (mantis-<N> -> <N>). The alias stays:
# it is the importer's duplicate guard. Re-running changes nothing.

use 5.14.0;
use strict;
use warnings;

use lib qw(. lib local/lib/perl5);

use Getopt::Long qw(GetOptions);

use Bugzilla;
use Bugzilla::Constants;
use Bugzilla::Field;

Bugzilla->usage_mode(USAGE_MODE_CMDLINE);
Bugzilla->error_mode(ERROR_MODE_DIE);

my $execute = 0;
GetOptions('execute' => \$execute) or die "Bad arguments\n";

my $FIELD = 'cf_mantis_ref';
my $dbh   = Bugzilla->dbh;

my $exists = Bugzilla::Field->new({name => $FIELD});
my ($todo) = $dbh->selectrow_array(
  "SELECT COUNT(*) FROM bugs_aliases WHERE alias LIKE 'mantis-%'");

say $execute ? "MODE    EXECUTE" : "MODE    DRY RUN - nothing is written (add --execute)";
say $exists ? "FIELD   $FIELD already exists" : "FIELD   $FIELD will be CREATED (free text, 'Mantis bug #')";
say "FILL    $todo bugs carry a mantis-N alias";
exit 0 unless $execute;

unless ($exists) {
  Bugzilla::Field->create({
    name        => $FIELD,
    description => 'Mantis bug #',
    type        => FIELD_TYPE_FREETEXT,
    custom      => 1,
    enter_bug   => 0,
    buglist     => 1,
    mailhead    => 0,
    obsolete    => 0,
  });
  say "DONE    field created";
}

$dbh->bz_start_transaction();
my $n = $dbh->do(
  "UPDATE bugs b JOIN bugs_aliases a ON a.bug_id = b.bug_id
      SET b.$FIELD = SUBSTRING(a.alias, 8)
    WHERE a.alias LIKE 'mantis-%' AND (b.$FIELD IS NULL OR b.$FIELD <> SUBSTRING(a.alias, 8))");
$dbh->bz_commit_transaction();
say "DONE    filled " . ($n + 0) . " bugs";
