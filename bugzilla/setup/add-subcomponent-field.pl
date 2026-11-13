#!/usr/bin/perl -T
# Create the "Sub-component" custom field: a drop-down whose values are
# controlled by Component (each value belongs to exactly one component).
#
#   cd C:\Bugzilla
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\bugzilla\add-subcomponent-field.pl            (dry run)
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\bugzilla\add-subcomponent-field.pl --execute  (writes)
#
# Created through Bugzilla::Field so fielddefs, the cf_subcomponent value table
# and the bugs column all agree. Existing bugs get the empty value '---'.
# Values are managed by the SubComponents extension (ops/bugzilla/extensions),
# which must be copied to C:\Bugzilla\extensions\SubComponents. Re-running is safe.

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

my $FIELD     = 'cf_subcomponent';
my $exists    = Bugzilla::Field->new({name => $FIELD});
my $component = Bugzilla::Field->new({name => 'component'}) or die "No component field\n";

say $execute ? "MODE    EXECUTE" : "MODE    DRY RUN - nothing is written (add --execute)";
if ($exists) {
  say "FIELD   $FIELD already exists (id " . $exists->id . ", values controlled by field id "
    . ($exists->value_field ? $exists->value_field->id : 'none') . ")";
  exit 0;
}
say "FIELD   $FIELD will be CREATED: single select 'Sub-component', values controlled by component (field id "
  . $component->id . ")";
exit 0 unless $execute;

my $field = Bugzilla::Field->create({
  name           => $FIELD,
  description    => 'Sub-component',
  type           => FIELD_TYPE_SINGLE_SELECT,
  custom         => 1,
  enter_bug      => 1,
  buglist        => 1,
  mailhead       => 0,
  obsolete       => 0,
  is_mandatory   => 0,
  value_field_id => $component->id,
});
say "DONE    field created (id " . $field->id . ")";
