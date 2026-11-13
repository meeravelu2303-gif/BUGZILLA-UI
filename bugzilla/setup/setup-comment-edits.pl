#!/usr/bin/perl -T
# One-time (idempotent) Bugzilla configuration: the CommentEdit extension's table.
#
#   1. copy ops/bugzilla/extensions/CommentEdit to C:\Bugzilla\extensions\CommentEdit
#   2. cd C:\Bugzilla
#      perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\bugzilla\setup-comment-edits.pl
#
# Creates kp_comment_edits from the extension's own schema (Extension.pm,
# db_schema_abstract_schema) through Bugzilla's bz_add_table, so Bugzilla's
# stored schema knows it and a later checksetup.pl sees nothing to do. Only
# adds a table; changes nothing that exists. Re-running is harmless.

use 5.14.0;
use strict;
use warnings;

use lib qw(. lib local/lib/perl5);

use Bugzilla;
use Bugzilla::Constants;

Bugzilla->usage_mode(USAGE_MODE_CMDLINE);

my $dbh   = Bugzilla->dbh;
my $table = 'kp_comment_edits';
if ($dbh->bz_table_info($table)) {
  say "$table: already exists";
}
else {
  $dbh->bz_add_table($table);
  say "$table: created";
}

# bz_add_table leaves foreign keys to the end of checksetup.pl; add them here.
for my $column (qw(comment_id editor_id)) {
  my $info = $dbh->bz_column_info($table, $column) or next;
  my $fk   = $info->{REFERENCES} or next;
  if ($fk->{created}) {
    say "$table.$column: foreign key already exists";
    next;
  }
  $dbh->bz_add_fk($table, $column, $fk);
  say "$table.$column: foreign key -> $fk->{TABLE}.$fk->{COLUMN} added";
}
