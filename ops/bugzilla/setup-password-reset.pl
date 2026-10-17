#!/usr/bin/perl -T
# One-time Bugzilla configuration for Forgot Password in the Bug Tracker UI.
#
#   cd C:\Bugzilla
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\bugzilla\setup-password-reset.pl --app-url http://192.168.0.50:5175
#   perl -T ...\setup-password-reset.pl --uninstall      go back to Bugzilla's own reset page
#
# The UI drives Bugzilla's native reset flow (token.cgi). Bugzilla writes the
# email itself from template/en/default/account/password/forgotten-password.txt.tmpl,
# whose link opens Bugzilla's own "Change Password" page. This installs a copy
# under template/en/custom/ - the directory Bugzilla searches first - whose link
# opens the Bug Tracker's /reset-password page instead. Nothing in default/ is
# touched, so a Bugzilla upgrade cannot overwrite it.
#
# Also checks the two things the flow needs from Bugzilla's parameters:
#   user_verify_class must include DB (otherwise "password_change_requests_not_allowed")
#   mail_delivery_method must not be None (see setup-smtp.pl)

use 5.14.0;
use strict;
use warnings;

use lib qw(. lib local/lib/perl5);

use File::Basename qw(dirname);
use File::Path qw(make_path);
use Getopt::Long qw(GetOptions);

use Bugzilla;
use Bugzilla::Constants;

Bugzilla->usage_mode(USAGE_MODE_CMDLINE);

my ($app_url, $uninstall);
GetOptions('app-url=s' => \$app_url, 'uninstall' => \$uninstall) or die "Bad arguments\n";

my $template_dir = bz_locations()->{templatedir};
my $custom = "$template_dir/en/custom/account/password/forgotten-password.txt.tmpl";

if ($uninstall) {
  if (-e $custom) {
    unlink $custom or die "Cannot remove $custom: $!\n";
    say "removed $custom";
  }
  else {
    say "ok      no custom template installed";
  }
  exit 0;
}

die "Usage: perl -T setup-password-reset.pl --app-url http://host:port\n" unless $app_url;
($app_url) = $app_url =~ m{^(https?://[A-Za-z0-9.\-]+(?::\d{1,5})?(?:/[A-Za-z0-9._~\-/]*)?)/?$}
  or die "Bad --app-url (expected http://host[:port][/path]): $app_url\n";

my $reset_url = "$app_url/reset-password?t=";

# Everything Bugzilla's default template has (IssuePasswordToken in Bugzilla::Token
# supplies emailaddress, token, ip_addr, expiration_ts, timezone), with the link
# pointed at the app and the wording made plain. The cancel link stays on Bugzilla:
# cancelling a token needs no UI of its own.
my $template = <<"TMPL";
[%# Installed by BUGZILLA-UI/ops/bugzilla/setup-password-reset.pl.
  # Overrides template/en/default/account/password/forgotten-password.txt.tmpl so the
  # reset link opens the Bug Tracker UI. Re-run that script to change the app URL.
  #%]
From: [% Param('mailfrom') %]
To: [% emailaddress %]
Subject: Reset your Bug Tracker password
X-Bugzilla-Type: admin

Someone - hopefully you - asked to reset the password for [% emailaddress %]
on the Bug Tracker.

To choose a new password, open this link:

${reset_url}[% token FILTER uri %]

The link works once and expires after [% constants.MAX_TOKEN_AGE %] days
(on [% expiration_ts FILTER time("%B %e, %Y at %H:%M %Z", timezone) %]), or as
soon as you sign in successfully.

If you did not ask for this, you can ignore this email: your password will not
change. To cancel the request explicitly, open:

[%+ urlbase %]token.cgi?t=[% token FILTER uri %]&a=cxlpw

If you think someone is trying to get into your account, tell
[%+ Param('maintainer') %].
TMPL

make_path(dirname($custom));
open my $fh, '>:encoding(UTF-8)', $custom or die "Cannot write $custom: $!\n";
print $fh $template;
close $fh;
say "written $custom";
say "        reset link -> ${reset_url}<token>";

my $params = Bugzilla->params;
if ($params->{user_verify_class} !~ /\bDB\b/) {
  say "WARNING user_verify_class = '$params->{user_verify_class}' does not include DB: Bugzilla refuses password reset requests";
}
else {
  say "ok      user_verify_class includes DB";
}
if ($params->{mail_delivery_method} eq 'None') {
  say "WARNING mail_delivery_method = None: no email is sent. Run setup-smtp.pl first";
}
else {
  say "ok      mail_delivery_method = $params->{mail_delivery_method} via $params->{smtpserver}";
}
if ($params->{urlbase} !~ m{^https?://}) {
  say "WARNING urlbase is not set; the cancel link in the email will be broken";
}
