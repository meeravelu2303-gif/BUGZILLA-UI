# Registers the SubComponent web service and its REST routes:
#
#   GET  /rest/subcomponent          list every sub-component
#   POST /rest/subcomponent          create  {component_id, name, sortkey?}
#   POST /rest/subcomponent/update   update  {id, name?, is_active?, sortkey?}
#   POST /rest/subcomponent/remove   delete  {id}            (refused while bugs use it)
#   POST /rest/subcomponent/purge    delete values whose component no longer exists
#   POST /rest/subcomponent/component/remove  delete a component {id} (Bugzilla's own refusals apply)
#   POST /rest/subcomponent/component/update  edit a component {id, name?, description?, default_assignee?, is_active?}
#   POST /rest/subcomponent/product/setup     give a product its access group + controls {product_id}
#
# Source of truth: ops/bugzilla/extensions/SubComponents in the BUGZILLA-UI repo.
# Install: copy the folder to C:\Bugzilla\extensions\SubComponents.
package Bugzilla::Extension::SubComponents;

use 5.14.0;
use strict;
use warnings;

use parent qw(Bugzilla::Extension);

use Bugzilla::WebService::Constants qw(STATUS_CREATED);

our $VERSION = '1.0';

sub webservice {
  my ($self, $args) = @_;
  $args->{dispatch}->{SubComponent} = 'Bugzilla::Extension::SubComponents::WebService';
}

sub webservice_rest_resources {
  my ($self, $args) = @_;
  $args->{resources}->{'Bugzilla::Extension::SubComponents::WebService'} = [
    qr{^/subcomponent$},
    {GET => {method => 'list'}, POST => {method => 'create', success_code => STATUS_CREATED}},
    qr{^/subcomponent/update$}, {POST => {method => 'update'}},
    qr{^/subcomponent/remove$}, {POST => {method => 'remove'}},
    qr{^/subcomponent/purge$},  {POST => {method => 'purge_orphans'}},
    qr{^/subcomponent/component/remove$}, {POST => {method => 'remove_component'}},
    qr{^/subcomponent/component/update$}, {POST => {method => 'update_component'}},
    qr{^/subcomponent/product/setup$}, {POST => {method => 'setup_product_access'}},
  ];
}

__PACKAGE__->NAME;
