# AttachmentDelete web service: remove one attachment from the database.
#
# What goes:
#   attachments row, and through its ON DELETE CASCADE keys the attach_data
#   (file bytes), flags and bugs_activity rows about that attachment.
#   The "Created attachment N" comment: deleted when it carries no text of its
#   own; when the uploader typed something, the text is kept as a normal
#   comment. The bug's first comment (the description) is never deleted.
# What is added:
#   one history line on the bug - "Attachment file: <name> -> (deleted)" - by
#   the person who deleted it. No email is sent.
package Bugzilla::Extension::AttachmentDelete::WebService;

use 5.14.0;
use strict;
use warnings;

use parent qw(Bugzilla::WebService);

use Bugzilla::Attachment;
use Bugzilla::Bug;
use Bugzilla::Constants;
use Bugzilla::Error;
use Bugzilla::Field qw(get_field_id);
use Bugzilla::Util qw(detaint_natural trim);

use constant PUBLIC_METHODS => qw(remove);

sub remove {
  my ($self, $params) = @_;
  my $user = Bugzilla->login(LOGIN_REQUIRED);

  my $id = $params->{id} // '';
  ThrowUserError('kp_attachment_not_found', {id => $params->{id}}) unless detaint_natural($id);
  my $attachment = Bugzilla::Attachment->new($id);
  ThrowUserError('kp_attachment_not_found', {id => $id}) unless $attachment;
  # A private file is invisible to non-insiders: say "not found", as Bugzilla does.
  ThrowUserError('kp_attachment_not_found', {id => $id}) if $attachment->isprivate && !$user->is_insider;
  my $bug = Bugzilla::Bug->check($attachment->bug_id);    # the caller must be able to see the bug

  my $own = $attachment->attacher->id == $user->id;
  ThrowUserError('kp_attachment_delete_denied', {file_name => $attachment->filename})
    unless $own || $user->in_group('editusers') || $user->in_group('admin');

  my $dbh       = Bugzilla->dbh;
  my $file_name = $attachment->filename;
  my $bug_id    = $attachment->bug_id;

  $dbh->bz_start_transaction();
  my $now = $dbh->selectrow_array('SELECT LOCALTIMESTAMP(0)');
  my ($first_comment) = $dbh->selectrow_array('SELECT MIN(comment_id) FROM longdescs WHERE bug_id = ?', undef, $bug_id);
  my $comments = $dbh->selectall_arrayref(
    'SELECT comment_id, thetext FROM longdescs WHERE bug_id = ? AND type IN (?, ?) AND extra_data = ?',
    undef, $bug_id, CMT_ATTACHMENT_CREATED, CMT_ATTACHMENT_UPDATED, $id);
  for my $comment (@$comments) {
    my ($comment_id, $text) = @$comment;
    if (trim($text // '') eq '' && $comment_id != $first_comment) {
      $dbh->do('DELETE FROM longdescs WHERE comment_id = ?', undef, $comment_id);
    }
    else {
      $dbh->do('UPDATE longdescs SET type = ?, extra_data = NULL WHERE comment_id = ?', undef, CMT_NORMAL, $comment_id);
    }
  }
  $dbh->do('DELETE FROM attachments WHERE attach_id = ?', undef, $id);
  $dbh->do(
    'INSERT INTO bugs_activity (bug_id, who, bug_when, fieldid, removed, added) VALUES (?, ?, ?, ?, ?, ?)',
    undef, $bug_id, $user->id, $now, get_field_id('attachments.filename'), $file_name, '(deleted)');
  # lastdiffed is set first (MySQL assigns left to right) and only moves when no
  # other change is waiting for its email, so this never swallows a pending mail.
  $dbh->do('UPDATE bugs SET lastdiffed = CASE WHEN lastdiffed >= delta_ts THEN ? ELSE lastdiffed END, delta_ts = ? WHERE bug_id = ?',
    undef, $now, $now, $bug_id);
  $bug->_sync_fulltext(update_comments => 1);
  $dbh->bz_commit_transaction();

  Bugzilla->memcached->clear({table => 'attachments', id => $id});
  Bugzilla->memcached->clear({table => 'bugs',        id => $bug_id});

  return {removed => {id => $self->type('int', $id), bug_id => $self->type('int', $bug_id), file_name => $self->type('string', $file_name)}};
}

1;
