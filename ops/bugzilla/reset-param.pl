#!/usr/bin/perl
# Emergency reset of ONE Bugzilla parameter, straight in data/params.json.
#
#   perl reset-param.pl <bugzilla-dir> <param> [new value]     (no value = empty string)
#   perl reset-param.pl D:\Bugzilla shutdownhtml
#   perl reset-param.pl D:\Bugzilla urlbase http://192.168.0.50/
#   perl reset-param.pl D:\Bugzilla ssl_redirect 0
#
# Deliberately does NOT load Bugzilla: with shutdownhtml set, any script that
# loads Bugzilla (except editparams.cgi/checksetup.pl) just prints the shutdown
# page - so the usual SetParam one-liner cannot undo it. This only rewrites the
# JSON file, in the same canonical, pretty format Bugzilla's write_params uses.
# A timestamped backup of params.json is written next to it first.
# Bugzilla reads params.json on every request: no restart, no checksetup.pl.
use strict;
use warnings;
use JSON::PP;
use File::Copy qw(copy);
use POSIX qw(strftime);

my ($dir, $name, $value) = @ARGV;
die "usage: perl reset-param.pl <bugzilla-dir> <param> [new value]\n" unless $dir && $name;
$value //= '';
my $file = "$dir/data/params.json";
-f $file or die "no params file at $file\n";

open my $in, '<:raw', $file or die "cannot read $file: $!\n";
my $json   = do { local $/; <$in> };
close $in;
my $params = JSON::PP->new->decode($json);
exists $params->{$name} or die "'$name' is not a parameter in $file (check the spelling)\n";

my $backup = "$file." . strftime('%Y%m%d-%H%M%S', localtime) . '.bak';
copy($file, $backup) or die "cannot back up to $backup: $!\n";

my $old = $params->{$name};
$params->{$name} = $value;
open my $out, '>:raw', $file or die "cannot write $file: $!\n";
print $out JSON::PP->new->canonical->pretty->encode($params);
close $out;

printf "%s: '%s' -> '%s'\nbackup: %s\n", $name, (ref $old ? join(',', @$old) : $old // ''), $value, $backup;
