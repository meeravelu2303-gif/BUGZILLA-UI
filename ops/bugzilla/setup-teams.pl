#!/usr/bin/perl -T
# One-time (idempotent) Bugzilla configuration: the Teams extension's tables.
#
#   1. copy ops/bugzilla/extensions/Teams to C:\Bugzilla\extensions\Teams
#   2. cd C:\Bugzilla
#      perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\bugzilla\setup-teams.pl
#
# Creates kp_teams and kp_team_members from the extension's own schema
# (Extension.pm, db_schema_abstract_schema) through Bugzilla's bz_add_table, so
# Bugzilla's stored schema knows them and a later checksetup.pl sees nothing to
# do. Only adds tables; changes nothing that exists. Re-running is harmless.

use 5.14.0;
use strict;
use warnings;

use lib qw(. lib local/lib/perl5);

use Bugzilla;
use Bugzilla::Constants;

Bugzilla->usage_mode(USAGE_MODE_CMDLINE);

my $dbh = Bugzilla->dbh;
for my $table (qw(kp_teams kp_team_members)) {
  if ($dbh->bz_table_info($table)) {
    say "$table: already exists";
    next;
  }
  $dbh->bz_add_table($table);
  say "$table: created";
}

# bz_add_table leaves foreign keys to the end of checksetup.pl; add them here.
for my $table (qw(kp_teams kp_team_members)) {
  for my $column (qw(leader_id team_id user_id)) {
    my $info = $dbh->bz_column_info($table, $column) or next;
    my $fk   = $info->{REFERENCES} or next;
    if ($fk->{created}) {
      say "$table.$column: foreign key already exists";
      next;
    }
    $dbh->bz_add_fk($table, $column, $fk);
    say "$table.$column: foreign key -> $fk->{TABLE}.$fk->{COLUMN} added";
  }
}
