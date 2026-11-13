# AttachmentDelete: removes an attachment for good - its row, its file data,
# its flags and its history - so a tester who uploaded the wrong file can take
# it away and upload the right one. Bugzilla itself can only blank an
# attachment's content (allow_attachment_deletion), keeping the row.
#
# Web service and its REST route:
#   POST /rest/attachment/remove   {id}   -> {removed: {id, bug_id, file_name}}
#
# Who may delete: the person who uploaded the file, or a user administrator
# (editusers / admin). The caller must also be able to see the bug.
#
# Source of truth: ops/bugzilla/extensions/AttachmentDelete in the BUGZILLA-UI repo.
# Install: copy the folder to C:\Bugzilla\extensions\AttachmentDelete. No tables.
package Bugzilla::Extension::AttachmentDelete;

use 5.14.0;
use strict;
use warnings;

use parent qw(Bugzilla::Extension);

our $VERSION = '1.0';

sub webservice {
  my ($self, $args) = @_;
  $args->{dispatch}->{AttachmentDelete} = 'Bugzilla::Extension::AttachmentDelete::WebService';
}

sub webservice_rest_resources {
  my ($self, $args) = @_;
  $args->{resources}->{'Bugzilla::Extension::AttachmentDelete::WebService'}
    = [qr{^/attachment/remove$}, {POST => {method => 'remove'}}];
}

__PACKAGE__->NAME;
