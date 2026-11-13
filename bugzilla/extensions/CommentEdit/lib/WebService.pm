# CommentEdit web service: edit one's own comment; read edit markers and history.
#
# Who may edit: only the comment's author, on a bug they can still see.
# Never editable: the bug's description (comment 0 - the report has its own
# revisions), the Bug Tracker's report-revision and soft-delete records, and
# duplicate notices. A private comment is invisible to non-insiders, so for
# them it does not exist here either.
#
# An edit stores the previous text in kp_comment_edits, replaces the comment
# text, refreshes the bug's search index and moves the bug's "last changed"
# time. No email is sent.
package Bugzilla::Extension::CommentEdit::WebService;

use 5.14.0;
use strict;
use warnings;

use parent qw(Bugzilla::WebService);

use Bugzilla::Bug;
use Bugzilla::Comment;
use Bugzilla::Constants;
use Bugzilla::Error;
use Bugzilla::Util qw(detaint_natural trick_taint);

use constant PUBLIC_METHODS => qw(list history update);
use constant READ_ONLY      => qw(list history);
use constant MAX_TEXT       => 65535;

# Records the Bug Tracker writes as comments; never edited by hand, and never imitated.
use constant LOCKED_MARKERS => qr/^\s*\[report-revision\]|\[soft-delete\]/;

# A comment the caller may see, and its bug.
sub _visible_comment {
  my ($user, $raw_id) = @_;
  my $id = $raw_id // '';
  ThrowUserError('kp_comment_not_found') unless detaint_natural($id);
  my $comment = Bugzilla::Comment->new($id);
  ThrowUserError('kp_comment_not_found') unless $comment;
  ThrowUserError('kp_comment_not_found') if $comment->is_private && !$user->is_insider;
  my $bug = Bugzilla::Bug->check($comment->bug_id);    # throws if the caller cannot see the bug
  return ($comment, $bug);
}

sub _summaries {
  my ($comment_ids) = @_;
  return {} unless @$comment_ids;
  my $dbh  = Bugzilla->dbh;
  my $rows = $dbh->selectall_arrayref(
    'SELECT e.comment_id, COUNT(*), MAX(e.edit_ts) FROM kp_comment_edits e WHERE '
      . $dbh->sql_in('e.comment_id', $comment_ids)
      . ' GROUP BY e.comment_id');
  return {map { $_->[0] => {count => $_->[1], last_edit => $_->[2]} } @$rows};
}

sub list {
  my ($self, $params) = @_;
  my $user   = Bugzilla->login(LOGIN_REQUIRED);
  my $bug_id = $params->{bug_id} // '';
  ThrowUserError('kp_comment_not_found') unless detaint_natural($bug_id);
  Bugzilla::Bug->check($bug_id);
  my $ids = Bugzilla->dbh->selectcol_arrayref('SELECT comment_id FROM longdescs WHERE bug_id = ?', undef, $bug_id);
  my $edits = _summaries($ids);
  return {
    comments => {
      map {
        $_ => {count => $self->type('int', $edits->{$_}{count}), last_edit => $self->type('dateTime', $edits->{$_}{last_edit})}
      } keys %$edits
    }
  };
}

sub history {
  my ($self, $params) = @_;
  my $user = Bugzilla->login(LOGIN_REQUIRED);
  my ($comment) = _visible_comment($user, $params->{comment_id});
  my $rows = Bugzilla->dbh->selectall_arrayref(
    'SELECT e.edit_ts, p.login_name, p.realname, e.old_text FROM kp_comment_edits e
       JOIN profiles p ON p.userid = e.editor_id
      WHERE e.comment_id = ? ORDER BY e.edit_ts DESC, e.id DESC', undef, $comment->id);
  return {
    versions => [
      map {
        {
          replaced_at => $self->type('dateTime', $_->[0]),
          editor      => $self->type('email',    $_->[1]),
          editor_name => $self->type('string',   $_->[2]),
          text        => $self->type('string',   $_->[3]),
        }
      } @$rows
    ]
  };
}

sub update {
  my ($self, $params) = @_;
  my $user = Bugzilla->login(LOGIN_REQUIRED);
  my ($comment, $bug) = _visible_comment($user, $params->{comment_id});

  ThrowUserError('kp_comment_not_yours') unless $comment->author->id == $user->id;
  my $dbh   = Bugzilla->dbh;
  my $first = $dbh->selectrow_array('SELECT MIN(comment_id) FROM longdescs WHERE bug_id = ?', undef, $bug->id);
  ThrowUserError('kp_comment_locked') if $comment->id == $first;
  ThrowUserError('kp_comment_locked') if $comment->type == CMT_DUPE_OF || $comment->type == CMT_HAS_DUPE;
  my $old = $comment->body;
  ThrowUserError('kp_comment_locked') if $old =~ LOCKED_MARKERS;

  my $text = $params->{text} // '';
  $text =~ s/\r\n?/\n/g;
  $text =~ s/\s+$//;
  ThrowUserError('kp_comment_empty') if $text !~ /\S/;
  ThrowUserError('kp_comment_too_long', {max => MAX_TEXT}) if length($text) > MAX_TEXT;
  ThrowUserError('kp_comment_marker') if $text =~ LOCKED_MARKERS;
  return {comment_id => $self->type('int', $comment->id), bug_id => $self->type('int', $bug->id), changed => $self->type('boolean', 0)}
    if $text eq $old;
  trick_taint($text);    # validated above; only ever bound as a placeholder

  $dbh->bz_start_transaction();
  my $now = $dbh->selectrow_array('SELECT LOCALTIMESTAMP(0)');
  $dbh->do('INSERT INTO kp_comment_edits (comment_id, editor_id, edit_ts, old_text) VALUES (?, ?, ?, ?)',
    undef, $comment->id, $user->id, $now, $old);
  $dbh->do('UPDATE longdescs SET thetext = ? WHERE comment_id = ?', undef, $text, $comment->id);
  # lastdiffed first (MySQL assigns left to right), and only when no other change
  # waits for its email - so an edit never sends mail and never swallows one.
  $dbh->do('UPDATE bugs SET lastdiffed = CASE WHEN lastdiffed >= delta_ts THEN ? ELSE lastdiffed END, delta_ts = ? WHERE bug_id = ?',
    undef, $now, $now, $bug->id);
  $bug->_sync_fulltext(update_comments => 1);
  $dbh->bz_commit_transaction();

  Bugzilla->memcached->clear({table => 'longdescs', id => $comment->id});
  Bugzilla->memcached->clear({table => 'bugs',      id => $bug->id});

  my $summary = _summaries([$comment->id])->{$comment->id};
  return {
    comment_id => $self->type('int',      $comment->id),
    bug_id     => $self->type('int',      $bug->id),
    changed    => $self->type('boolean',  1),
    count      => $self->type('int',      $summary->{count}),
    last_edit  => $self->type('dateTime', $summary->{last_edit}),
  };
}

1;
