#!/usr/bin/perl -T
# Configures Bugzilla's outbound mail (SMTP) and sends a test message.
#
#   cd C:\Bugzilla
#   set BZ_SMTP_PASSWORD=<app password>
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\bugzilla\setup-smtp.pl ^
#        --server smtp.gmail.com:465 --ssl ssl --user you@gmail.com ^
#        --from "Bug Tracker <you@gmail.com>" --test you@example.com
#
#   perl -T ...\setup-smtp.pl --status                  show the current settings
#   perl -T ...\setup-smtp.pl --test someone@example.com  send a test with the current settings
#   perl -T ...\setup-smtp.pl --off                     stop sending mail (mail_delivery_method = None)
#
# Bugzilla sends every notification - and the password reset link - through
# Bugzilla::Mailer, which reads these parameters. With mail_delivery_method=None
# (the shipped default on this install) Bugzilla reports "a token has been
# emailed" and sends nothing, so this must be set before Forgot Password works.
#
# The password is read from the environment (BZ_SMTP_PASSWORD) by default so it
# never lands in the shell history; --password is accepted for scripted use.
#
# --ssl takes:  ssl       SMTPS, usually port 465 (Gmail, Outlook.com, most providers)
#               starttls  plain connection upgraded with STARTTLS, usually port 587
#               none      no encryption (an internal relay on the LAN)
#
# This writes data/params.json the same way editparams.cgi does. Re-running
# only changes the parameters given.

use 5.14.0;
use strict;
use warnings;

use lib qw(. lib local/lib/perl5);

use Getopt::Long qw(GetOptions);

use Bugzilla;
use Bugzilla::Constants;
use Bugzilla::Config qw(SetParam write_params);
use Bugzilla::Mailer;

Bugzilla->usage_mode(USAGE_MODE_CMDLINE);

my ($server, $from, $user, $password, $ssl, $test, $status, $off, $queue, $debug);
GetOptions(
  'server=s'   => \$server,
  'from=s'     => \$from,
  'user=s'     => \$user,
  'password=s' => \$password,
  'ssl=s'      => \$ssl,
  'test=s'     => \$test,
  'status'     => \$status,
  'off'        => \$off,
  'queue!'     => \$queue,
  'debug!'     => \$debug,
) or die "Bad arguments\n";

$password //= $ENV{BZ_SMTP_PASSWORD};

sub untaint {
  my ($value, $pattern, $what) = @_;
  return undef unless defined $value;
  my ($clean) = $value =~ $pattern or die "Bad $what: $value\n";
  return $clean;
}

my $params  = Bugzilla->params;
my $changed = 0;

if ($off) {
  SetParam('mail_delivery_method', 'None');
  $changed++;
  say "set     mail_delivery_method = None (Bugzilla will send no email)";
}

if (defined $server) {
  $server = untaint($server, qr/^([A-Za-z0-9.\-]+(?::\d{1,5})?)$/, 'server');
  SetParam('smtpserver', $server);
  SetParam('mail_delivery_method', 'SMTP');
  $changed++;
  say "set     smtpserver = $server, mail_delivery_method = SMTP";
}

if (defined $from) {
  $from = untaint($from, qr/^([^\r\n]+)$/, 'from address');
  SetParam('mailfrom', $from);
  $changed++;
  say "set     mailfrom = $from";
}

if (defined $user) {
  $user = untaint($user, qr/^([^\r\n]*)$/, 'user');
  SetParam('smtp_username', $user);
  $changed++;
  say "set     smtp_username = " . ($user eq '' ? '(none)' : $user);
}

if (defined $password) {
  $password = untaint($password, qr/^([^\r\n]*)$/, 'password');
  SetParam('smtp_password', $password);
  $changed++;
  say "set     smtp_password = " . ($password eq '' ? '(none)' : '********');
}

if (defined $ssl) {
  $ssl = lc untaint($ssl, qr/^(ssl|starttls|none)$/i, '--ssl value (ssl|starttls|none)');
  # Email::Sender::Transport::SMTP 2.x takes ssl => 1 (SMTPS) or 'starttls'. Bugzilla
  # passes the parameter straight through, so 'starttls' works at runtime even though
  # editparams.cgi only shows the box as on/off (saving there would turn it into 1).
  # Set directly: SetParam's checker insists on the long-obsolete Net::SMTP::SSL
  # module, which Email::Sender has not needed since Net::SMTP 3.
  $params->{smtp_ssl} = $ssl eq 'ssl' ? 1 : $ssl eq 'starttls' ? 'starttls' : 0;
  $changed++;
  say "set     smtp_ssl = $params->{smtp_ssl}";
}

if (defined $queue) {
  SetParam('use_mailer_queue', $queue ? 1 : 0);
  $changed++;
  say "set     use_mailer_queue = " . ($queue ? 1 : 0) . ($queue ? " (jobqueue.pl must be running)" : "");
}

if (defined $debug) {
  SetParam('smtp_debug', $debug ? 1 : 0);
  $changed++;
  say "set     smtp_debug = " . ($debug ? 1 : 0);
}

if ($changed) {
  write_params();
  say "saved   data/params.json";
}

if ($status || !$changed && !$test) {
  $params = Bugzilla->params;
  say "";
  say "mail_delivery_method  $params->{mail_delivery_method}";
  say "smtpserver            $params->{smtpserver}";
  say "smtp_username         " . ($params->{smtp_username} eq '' ? '(none)' : $params->{smtp_username});
  say "smtp_password         " . ($params->{smtp_password} eq '' ? '(none)' : '********');
  say "smtp_ssl              $params->{smtp_ssl}";
  say "mailfrom              $params->{mailfrom}";
  say "use_mailer_queue      $params->{use_mailer_queue}";
  say "urlbase               $params->{urlbase}";
  if ($params->{mail_delivery_method} eq 'None') {
    say "";
    say "WARNING mail is off: password reset emails are NOT sent. Configure --server to enable.";
  }
}

if (defined $test) {
  $test = untaint($test, qr/^([^\s@]+@[^\s@]+)$/, 'test recipient');
  $params = Bugzilla->params;
  die "Cannot test: mail_delivery_method is None\n" if $params->{mail_delivery_method} eq 'None';

  my $message = join("\n",
    "From: $params->{mailfrom}",
    "To: $test",
    "Subject: [Bugzilla] SMTP test from setup-smtp.pl",
    "X-Bugzilla-Type: admin",
    "",
    "If you can read this, Bugzilla at $params->{urlbase} can send email",
    "through $params->{smtpserver} (ssl=$params->{smtp_ssl}).",
    "",
    "Password reset links from the Bug Tracker will arrive the same way.",
    "");

  say "";
  say "sending test message to $test ...";
  eval { MessageToMTA($message, 1); };    # send_now: bypass the queue and any transaction staging
  if (my $err = $@) {
    my $text = ref $err && $err->can('message') ? $err->message : "$err";
    die "FAILED  $text\n";
  }
  say "ok      accepted by $params->{smtpserver} - check the inbox (and spam folder) of $test";
}
