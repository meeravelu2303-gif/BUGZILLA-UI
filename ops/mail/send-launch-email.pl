#!/usr/bin/perl -T
# The "our new Bug Tracker is live" email - one personal email per person, with
# their own login - sent through Bugzilla's own mailer (its SMTP settings,
# From address and server), so it arrives exactly like Bugzilla's other mail.
#
#   cd C:\Bugzilla
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\mail\send-launch-email.pl --to prakash@kpost.in            (dry run: shows who and what)
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\mail\send-launch-email.pl --to prakash@kpost.in --send     (sends)
#
# --to can be repeated. Every address sent is appended to sent-launch-email.log
# next to this script, and is skipped on later runs (add --resend to override),
# so a re-run never mails anyone twice.

use 5.14.0;
use strict;
use warnings;
use utf8;

use lib qw(. lib local/lib/perl5);

use Getopt::Long qw(GetOptions);
use File::Basename qw(dirname);
use POSIX qw(strftime);

use Bugzilla;
use Bugzilla::Constants;
use Bugzilla::Mailer qw(MessageToMTA);
use Bugzilla::MIME;
use Bugzilla::User;

Bugzilla->usage_mode(USAGE_MODE_CMDLINE);
Bugzilla->error_mode(ERROR_MODE_DIE);

my (@to, $roles, $send, $resend);
GetOptions('to=s' => \@to, 'roles=s' => \$roles, 'send' => \$send, 'resend' => \$resend) or die "Bad arguments\n";

# --roles tester,developer : every enabled account in those roles, by the same rules as
# the app and ops/bugzilla/set-bulk-password.pl. Admins are never included (their
# password was not reset to the temporary one), nor service / placeholder accounts.
my %SERVICE = map { $_ => 1 } qw(bugtracker-transfer@kpost.in admin@example.com mantis-unknown@mantis.invalid);
if ($roles) {
  my %want = map { lc($_) => 1 } split /\s*,\s*/, $roles;
  my $ids = Bugzilla->dbh->selectcol_arrayref('SELECT userid FROM profiles ORDER BY login_name');
  for my $id (@$ids) {
    my $u = Bugzilla::User->new($id);
    next if !$u->is_enabled || $SERVICE{lc $u->login} || $u->login =~ /\@(mantis\.invalid|example\.com)$/i;
    next if $u->in_group('editusers') || $u->in_group('editcomponents') || $u->in_group('admin');
    my $role = $u->in_group('canconfirm') ? 'tester' : $u->in_group('reporter') ? 'reporter' : 'developer';
    push @to, $u->login if $want{$role};
  }
}
die "Name recipients with --to <login> or --roles tester,developer\n" unless @to;

use constant APP_URL        => 'http://192.168.0.50:5175';
use constant TEMP_PASSWORD  => 'Welcome2026';
use constant CONTACT_NAME   => 'Meera Velu';
use constant CONTACT_EMAIL  => 'meera@kpost.in';
use constant SUBJECT        => 'Our new Bug Tracker is live – your login details';

my ($dir) = dirname(__FILE__) =~ /^(.*)$/;
my $log = "$dir/sent-launch-email.log";
my %already;
if (open my $fh, '<', $log) {
  while (<$fh>) { $already{lc $1} = 1 if /\t(\S+@\S+)\t/ }
  close $fh;
}

say $send ? 'MODE  SEND' : 'MODE  DRY RUN - nothing is sent (add --send)';
for my $login_arg (@to) {
  my ($login) = $login_arg =~ /^([^\s]+)$/ or die "Bad login '$login_arg'\n";
  my $user = Bugzilla::User->new({name => $login}) or do { say "SKIP  $login - no such account"; next };
  if ($user->disabledtext) { say "SKIP  $login - account disabled"; next }
  if ($already{lc $user->login} && !$resend) { say "SKIP  $login - already sent (see $log; --resend to send again)"; next }

  my $first = (split /\s+/, ($user->name || $user->login))[0];
  my ($text, $html) = bodies($first, $user->login);

  my $email = Bugzilla::MIME->create(
    header_str => [
      To         => ($user->name ? $user->name . ' <' . $user->login . '>' : $user->login),
      From       => Bugzilla->params->{'mailfrom'},
      'Reply-To' => CONTACT_NAME . ' <' . CONTACT_EMAIL . '>',
      Subject    => SUBJECT,
    ],
    attributes => {content_type => 'multipart/alternative'},
    parts      => [
      Bugzilla::MIME->create(
        attributes => {content_type => 'text/plain', charset => 'UTF-8', encoding => 'quoted-printable'},
        body_str   => $text,
      ),
      Bugzilla::MIME->create(
        attributes => {content_type => 'text/html', charset => 'UTF-8', encoding => 'quoted-printable'},
        body_str   => $html,
      ),
    ],
  );

  say "TO    " . $user->name . ' <' . $user->login . '>  (greeting: "Hi ' . $first . ',")';
  next unless $send;
  MessageToMTA($email, 1);
  open my $out, '>>', $log or die "Cannot write $log: $!\n";
  print $out strftime('%Y-%m-%d %H:%M:%S', localtime) . "\t" . $user->login . "\t" . $user->name . "\n";
  close $out;
  say "SENT  " . $user->login;
}

