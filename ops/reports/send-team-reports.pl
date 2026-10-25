#!/usr/bin/perl
# Daily team report - step 3 of 3: emails each team's Excel workbook (built by
# build-team-report.cjs) to its team leader, through Bugzilla's own mailer -
# the same SMTP server and From address as every other Bug Tracker email.
#
#   cd C:\Bugzilla
#   perl D:\...\ops\reports\send-team-reports.pl --dir <out dir>                          (dry run: shows what would go to whom)
#   perl D:\...\ops\reports\send-team-reports.pl --dir <out dir> --send                   (sends to each team leader)
#   perl D:\...\ops\reports\send-team-reports.pl --dir <out dir> --to meera@kpost.in --send   (preview: everything to one address)
#
# --to sends every team's report to that one address instead of the leaders,
# with "[Preview]" in the subject. Sent immediately, not through the queue, so
# a failure shows here.
use 5.14.0;
use strict;
use warnings;
use utf8;

use lib qw(. lib local/lib/perl5);

use Getopt::Long qw(GetOptions);
use JSON::PP;
use File::Spec;
use POSIX qw(strftime);

use Bugzilla;
use Bugzilla::Constants;
use Bugzilla::Mailer qw(MessageToMTA);
use Bugzilla::MIME;
use Email::MIME;

Bugzilla->usage_mode(USAGE_MODE_CMDLINE);
binmode STDOUT, ':utf8';

my ($dir, $to, $send);
GetOptions('dir=s' => \$dir, 'to=s' => \$to, 'send' => \$send) or die "bad options\n";
die "Usage: send-team-reports.pl --dir <out dir> [--to address] [--send]\n" unless $dir;

my $manifest = do {
  open my $fh, '<:raw', File::Spec->catfile($dir, 'manifest.json') or die "manifest.json: $!\n";
  local $/;
  JSON::PP->new->utf8->decode(<$fh>);
};

my $XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
my $sent = 0;
for my $r (@{$manifest->{reports}}) {
  my $recipient = $to // ($r->{leader} ? $r->{leader}{email} : undef);
  unless ($recipient) {
    say "SKIP  $r->{team}: no team leader";
    next;
  }
  my $subject = ($to ? '[Preview] ' : '') . $r->{subject};
  say(($send ? 'SEND  ' : 'DRY   ') . "$r->{team} -> $recipient  ($r->{file})");
  next unless $send;

  my $xlsx = do {
    open my $fh, '<:raw', File::Spec->catfile($dir, $r->{file}) or die "$r->{file}: $!\n";
    local $/;
    <$fh>;
  };
  # A unique Message-ID on the sender's own domain: mail without one is a
  # common spam signal.
  my ($domain) = Bugzilla->params->{mailfrom} =~ /@([^>\s]+)/;
  my $message_id = sprintf('<team-report.%s.%s.%d.%d@%s>', $manifest->{date}, $r->{team} =~ s/\W+/-/gr, time, $$, $domain // 'localhost');
  my $email = Bugzilla::MIME->create(
    header_str => [
      From         => Bugzilla->params->{mailfrom},
      To           => $recipient,
      Subject      => $subject,
      Date         => strftime('%a, %d %b %Y %H:%M:%S %z', localtime),
      'Message-ID' => $message_id,
    ],
    attributes => {content_type => 'multipart/mixed'},
    parts      => [
      Bugzilla::MIME->create(
        attributes => {content_type => 'multipart/alternative'},
        parts      => [
          Bugzilla::MIME->create(
            attributes => {content_type => 'text/plain', charset => 'UTF-8', encoding => 'quoted-printable'},
            body_str   => $r->{text},
          ),
          Bugzilla::MIME->create(
            attributes => {content_type => 'text/html', charset => 'UTF-8', encoding => 'quoted-printable'},
            body_str   => $r->{html},
          ),
        ],
      ),
      # A plain Email::MIME part, NOT Bugzilla::MIME: Bugzilla::MIME::as_string
      # forces every single part to UTF-8 quoted-printable, which turns the
      # file's LF bytes into CRLF and Excel then reports the workbook damaged.
      Email::MIME->create(
        attributes => {content_type => $XLSX, encoding => 'base64', disposition => 'attachment', filename => $r->{file}, name => $r->{file}},
        body       => $xlsx,
      ),
    ],
  );
  MessageToMTA($email, 1);
  $sent++;
}
say $send ? "Sent $sent email(s)." : 'Dry run - nothing sent. Add --send to send.';
