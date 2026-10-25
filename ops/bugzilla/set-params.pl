#!/usr/bin/perl
# Sets Bugzilla parameters (what Administration > Parameters edits), checked by
# Bugzilla's own validators, and prints each old -> new value.
#
#   cd C:\Bugzilla
#   perl D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\bugzilla\set-params.pl requirelogin=1 createemailregexp=
#
# An empty value after "=" clears the parameter. Back up data\params.json first.
use 5.14.0;
use strict;
use warnings;

use lib qw(. lib local/lib/perl5);

use Bugzilla;
use Bugzilla::Config qw(SetParam write_params);
use Bugzilla::Config::Common;

die "Usage: set-params.pl name=value [name=value ...]\n" unless @ARGV;
my $params = Bugzilla->params;
for my $arg (@ARGV) {
  my ($name, $value) = $arg =~ /^([a-z_]+)=(.*)$/s or die "Not name=value: $arg\n";
  my $old = $params->{$name} // '';
  SetParam($name, $value);    # dies on an unknown name or a value its checker refuses
  say "$name: '$old' -> '$value'";
}
write_params();
say 'Saved.';
