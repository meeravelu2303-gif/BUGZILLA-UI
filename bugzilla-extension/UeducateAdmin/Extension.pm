package Bugzilla::Extension::UeducateAdmin;

use 5.14.0;
use strict;
use warnings;

use parent qw(Bugzilla::Extension);

our $VERSION = '1.0';

# Registers the WebService module. Its rest_resources() maps the URLs under
# /rest/ueducate/... ; every method re-checks the caller's Bugzilla groups.
sub webservice {
  my ($self, $args) = @_;
  $args->{dispatch}->{UeducateAdmin} = 'Bugzilla::Extension::UeducateAdmin::WebService';
}

__PACKAGE__->NAME;
