# Staging-only parameters. Must be run with D:\Bugzilla-staging as the working directory.
use 5.14.0; use strict; use warnings; use lib qw(. lib);
use Cwd qw(getcwd);
die "REFUSING: not in Bugzilla-staging (cwd ", getcwd(), ")\n" unless getcwd() =~ m{Bugzilla-staging$}i;
use Bugzilla; use Bugzilla::Config qw(SetParam write_params);
die "REFUSING: localconfig does not point at bugs_staging\n" unless Bugzilla->localconfig->{db_name} eq 'bugs_staging';
my %set = (
  urlbase              => 'http://127.0.0.1:8081/',
  mail_delivery_method => 'None',
  announcehtml         => '<div style="background:#b91c1c;color:#fff;padding:8px 12px;text-align:center;font:bold 14px sans-serif;letter-spacing:.04em">STAGING &mdash; test copy of Bugzilla. Changes here do not affect the live system. No email is sent.</div>',
);
SetParam($_, $set{$_}) for keys %set;
write_params();
say "set $_" for sort keys %set;
