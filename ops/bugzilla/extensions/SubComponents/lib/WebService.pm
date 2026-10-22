# Sub-components: a second level under Bugzilla components.
#
# Stored as the values of the custom single-select field cf_subcomponent, whose
# value list is controlled by Component (fielddefs.value_field_id): each value's
# visibility_value_id is the id of the one component it belongs to.
#
# Bugzilla keeps ONE value list per field and values must be unique in it, but
# two components may both want a "Login" sub-component. So the stored value is
# "<name> [<component id>]" - unique, and stable when a component is renamed.
# The Bug Tracker UI shows only <name>.
#
# Writes require editcomponents, the same right as adding a component. The UI's
# backend calls these with its service key after its own permission check.
package Bugzilla::Extension::SubComponents::WebService;

use 5.14.0;
use strict;
use warnings;

use parent qw(Bugzilla::WebService);

use Bugzilla::Constants;
use Bugzilla::Error;
use Bugzilla::Field;
use Bugzilla::Field::Choice;
use Bugzilla::Component;
use Bugzilla::Util qw(trim);

use constant PUBLIC_METHODS => qw(list create update remove purge_orphans remove_component update_component setup_product_access);
use constant READ_ONLY      => qw(list);
use constant FIELD          => 'cf_subcomponent';

sub _field {
  my $field = Bugzilla::Field->new({name => FIELD});
  ThrowCodeError('param_invalid', {function => 'SubComponent', param => FIELD}) unless $field;
  return $field;
}

sub _require_editor {
  my $user = Bugzilla->login(LOGIN_REQUIRED);
  $user->in_group('editcomponents')
    || ThrowUserError('auth_failure', {group => 'editcomponents', action => 'edit', object => 'components'});
  return $user;
}

sub _choice {
  my ($field, $id) = @_;
  my $choice = Bugzilla::Field::Choice->type($field)->new($id);
  ThrowUserError('object_does_not_exist', {id => $id, class => 'Bugzilla::Field::Choice'})
    if !$choice || $choice->name eq '---';
  return $choice;
}

