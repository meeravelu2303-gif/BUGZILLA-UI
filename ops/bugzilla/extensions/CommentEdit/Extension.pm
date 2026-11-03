# CommentEdit: lets the author of a comment correct it. Bugzilla 5.2 itself
# never changes a comment once posted; this keeps every earlier version in its
# own table, so an edit is visible ("edited") and nothing is lost.
#
# Table (created by ops/bugzilla/setup-comment-edits.pl, or by checksetup.pl):
#   kp_comment_edits  id, comment_id -> longdescs (cascade), editor_id -> profiles,
#                     edit_ts, old_text (the text BEFORE that edit)
#
# Web service and its REST routes:
#   POST /rest/comment_edit/update    {comment_id, text}  author only
#   GET  /rest/comment_edit?bug_id=N  which comments of a bug were edited
#   GET  /rest/comment_edit/history?comment_id=N   earlier versions, newest first
#
# Source of truth: ops/bugzilla/extensions/CommentEdit in the BUGZILLA-UI repo.
# Install: copy the folder to C:\Bugzilla\extensions\CommentEdit.
package Bugzilla::Extension::CommentEdit;

use 5.14.0;
use strict;
use warnings;

use parent qw(Bugzilla::Extension);

our $VERSION = '1.0';

sub db_schema_abstract_schema {
  my ($self, $args) = @_;
  $args->{schema}->{kp_comment_edits} = {
    FIELDS => [
      id         => {TYPE => 'MEDIUMSERIAL', NOTNULL => 1, PRIMARYKEY => 1},
      comment_id => {TYPE => 'INT4', NOTNULL => 1, REFERENCES => {TABLE => 'longdescs', COLUMN => 'comment_id', DELETE => 'CASCADE'}},
      editor_id  => {TYPE => 'INT3', NOTNULL => 1, REFERENCES => {TABLE => 'profiles', COLUMN => 'userid'}},
      edit_ts    => {TYPE => 'DATETIME', NOTNULL => 1},
      old_text   => {TYPE => 'LONGTEXT', NOTNULL => 1},
    ],
    INDEXES => [kp_comment_edits_comment_idx => ['comment_id']],
  };
}

sub webservice {
  my ($self, $args) = @_;
  $args->{dispatch}->{CommentEdit} = 'Bugzilla::Extension::CommentEdit::WebService';
}

sub webservice_rest_resources {
  my ($self, $args) = @_;
  $args->{resources}->{'Bugzilla::Extension::CommentEdit::WebService'} = [
    qr{^/comment_edit$},         {GET  => {method => 'list'}},
    qr{^/comment_edit/history$}, {GET  => {method => 'history'}},
    qr{^/comment_edit/update$},  {POST => {method => 'update'}},
  ];
}

__PACKAGE__->NAME;
