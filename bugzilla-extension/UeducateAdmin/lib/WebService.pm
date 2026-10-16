package Bugzilla::Extension::UeducateAdmin::WebService;

# REST endpoints for the admin screens Bugzilla 5.2's own API does not cover.
#
# Every method:
#   - requires a logged-in user and re-checks the same Bugzilla group the
#     native admin page checks (editcomponents, creategroups, ...);
#   - changes data ONLY through Bugzilla's own objects (Bugzilla::Component,
#     Bugzilla::Group, ...), so their validators run and their audit_log
#     entries are written exactly as for the native pages;
#   - is additive: no core file is modified, and creating a "disabled" file in
#     the extension folder removes every endpoint from the next request on.

use 5.14.0;
use strict;
use warnings;

use parent qw(Bugzilla::WebService);

use Bugzilla::Constants;
use Bugzilla::Error;
use Bugzilla::Util qw(detaint_natural trim);
use Bugzilla::Component;
use Bugzilla::Group;
use Bugzilla::Product;
use Bugzilla::User;
use Bugzilla::WebService::Constants;

use constant READ_ONLY => qw(
  component_get
  product_components
  group_usage
);

use constant PUBLIC_METHODS => qw(
  component_get
  component_update
  component_delete
  product_components
  group_usage
  group_delete
);

sub rest_resources {
  my $id = sub { return {id => $_[0]} };
  return [
    qr{^/ueducate/component/(\d+)$},
    {
      GET    => {method => 'component_get',    params => $id},
      PUT    => {method => 'component_update', params => $id},
      DELETE => {method => 'component_delete', params => $id},
    },
    qr{^/ueducate/product/(\d+)/components$},
    {GET => {method => 'product_components', params => $id}},
    qr{^/ueducate/group/(\d+)/usage$},
    {GET => {method => 'group_usage', params => $id}},
    qr{^/ueducate/group/(\d+)$},
    {DELETE => {method => 'group_delete', params => $id}},
  ];
}

###############################################################################
# Helpers
###############################################################################

sub _id {
  my ($params) = @_;
  my $id = $params->{id};
  detaint_natural($id)
    || ThrowCodeError('param_must_be_numeric', {param => 'id', function => 'UeducateAdmin'});
  return $id;
}

# The component, after the same check editcomponents.cgi makes: the caller must
# hold editcomponents (globally or for this product) AND be able to see it.
sub _admin_component {
  my ($params) = @_;
  Bugzilla->login(LOGIN_REQUIRED);
  my $id   = _id($params);
  my $comp = Bugzilla::Component->new($id)
    || ThrowUserError('object_does_not_exist', {id => $id, class => 'Bugzilla::Component'});
  Bugzilla->user->check_can_admin_product($comp->product->name);
  return $comp;
}

sub _creategroups {
  my ($action) = @_;
  Bugzilla->login(LOGIN_REQUIRED);
  Bugzilla->user->in_group('creategroups')
    || ThrowUserError('auth_failure', {group => 'creategroups', action => $action, object => 'group'});
}

sub _component_to_hash {
  my ($self, $comp) = @_;
  my @components = @{$comp->product->components};
  return {
    id                 => $self->type('int',     $comp->id),
    name               => $self->type('string',  $comp->name),
    product_id         => $self->type('int',     $comp->product->id),
    product            => $self->type('string',  $comp->product->name),
    description        => $self->type('string',  $comp->description),
    default_assignee   => $self->type('email',   $comp->default_assignee->login),
    default_qa_contact => $self->type('email',   $comp->default_qa_contact ? $comp->default_qa_contact->login : ''),
    default_cc         => [map { $self->type('email', $_->login) } @{$comp->initial_cc}],
    is_active          => $self->type('boolean', $comp->is_active),
    bug_count          => $self->type('int',     $comp->bug_count),
    # A product must keep at least one component; Bugzilla refuses to delete the last.
    is_last            => $self->type('boolean', scalar(@components) == 1 ? 1 : 0),
    # The useqacontact parameter: when off, Bugzilla ignores any QA contact sent.
    qa_contact_enabled => $self->type('boolean', Bugzilla->params->{useqacontact} ? 1 : 0),
  };
}

###############################################################################
# Components
###############################################################################

sub component_get {
  my ($self, $params) = @_;
  my $comp = _admin_component($params);
  return {component => $self->_component_to_hash($comp)};
}