sub bodies {
  my ($first, $login) = @_;
  my ($url, $pw, $cn, $ce) = (APP_URL, TEMP_PASSWORD, CONTACT_NAME, CONTACT_EMAIL);

  my $text = <<"TEXT";
Hi $first,

We have moved from Mantis to our new Bug Tracker. From today, please log, follow and update all bugs here.

YOUR LOGIN
  Link:                $url
  Username:            $login
  Temporary password:  $pw

The link works on the office network only, so please connect at the office or over the office Wi-Fi.

FIRST TIME YOU SIGN IN
  1. Open the link and sign in with the username and password above.
  2. Change your password straight away. Click the gear icon at the top right, or your name at the bottom left, then choose "Change password".
  3. Bookmark the link so it is always to hand.

WHAT'S NEW FOR YOU
  - Your Mantis bugs are already here. Their comments, attachments and full history came across too. Each bug now has a number like KPA-1234, and its old Mantis number is shown on the bug, so nothing is lost.
  - Your own dashboard. It opens on the bugs that matter to you: bugs you reported if you test, and bugs assigned to you if you develop.
  - Live updates. When someone changes a bug, your screen updates by itself. There's no need to refresh.
  - Full activity history on every bug. You can see who confirmed it, fixed it, reopened it and verified it, and when.
  - Clearer statuses. Alongside Confirmed, In progress and Resolved, there are now Pending approval, Awaiting requirement and In code review.
  - Filters that fit what you're looking at. Search and filter by product, component, sub-component, severity, status and more. The Excel export works with the same filters.

Forgot your password? Use "Forgot password?" on the sign-in page and a reset link will be emailed to you.

Need help? Contact $cn at $ce. If anything looks wrong or missing, please tell us so we can fix it quickly.

Thank you,
$cn
$ce
TEXT

  my $li = 'margin:0 0 8px 0;';
  my $html = <<"HTML";
<!doctype html>
<html><body style="margin:0;padding:0;background:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:14px;overflow:hidden;font-family:Segoe UI,Arial,sans-serif;color:#0f172a;">
  <tr><td style="background:#2563eb;padding:22px 28px;color:#ffffff;">
    <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.85;">Bug Tracker</div>
    <div style="font-size:22px;font-weight:700;margin-top:4px;">Our new Bug Tracker is live</div>
  </td></tr>
  <tr><td style="padding:26px 28px 8px 28px;font-size:15px;line-height:1.6;">
    <p style="margin:0 0 14px 0;">Hi $first,</p>
    <p style="margin:0 0 18px 0;">We have moved from Mantis to our new <strong>Bug Tracker</strong>. From today, please log, follow and update all bugs here.</p>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;">
      <tr><td style="padding:16px 18px;font-size:14px;line-height:1.9;">
        <div style="font-weight:700;color:#1e40af;margin-bottom:4px;">Your login</div>
        <div><span style="color:#475569;display:inline-block;width:150px;">Link</span><a href="$url" style="color:#2563eb;font-weight:600;">$url</a></div>
        <div><span style="color:#475569;display:inline-block;width:150px;">Username</span><strong>$login</strong></div>
        <div><span style="color:#475569;display:inline-block;width:150px;">Temporary password</span><strong style="font-family:Consolas,monospace;">$pw</strong></div>
      </td></tr>
    </table>
    <p style="margin:10px 0 0 0;font-size:13px;color:#64748b;">The link works on the office network only, so please connect at the office or over the office Wi-Fi.</p>

    <p style="margin:22px 0 14px 0;text-align:center;">
      <a href="$url" style="background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 26px;border-radius:999px;display:inline-block;">Open the Bug Tracker</a>
    </p>

    <h3 style="font-size:16px;margin:22px 0 8px 0;">First time you sign in</h3>
    <ol style="margin:0 0 6px 0;padding-left:20px;">
      <li style="$li">Open the link and sign in with the username and password above.</li>
      <li style="$li">Change your password straight away. Click the &#9881; icon at the top right, or your name at the bottom left, then choose <strong>Change password</strong>.</li>
      <li style="$li">Bookmark the link so it is always to hand.</li>
    </ol>

    <h3 style="font-size:16px;margin:22px 0 8px 0;">What's new for you</h3>
    <ul style="margin:0;padding-left:20px;">
      <li style="$li"><strong>Your Mantis bugs are already here.</strong> Their comments, attachments and full history came across too. Each bug now has a number like <strong>KPA-1234</strong>, and its old Mantis number is shown on the bug, so nothing is lost.</li>
      <li style="$li"><strong>Your own dashboard.</strong> It opens on the bugs that matter to you: bugs you reported if you test, and bugs assigned to you if you develop.</li>
      <li style="$li"><strong>Live updates.</strong> When someone changes a bug, your screen updates by itself. There's no need to refresh.</li>
      <li style="$li"><strong>Full activity history on every bug.</strong> You can see who confirmed it, fixed it, reopened it and verified it, and when.</li>
      <li style="$li"><strong>Clearer statuses.</strong> Alongside Confirmed, In progress and Resolved, there are now <strong>Pending approval</strong>, <strong>Awaiting requirement</strong> and <strong>In code review</strong>.</li>
      <li style="$li"><strong>Filters that fit what you're looking at.</strong> Search and filter by product, component, sub-component, severity, status and more. The Excel export works with the same filters.</li>
    </ul>

    <p style="margin:20px 0 10px 0;"><strong>Forgot your password?</strong> Use <strong>Forgot password?</strong> on the sign-in page and a reset link will be emailed to you.</p>
    <p style="margin:0 0 20px 0;"><strong>Need help?</strong> Contact $cn at <a href="mailto:$ce" style="color:#2563eb;">$ce</a>. If anything looks wrong or missing, please tell us so we can fix it quickly.</p>

    <p style="margin:0 0 24px 0;">Thank you,<br><strong>$cn</strong><br><a href="mailto:$ce" style="color:#2563eb;">$ce</a></p>
  </td></tr>
</table>
</td></tr>
</table>
</body></html>
HTML
  return ($text, $html);
}