sub _clean_name {
  my ($field, $name) = @_;
  $name = trim($name // '');
  $name =~ s/\s+/ /g;
  ThrowUserError('fieldvalue_undefined', {field => $field}) if $name eq '';
  return $name;
}

sub _describe {
  my ($self, $c) = @_;
  my $value = $c->name;
  my $name  = $value;
  $name =~ s/\s*\[\d+\]\z//;
  return {
    id           => $self->type('int',     $c->id),
    value        => $self->type('string',  $value),
    name         => $self->type('string',  $name),
    component_id => $self->type('int',     $c->{visibility_value_id} // 0),
    is_active    => $self->type('boolean', $c->is_active),
    sortkey      => $self->type('int',     $c->sortkey),
  };
}

sub list {
  my ($self) = @_;
  Bugzilla->login(LOGIN_REQUIRED);
  my $field = _field();
  my @all = grep { $_->name ne '---' } Bugzilla::Field::Choice->type($field)->get_all;
  return {subcomponents => [map { $self->_describe($_) } @all]};
}

sub create {
  my ($self, $params) = @_;
  _require_editor();
  my $field     = _field();
  my $component = Bugzilla::Component->new($params->{component_id} // 0)
    || ThrowUserError('object_does_not_exist', {id => $params->{component_id}, class => 'Bugzilla::Component'});
  my $name   = _clean_name($field, $params->{name});
  my $choice = Bugzilla::Field::Choice->type($field)->create({
    value               => "$name [" . $component->id . "]",
    sortkey             => $params->{sortkey} // 0,
    visibility_value_id => $component->id,
  });
  return {subcomponent => $self->_describe($choice)};
}

sub update {
  my ($self, $params) = @_;
  _require_editor();
  my $field  = _field();
  my $choice = _choice($field, $params->{id} // 0);
  if (defined $params->{name}) {
    my $name = _clean_name($field, $params->{name});
    $choice->set_name("$name [" . ($choice->{visibility_value_id} // 0) . "]");
  }
  $choice->set_is_active($params->{is_active} ? 1 : 0) if defined $params->{is_active};
  $choice->set_sortkey($params->{sortkey}) if defined $params->{sortkey};
  $choice->update();    # a rename also rewrites every bug carrying the old value
  return {subcomponent => $self->_describe($choice)};
}

sub remove {
  my ($self, $params) = @_;
  _require_editor();
  my $field  = _field();
  my $choice = _choice($field, $params->{id} // 0);
  my $desc   = $self->_describe($choice);
  $choice->remove_from_db();    # refused (fieldvalue_still_has_bugs) while any bug uses it
  return {removed => $desc};
}

# Delete a whole component, for callers who may delete components but lack
# editcomponents in Bugzilla (the UI's testers, via the backend's service key).
# Bugzilla::Component::remove_from_db still refuses while the component has
# bugs, is the product's last one, or still owns sub-components.
sub remove_component {
  my ($self, $params) = @_;
  _require_editor();
  my $component = Bugzilla::Component->new($params->{id} // 0)
    || ThrowUserError('object_does_not_exist', {id => $params->{id}, class => 'Bugzilla::Component'});
  my $desc = {
    id      => $self->type('int',    $component->id),
    name    => $self->type('string', $component->name),
    product => $self->type('string', $component->product->name),
  };
  $component->remove_from_db();
  return {removed => $desc};
}

# Edit a component: name, description, default assignee, active flag. Bugzilla
# 5.2's REST has no Component.update. Bugzilla::Component's own validators
# apply (unique name in the product, 64-character limit, assignee must exist).
# Bugs follow a rename automatically - they reference the component by id, and
# so do its sub-components.
sub update_component {
  my ($self, $params) = @_;
  _require_editor();
  my $component = Bugzilla::Component->new($params->{id} // 0)
    || ThrowUserError('object_does_not_exist', {id => $params->{id}, class => 'Bugzilla::Component'});
  $component->set_name(trim($params->{name}))               if defined $params->{name};
  $component->set_description(trim($params->{description})) if defined $params->{description};
  $component->set_default_assignee($params->{default_assignee}) if defined $params->{default_assignee};
  $component->set_is_active($params->{is_active} ? 1 : 0)   if defined $params->{is_active};
  my $changes = $component->update();
  return {
    component => {
      id               => $self->type('int',     $component->id),
      name             => $self->type('string',  $component->name),
      description      => $self->type('string',  $component->description),
      default_assignee => $self->type('string',  $component->default_assignee->login),
      is_active        => $self->type('boolean', $component->is_active),
    },
    changed => [sort keys %{$changes || {}}],
  };
}

# Give a product the access setup every other product on this instance has
# (same as ops/migration/mantis-step1-users-products.pl):
#   - a same-named bug group, required to file (Entry) and set on every bug
#     (Mandatory/Mandatory) - this is how the Bug Tracker scopes product access;
#   - the "Deleted bugs" control (Shown/NA), without which soft delete fails;
#   - direct membership for every tester/admin and the transfer service account,
#     so they keep seeing the product, plus any `extra_members` logins (the
#     first component's owner). Other developers are granted it per person
#     from the Users page. Bugzilla itself makes the admin group inherit the group.
# Idempotent: anything already in place is left alone.
sub setup_product_access {
  my ($self, $params) = @_;
  _require_editor();
  require Bugzilla::Product;
  require Bugzilla::Group;
  require Bugzilla::User;
  my $product = Bugzilla::Product->new($params->{product_id} // 0)
    || ThrowUserError('object_does_not_exist', {id => $params->{product_id}, class => 'Bugzilla::Product'});
  my $dbh = Bugzilla->dbh;
  my %done = (group_created => 0, members_added => 0);

  my $group = Bugzilla::Group->new({name => $product->name});
  unless ($group) {
    $group = Bugzilla::Group->create({
      name        => $product->name,
      description => 'Access scope for the ' . $product->name . ' product.',
      isbuggroup  => 1,
      userregexp  => '',
      isactive    => 1,
    });
    $done{group_created} = 1;
  }

  my %controls = map { $_->{group}->id => 1 } values %{$product->group_controls};
  unless ($controls{$group->id}) {
    $product->set_group_controls($group, {
      entry => 1, membercontrol => CONTROLMAPMANDATORY, othercontrol => CONTROLMAPMANDATORY,
      canedit => 0, editcomponents => 0, editbugs => 0, canconfirm => 0,
    });
  }
  my $deleted = Bugzilla::Group->new({name => 'Deleted bugs'});
  if ($deleted && !$controls{$deleted->id}) {
    $product->set_group_controls($deleted, {
      entry => 0, membercontrol => CONTROLMAPSHOWN, othercontrol => CONTROLMAPNA,
      canedit => 0, editcomponents => 0, editbugs => 0, canconfirm => 0,
    });
  }
  $product->update();

  my $logins = $dbh->selectcol_arrayref(
    "SELECT DISTINCT p.login_name FROM user_group_map m
       JOIN profiles p ON p.userid = m.user_id JOIN groups g ON g.id = m.group_id
      WHERE m.isbless = 0 AND m.grant_type = ? AND g.name IN ('canconfirm','editusers','editcomponents','admin')",
    undef, GRANT_DIRECT);
  push @$logins, 'bugtracker-transfer@kpost.in';
  # Anyone else the caller names - e.g. the developer who owns its first
  # component, who must be able to see the bugs routed to them.
  push @$logins, grep { defined && length } @{ref $params->{extra_members} eq 'ARRAY' ? $params->{extra_members} : []};
  foreach my $login (@$logins) {
    my $user = Bugzilla::User->new({name => $login}) or next;
    next if $dbh->selectrow_array(
      'SELECT 1 FROM user_group_map WHERE user_id = ? AND group_id = ? AND isbless = 0 AND grant_type = ?',
      undef, $user->id, $group->id, GRANT_DIRECT);
    $user->set_groups({add => [$group->name]});
    $user->update();
    $done{members_added}++;
  }

  return {
    product       => $self->type('string',  $product->name),
    group         => $self->type('string',  $group->name),
    group_created => $self->type('boolean', $done{group_created}),
    members_added => $self->type('int',     $done{members_added}),
  };
}

# Values whose component is gone - deleting a product drops its components at
# the database level and leaves their sub-components behind.
sub purge_orphans {
  my ($self) = @_;
  _require_editor();
  my $field = _field();
  my @removed;
  foreach my $c (Bugzilla::Field::Choice->type($field)->get_all) {
    next if $c->name eq '---';
    my $cid = $c->{visibility_value_id};
    next if $cid && Bugzilla::Component->new($cid);
    next if $c->bug_count;
    push @removed, $self->_describe($c);
    $c->remove_from_db();
  }
  return {removed => \@removed};
}

1;