# Every component of a product, with its bug count - the admin list shows the
# count before anyone reaches for Delete.
sub product_components {
  my ($self, $params) = @_;
  Bugzilla->login(LOGIN_REQUIRED);
  my $id      = _id($params);
  my $product = Bugzilla::Product->new($id)
    || ThrowUserError('object_does_not_exist', {id => $id, class => 'Bugzilla::Product'});
  Bugzilla->user->check_can_admin_product($product->name);
  return {components => [map { $self->_component_to_hash($_) } @{$product->components}]};
}

sub component_update {
  my ($self, $params) = @_;
  my $comp = _admin_component($params);

  # The same setters, in the same order, as editcomponents.cgi's update action.
  $comp->set_name(trim($params->{name}))               if defined $params->{name};
  $comp->set_description($params->{description})       if defined $params->{description};
  $comp->set_default_assignee($params->{default_assignee}) if defined $params->{default_assignee};
  $comp->set_default_qa_contact($params->{default_qa_contact})
    if defined $params->{default_qa_contact};
  if (defined $params->{default_cc}) {
    my $cc = ref $params->{default_cc} eq 'ARRAY' ? $params->{default_cc} : [$params->{default_cc}];
    $comp->set_cc_list([grep { $_ ne '' } map { trim($_) } @$cc]);
  }
  $comp->set_is_active($params->{is_active} ? 1 : 0) if exists $params->{is_active};

  my $changes = $comp->update();

  my %out;
  foreach my $field (keys %$changes) {
    $out{$field} = {
      removed => $self->type('string', $changes->{$field}->[0]),
      added   => $self->type('string', $changes->{$field}->[1]),
    };
  }
  return {component => $self->_component_to_hash(Bugzilla::Component->new($comp->id)), changes => \%out};
}

sub component_delete {
  my ($self, $params) = @_;
  my $comp = _admin_component($params);

  # Checked HERE, before remove_from_db: with the allowbugdeletion parameter on,
  # Component->remove_from_db deletes every bug in the component instead of
  # refusing. Retiring a component with bugs is what "inactive" is for.
  my $count = $comp->bug_count;
  ThrowUserError('component_has_bugs', {nb => $count}) if $count;

  my $name = $comp->name;
  $comp->remove_from_db();    # also refuses the product's last component
  return {deleted => $self->type('boolean', 1), name => $self->type('string', $name)};
}

###############################################################################
# Groups
###############################################################################

# What stands in the way of deleting a group - the same checks
# Group->check_remove makes, returned as data instead of a refusal.
sub group_usage {
  my ($self, $params) = @_;
  _creategroups('delete');
  my $id    = _id($params);
  my $group = Bugzilla::Group->new($id)
    || ThrowUserError('object_does_not_exist', {id => $id, class => 'Bugzilla::Group'});

  my @special = grep { $group->name eq (Bugzilla->params->{$_} // '') } Bugzilla::Group::GROUP_PARAMS();
  my @products = map { $_->{product}->name } @{$group->products};
  my @flags    = map { $_->name } @{$group->flag_types};
  my $bugs     = scalar @{$group->bugs};
  my $members  = scalar @{$group->members_non_inherited};

  my $system    = $group->is_bug_group ? 0 : 1;
  my $deletable = !$system && !@special && !$bugs && !@products && !@flags;

  return {
    id            => $self->type('int',     $group->id),
    name          => $self->type('string',  $group->name),
    is_system     => $self->type('boolean', $system),
    special_roles => [map { $self->type('string', $_) } @special],
    bug_count     => $self->type('int',     $bugs),
    products      => [map { $self->type('string', $_) } @products],
    flag_types    => [map { $self->type('string', $_) } @flags],
    member_count  => $self->type('int',     $members),
    deletable     => $self->type('boolean', $deletable ? 1 : 0),
  };
}

sub group_delete {
  my ($self, $params) = @_;
  _creategroups('delete');
  my $id    = _id($params);
  my $group = Bugzilla::Group->new($id)
    || ThrowUserError('object_does_not_exist', {id => $id, class => 'Bugzilla::Group'});

  # Members are released with the group (that is what deleting it means); bugs,
  # products and flag types that still use it block the delete. check_remove
  # inside remove_from_db also refuses system groups and groups named in a
  # parameter (insidergroup, timetrackinggroup, ...).
  my $name = $group->name;
  $group->remove_from_db({remove_from_users => 1});
  return {deleted => $self->type('boolean', 1), name => $self->type('string', $name)};
}

1;
