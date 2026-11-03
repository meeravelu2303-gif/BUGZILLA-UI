# Welcome: emails a new account its sign-in address and a "Set your password"
# link, so the person can start without the admin passing a password around.
#
# Web service and its REST route:
#   POST /rest/welcome   {user_id, role?, products?[]}  -> {sent_to, expires}
#
# The mail goes through Bugzilla's own mailer (MessageToMTA), so it uses the
# same SMTP server, sender, SPF/DKIM and mail queue as every bug email.
# Templates: template/en/default/kp/welcome.{txt,html}.tmpl (app address in them).
#
# Source of truth: ops/bugzilla/extensions/Welcome in the BUGZILLA-UI repo.
# Install: copy the folder to C:\Bugzilla\extensions\Welcome. No tables.
package Bugzilla::Extension::Welcome;

use 5.14.0;
use strict;
use warnings;

use parent qw(Bugzilla::Extension);

our $VERSION = '1.0';

sub webservice {
  my ($self, $args) = @_;
  $args->{dispatch}->{Welcome} = 'Bugzilla::Extension::Welcome::WebService';
}

sub webservice_rest_resources {
  my ($self, $args) = @_;
  $args->{resources}->{'Bugzilla::Extension::Welcome::WebService'} = [qr{^/welcome$}, {POST => {method => 'send_welcome'}}];
}

__PACKAGE__->NAME;
