# Welcome web service: send one account its welcome email.
#
# The email carries a one-time "Set your password" link - an ordinary Bugzilla
# password token, so the Bug Tracker's /reset-password page accepts it and it
# expires like any reset link (MAX_TOKEN_AGE days, or on first sign-in). The
# password itself is never emailed.
#
# Requires editusers (the same right as creating accounts). `role` and
# `products` only decorate the email; they grant nothing.
package Bugzilla::Extension::Welcome::WebService;

use 5.14.0;
use strict;
use warnings;

use parent qw(Bugzilla::WebService);

use Date::Format qw(time2str);
use Encode;
use Bugzilla::Constants;
use Bugzilla::Error;
use Bugzilla::MIME;
use Bugzilla::Mailer qw(MessageToMTA);
use Bugzilla::Token;
use Bugzilla::User;
use Bugzilla::Util qw(detaint_natural remote_ip trim);

use constant PUBLIC_METHODS => qw(send_welcome);
use constant MAX_PRODUCTS   => 50;

sub send_welcome {
  my ($self, $params) = @_;
  my $admin = Bugzilla->login(LOGIN_REQUIRED);
  $admin->in_group('editusers')
    || ThrowUserError('auth_failure', {group => 'editusers', action => 'edit', object => 'users'});

  my $id = $params->{user_id} // '';
  ThrowUserError('kp_welcome_unknown_user') unless detaint_natural($id);
  my $user = Bugzilla::User->new($id);
  ThrowUserError('kp_welcome_unknown_user') unless $user && $user->id;
  ThrowUserError('kp_welcome_disabled', {login => $user->login}) unless $user->is_enabled;

  my $role     = substr(trim($params->{role} // ''), 0, 40);
  my @products = grep { $_ ne '' } map { substr(trim($_ // ''), 0, 80) } @{ref $params->{products} eq 'ARRAY' ? $params->{products} : []};
  splice(@products, MAX_PRODUCTS) if @products > MAX_PRODUCTS;

  # Bugzilla::Token's own helper; IssuePasswordToken would send the "reset your
  # password" wording and refuses a second link within ten minutes.
  my ($token, $token_ts) = Bugzilla::Token::_create_token($user->id, 'password', remote_ip());
  my $expires = $token_ts + MAX_TOKEN_AGE * 86400;

  my $vars = {
    user       => $user,
    token      => $token,
    role       => $role,
    products   => \@products,
    invited_by => $admin->name || $admin->login,
    expires    => time2str('%e %B %Y, %H:%M', $expires),
    days       => MAX_TOKEN_AGE,
  };
  my $template = Bugzilla->template_inner($user->setting('lang'));
  my ($header, $text, $html) = ('', '', '');
  $template->process('kp/welcome-header.txt.tmpl', $vars, \$header) || ThrowTemplateError($template->error());
  $template->process('kp/welcome.txt.tmpl',        $vars, \$text)   || ThrowTemplateError($template->error());
  $template->process('kp/welcome.html.tmpl',       $vars, \$html)   || ThrowTemplateError($template->error());

  # Same construction as Bugzilla::BugMail::_generate_bugmail.
  my @parts = map {
    Bugzilla::MIME->create(
      attributes   => {content_type => $_->[0], charset => 'UTF-8', encoding => 'quoted-printable'},
      body_str     => $_->[1],
      encode_check => Encode::FB_DEFAULT
    )
  } (['text/plain', $text], ['text/html', $html]);
  my $email = Bugzilla::MIME->new($header);
  $email->content_type_set('multipart/alternative');
  $email->charset_set('UTF-8');
  $email->parts_set(\@parts);
  MessageToMTA($email);

  return {sent_to => $self->type('string', $user->email), expires => $self->type('dateTime', $expires)};
}

1;
