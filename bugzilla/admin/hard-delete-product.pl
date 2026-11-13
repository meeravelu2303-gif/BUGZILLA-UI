#!/usr/bin/perl -T
# HARD-delete one product and everything in it: every bug with its comments,
# attachments, history, CC lists, flags, keywords, dependencies and votes;
# the product's components, versions, milestones and chart series; its
# same-named access group; and the sub-components its components owned.
#
# IRREVERSIBLE inside Bugzilla. Take a full backup first.
#
#   cd C:\Bugzilla
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\bugzilla\hard-delete-product.pl "Product name"            (dry run)
#   perl -T D:\TEST-BENCH-AUTOMATIONS\BUGZILLA-UI\ops\bugzilla\hard-delete-product.pl "Product name" --execute  (deletes)
#
# Uses Bugzilla's own Product->remove_from_db, which deletes each bug through
# Bug->remove_from_db - so every table that references a bug is cleaned the way
# Bugzilla itself does it. `allowbugdeletion` is switched on for THIS process
# only; the site parameter (data/params.json) is not changed.

use 5.14.0;
use strict;
use warnings;

use lib qw(. lib local/lib/perl5);

use Getopt::Long qw(GetOptions);

use Bugzilla;
use Bugzilla::Constants;
use Bugzilla::Product;
use Bugzilla::Group;
use Bugzilla::Field;
use Bugzilla::Field::Choice;

Bugzilla->usage_mode(USAGE_MODE_CMDLINE);
Bugzilla->error_mode(ERROR_MODE_DIE);

my $execute = 0;
GetOptions('execute' => \$execute) or die "Bad arguments\n";
my ($name) = @ARGV;
die "Usage: hard-delete-product.pl \"Product name\" [--execute]\n" unless defined $name && length $name;
($name) = $name =~ /^(.+)$/;    # untaint

my $dbh     = Bugzilla->dbh;
my $product = Bugzilla::Product->new({name => $name}) or die "No product named '$name'\n";
my $pid     = $product->id;
my @bug_ids = @{$product->bug_ids};
my @comp_ids = map { $_->id } @{$product->components};
my ($comments) = @bug_ids ? $dbh->selectrow_array('SELECT COUNT(*) FROM longdescs WHERE ' . $dbh->sql_in('bug_id', \@bug_ids)) : (0);
my ($attachments) = @bug_ids ? $dbh->selectrow_array('SELECT COUNT(*) FROM attachments WHERE ' . $dbh->sql_in('bug_id', \@bug_ids)) : (0);
my ($activity) = @bug_ids ? $dbh->selectrow_array('SELECT COUNT(*) FROM bugs_activity WHERE ' . $dbh->sql_in('bug_id', \@bug_ids)) : (0);
my $group = Bugzilla::Group->new({name => $product->name});
my $subfield = Bugzilla::Field->new({name => 'cf_subcomponent'});
my @subs = $subfield && @comp_ids
  ? grep { my $v = $_->{visibility_value_id}; $v && grep { $_ == $v } @comp_ids } Bugzilla::Field::Choice->type($subfield)->get_all
  : ();

say $execute ? 'MODE        EXECUTE - this deletes permanently' : 'MODE        DRY RUN - nothing is deleted (add --execute)';
say "PRODUCT     $name (id $pid)";
say 'BUGS        ' . scalar(@bug_ids) . (@bug_ids ? " (ids $bug_ids[0] .. $bug_ids[-1])" : '');
say "COMMENTS    $comments";
say "ATTACHMENTS $attachments";
say "HISTORY     $activity activity rows";
say 'COMPONENTS  ' . scalar(@comp_ids) . ' (' . join(', ', map { $_->name } @{$product->components}) . ')';
say 'SUB-COMPS   ' . scalar(@subs);
say 'GROUP       ' . ($group ? $group->name . ' (id ' . $group->id . ', ' . scalar(@{$group->members_direct}) . ' direct members)' : 'none');
exit 0 unless $execute;

# 1. Sub-components first: Bugzilla refuses to delete a component that still controls values.
#    Their bugs are about to be deleted with the product, so clear the value off them first.
if (@subs) {
  $dbh->do('UPDATE bugs SET cf_subcomponent = ? WHERE product_id = ?', undef, '---', $pid);
  $_->remove_from_db() for @subs;
  say 'DONE        ' . scalar(@subs) . ' sub-components removed';
}

# 2. The product, its bugs and everything that hangs off them.
Bugzilla->params->{'allowbugdeletion'} = 1;    # this process only
$product->remove_from_db({delete_series => 1});
say 'DONE        product and ' . scalar(@bug_ids) . ' bugs deleted';

# 3. Its access group - Bugzilla never deletes groups with a product.
if ($group) {
  $group = Bugzilla::Group->new($group->id);    # re-read: the product's controls are gone now
  $group->remove_from_db({remove_from_users => 1, remove_from_bugs => 1, remove_from_flags => 1, remove_from_product => 1});
  say 'DONE        group ' . $group->name . ' deleted';
}

my ($left) = $dbh->selectrow_array('SELECT COUNT(*) FROM bugs WHERE product_id = ?', undef, $pid);
say "CHECK       bugs left in product id $pid: $left";
