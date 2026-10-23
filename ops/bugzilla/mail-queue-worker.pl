#!/usr/bin/perl
# Sends Bugzilla's queued emails in the background, so saving a bug does not
# wait for the mail server (about 1.5-3 s per recipient over SMTP).
#
# Bugzilla queues mail instead of sending it when the param use_mailer_queue
# is on. Its own runner (jobqueue.pl) does not work on Windows - its pid-file
# locking fails under taint mode - so this does the same work directly: load
# every job type Bugzilla knows, then empty the queue every 2 seconds.
#
# Runs from the Windows scheduled task "Bugzilla mail queue" (at startup, and
# every minute; a second copy never starts while one runs). It exits after an
# hour, or on any error, and the task starts a fresh copy - so a dropped
# database connection or a leak never lasts.
#
# Log: C:\Bugzilla\data\mail-queue-worker.log
# Copy of record: BUGZILLA-UI repo ops/bugzilla/mail-queue-worker.pl
use 5.14.0;
use strict;
use warnings;

use constant BUGZILLA_DIR => 'C:/Bugzilla';
use constant POLL_SECONDS => 2;
use constant MAX_RUN_SECONDS => 3600;

BEGIN { chdir BUGZILLA_DIR or die "cannot cd to " . BUGZILLA_DIR . ": $!\n"; }
use lib (BUGZILLA_DIR, BUGZILLA_DIR . '/lib', BUGZILLA_DIR . '/local/lib/perl5');

use Bugzilla;
use Bugzilla::Constants;
use Bugzilla::JobQueue;
use POSIX qw(strftime);

my $log_file = BUGZILLA_DIR . '/data/mail-queue-worker.log';
sub logline {
  open my $fh, '>>', $log_file or return;
  print $fh strftime('%Y-%m-%d %H:%M:%S', localtime) . " [$$] @_\n";
  close $fh;
}

Bugzilla->usage_mode(USAGE_MODE_CMDLINE);
my $jq = Bugzilla->job_queue;
foreach my $module (values %{Bugzilla::JobQueue->job_map()}) {
  eval "use $module; 1" or do { logline("cannot load $module: $@"); exit 1 };
  $jq->can_do($module);
}
logline('started');

my $started = time;
while (time - $started < MAX_RUN_SECONDS) {
  my $sent = 0;
  my $ok = eval {
    while ($sent < 1000 && $jq->work_once) { $sent++ }
    1;
  };
  logline("processed $sent queued job(s)") if $sent;
  if (!$ok) {
    logline("error, exiting for a fresh start: $@");
    exit 1;
  }
  sleep POLL_SECONDS;
}
logline('hourly restart');
exit 0;
