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
use Bugzilla::Field;
use Bugzilla::Field::Choice;
use Bugzilla::Group;
use Bugzilla::Product;
use Bugzilla::Status;
use Bugzilla::User;
use Bugzilla::WebService::Constants;

use constant READ_ONLY => qw(
  component_get
  product_components
  group_usage
  field_values
  workflow_get
);

use constant PUBLIC_METHODS => qw(
  component_get
  component_update
  component_delete
  product_components
  group_usage
  group_delete
  field_values
  field_value_create
  field_value_update
  field_value_delete
  field_values_reorder
  workflow_get
  workflow_update
);

# The standard single-select fields the admin UI manages. Anything else (custom
# fields, keywords, ...) stays out of reach of these endpoints.
use constant EDITABLE_FIELDS => qw(bug_severity priority bug_status resolution op_sys rep_platform);

sub rest_resources {
  my $id = sub { return {id => $_[0]} };
  my $field = sub { return {field => $_[0]} };
  my $field_value = sub { return {field => $_[0], id => $_[1]} };
  return [
    qr{^/ueducate/field/(\w+)/values$},
    {
      GET  => {method => 'field_values',       params => $field},
      POST => {method => 'field_value_create', params => $field, success_code => STATUS_CREATED},
    },
    qr{^/ueducate/field/(\w+)/values/(\d+)$},
    {
      PUT    => {method => 'field_value_update', params => $field_value},
      DELETE => {method => 'field_value_delete', params => $field_value},
    },
    qr{^/ueducate/field/(\w+)/order$},
    {PUT => {method => 'field_values_reorder', params => $field}},
    qr{^/ueducate/workflow$},
    {GET => {method => 'workflow_get'}, PUT => {method => 'workflow_update'}},
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

###############################################################################
# Field values (editvalues.cgi)
###############################################################################

# editvalues.cgi and editworkflow.cgi both require the admin group.
sub _admin {
  my ($object) = @_;
  Bugzilla->login(LOGIN_REQUIRED);
  Bugzilla->user->in_group('admin')
    || ThrowUserError('auth_failure', {group => 'admin', action => 'edit', object => $object});
}

# The field, restricted to EDITABLE_FIELDS, and its value class
# (Bugzilla::Status for bug_status, a Field::Choice subclass otherwise).
sub _field_and_class {
  my ($params) = @_;
  my $name = $params->{field} // '';
  grep { $_ eq $name } EDITABLE_FIELDS
    or ThrowUserError('fieldname_invalid', {field => {name => $name}});
  my $field = Bugzilla::Field->check($name);
  return ($field, Bugzilla::Field::Choice->type($field));
}

sub _value_or_throw {
  my ($class, $id) = @_;
  detaint_natural($id)
    || ThrowCodeError('param_must_be_numeric', {param => 'id', function => 'UeducateAdmin'});
  return $class->new($id)
    || ThrowUserError('object_does_not_exist', {id => $id, class => $class});
}

sub _value_to_hash {
  my ($self, $field, $value) = @_;
  my $param = $value->DEFAULT_MAP->{$field->name};

  # Why it cannot be deleted - the same conditions, in the same order, as
  # Field::Choice->remove_from_db, so the UI can say so before anyone tries.
  my $count = $value->bug_count;
  my $controls = scalar(@{$value->controls_visibility_of_fields}) + scalar(@{$value->controlled_values_array});
  my $blocker
    = $value->is_default ? "default value (the $param parameter)"
    : $value->is_static  ? 'built into Bugzilla'
    : $count             ? 'in use'
    : $controls          ? 'controls the visibility of other fields or values'
    :                      '';

  my %h = (
    id           => $self->type('int',     $value->id),
    name         => $self->type('string',  $value->name),
    sortkey      => $self->type('int',     $value->sortkey),
    is_active    => $self->type('boolean', $value->is_active),
    bug_count    => $self->type('int',     $count),
    is_default   => $self->type('boolean', $value->is_default),
    is_static    => $self->type('boolean', $value->is_static),
    delete_block => $self->type('string',  $blocker),
  );
  $h{is_open} = $self->type('boolean', $value->is_open) if $field->name eq 'bug_status';
  return \%h;
}

sub field_values {
  my ($self, $params) = @_;
  _admin('field_values');
  my ($field, $class) = _field_and_class($params);
  my @values = sort { $a->sortkey <=> $b->sortkey || lc($a->name) cmp lc($b->name) } $class->get_all;
  return {
    field  => $self->type('string', $field->name),
    label  => $self->type('string', $field->description),
    values => [map { $self->_value_to_hash($field, $_) } @values],
  };
}

sub field_value_create {
  my ($self, $params) = @_;
  _admin('field_values');
  my ($field, $class) = _field_and_class($params);

  # Without a sortkey a new value goes to the END of the list (highest + 100),
  # not to the top, which is where Bugzilla's default of 0 would put it.
  my $max = 0;
  $_->sortkey > $max and $max = $_->sortkey for $class->get_all;
  my %create = (value => $params->{value}, sortkey => $params->{sortkey} // $max + 100);
  # A status is open or closed for life - Bugzilla offers no way to change it later.
  $create{is_open} = $params->{is_open} ? 1 : 0 if $field->name eq 'bug_status';

  # Field::Choice->create validates (name, length, duplicates, reserved words)
  # and writes the audit_log entry. Status->create also adds the transitions
  # into duplicate_or_move_bug_status that Bugzilla requires.
  my $value = $class->create(\%create);
  return {value => $self->_value_to_hash($field, $class->new($value->id))};
}

sub field_value_update {
  my ($self, $params) = @_;
  _admin('field_values');
  my ($field, $class) = _field_and_class($params);
  my $value = _value_or_throw($class, $params->{id});

  # The same setters as editvalues.cgi. A rename also rewrites every bug that
  # carries the old value, and the default parameter if it pointed at it
  # (Field::Choice->update) - that is Bugzilla's behaviour, not ours.
  $value->set_name(trim($params->{value}))          if defined $params->{value};
  $value->set_sortkey($params->{sortkey})           if defined $params->{sortkey};
  $value->set_is_active($params->{is_active} ? 1 : 0) if exists $params->{is_active};
  my $changes = $value->update();

  return {
    value   => $self->_value_to_hash($field, $class->new($value->id)),
    changes => [map { $self->type('string', $_) } sort keys %$changes],
  };
}

sub field_value_delete {
  my ($self, $params) = @_;
  _admin('field_values');
  my ($field, $class) = _field_and_class($params);
  my $value = _value_or_throw($class, $params->{id});
  my $name  = $value->name;

  # remove_from_db refuses default, static, in-use (with the bug count) and
  # controlling values - exactly what editvalues.cgi refuses.
  $value->remove_from_db();
  return {deleted => $self->type('boolean', 1), name => $self->type('string', $name)};
}

# Puts the values in the order given. Every value of the field must be listed
# once, so a stale screen cannot silently drop one.
sub field_values_reorder {
  my ($self, $params) = @_;
  _admin('field_values');
  my ($field, $class) = _field_and_class($params);

  my @ids = @{$params->{ids} || []};
  my %all = map { $_->id => $_ } $class->get_all;
  my %seen;
  (@ids == keys %all && !grep { !$all{$_} || $seen{$_}++ } @ids)
    || ThrowCodeError('param_invalid', {param => 'ids', function => 'UeducateAdmin.field_values_reorder'});

  # Reuse the field's own sortkeys, handed out in the new order: a no-op reorder
  # changes nothing and existing spacing (100, 200, ...) is kept. Only when the
  # current keys collide (e.g. all 0) are fresh ones assigned, 100 apart.
  my @slots = sort { $a <=> $b } map { $_->sortkey } values %all;
  my %uniq   = map { $_ => 1 } @slots;
  @slots = map { $_ * 100 } 1 .. scalar(@ids) if keys(%uniq) != @slots;

  my $dbh = Bugzilla->dbh;
  $dbh->bz_start_transaction();
  for my $i (0 .. $#ids) {
    my $value = $all{$ids[$i]};
    next if $value->sortkey == $slots[$i];
    $value->set_sortkey($slots[$i]);
    $value->update();
  }
  $dbh->bz_commit_transaction();
  return $self->field_values({field => $field->name});
}

###############################################################################
# Status workflow (editworkflow.cgi)
###############################################################################

sub _workflow_rows {
  my $rows = Bugzilla->dbh->selectall_arrayref(
    'SELECT old_status, new_status, require_comment FROM status_workflow');
  my %wf;
  $wf{$_->[0] // 0}{$_->[1]} = $_->[2] for @$rows;
  return \%wf;
}

sub workflow_get {
  my ($self) = @_;
  _admin('workflow');
  my $wf = _workflow_rows();
  my @statuses = sort { $a->sortkey <=> $b->sortkey || $a->id <=> $b->id } Bugzilla::Status->get_all;
  my @transitions;
  foreach my $from (sort { $a <=> $b } keys %$wf) {
    foreach my $to (sort { $a <=> $b } keys %{$wf->{$from}}) {
      push @transitions, {
        from            => $self->type('int',     $from),
        to              => $self->type('int',     $to),
        require_comment => $self->type('boolean', $wf->{$from}{$to}),
      };
    }
  }
  return {
    statuses => [map { {
      id        => $self->type('int',     $_->id),
      name      => $self->type('string',  $_->name),
      is_open   => $self->type('boolean', $_->is_open),
      is_active => $self->type('boolean', $_->is_active),
    } } @statuses],
    transitions      => \@transitions,
    duplicate_status => $self->type('string', Bugzilla->params->{duplicate_or_move_bug_status}),
  };
}

# Applies an explicit diff - { add => [{from,to,require_comment}], remove =>
# [{from,to}], comment => [{from,to,require_comment}] } - rather than a whole
# matrix. from = 0 is "bug creation" (NULL old_status, as in editworkflow.cgi).
#
# Unlike editworkflow.cgi's full-matrix save, nothing outside the diff is
# touched: editworkflow.cgi re-adds every transition into
# duplicate_or_move_bug_status on each save, which here would silently change
# rows the reviewer never saw in the summary. Removing one of those is refused
# instead, for the same reason Bugzilla forces them: marking a bug as a
# duplicate must be possible from any status.
sub workflow_update {
  my ($self, $params) = @_;
  _admin('workflow');

  my %status = map { $_->id => $_ } Bugzilla::Status->get_all;
  my $dupe   = Bugzilla::Status->new({name => Bugzilla->params->{duplicate_or_move_bug_status}});
  my $wf     = _workflow_rows();
  my $bad    = sub { ThrowCodeError('param_invalid', {param => $_[0], function => 'UeducateAdmin.workflow_update'}) };

  # The regex captures also untaint the ids: Bugzilla runs under perl -T, and
  # DBI refuses request data in SQL until it has been through a match like this.
  my $pair = sub {
    my ($t, $what) = @_;
    my ($from) = ($t->{from} // 0) =~ /^(\d+)$/;
    my ($to)   = ($t->{to} // '')  =~ /^(\d+)$/;
    $bad->("$what.from") unless defined $from && ($from == 0 || $status{$from});
    $bad->("$what.to")   unless defined $to && $status{$to};
    $bad->("$what: a status cannot transition to itself") if $from == $to;
    return ($from + 0, $to + 0);
  };

  my $dbh = Bugzilla->dbh;
  my $now = $dbh->selectrow_array('SELECT LOCALTIMESTAMP(0)');
  my $uid = Bugzilla->user->id;
  my @applied;
  my $label = sub { my ($f, $t) = @_; ($f ? $status{$f}->name : '(new bug)') . ' -> ' . $status{$t}->name };
  my $audit = sub {
    my ($from, $to, $removed, $added) = @_;
    $dbh->do('INSERT INTO audit_log (user_id, class, object_id, field, removed, added, at_time)
              VALUES (?, ?, ?, ?, ?, ?, ?)', undef,
      $uid, 'Bugzilla::Extension::UeducateAdmin::Workflow', $to, substr($label->($from, $to), 0, 64), $removed, $added, $now);
  };

  $dbh->bz_start_transaction();

  foreach my $t (@{$params->{remove} || []}) {
    my ($from, $to) = $pair->($t, 'remove');
    next unless exists $wf->{$from}{$to};
    if ($dupe && $to == $dupe->id && $from != 0) {
      ThrowUserError('invalid_parameter', {name => 'remove', err =>
        $label->($from, $to) . ' is required by Bugzilla: ' . $dupe->name
        . ' is the duplicate_or_move_bug_status, reachable from every status.'});
    }
    $from
      ? $dbh->do('DELETE FROM status_workflow WHERE old_status = ? AND new_status = ?', undef, $from, $to)
      : $dbh->do('DELETE FROM status_workflow WHERE old_status IS NULL AND new_status = ?', undef, $to);
    $audit->($from, $to, 'allowed', '');
    push @applied, "removed " . $label->($from, $to);
  }

  foreach my $t (@{$params->{add} || []}) {
    my ($from, $to) = $pair->($t, 'add');
    next if exists $wf->{$from}{$to};
    $dbh->do('INSERT INTO status_workflow (old_status, new_status, require_comment) VALUES (?, ?, ?)',
      undef, $from || undef, $to, $t->{require_comment} ? 1 : 0);
    $audit->($from, $to, '', $t->{require_comment} ? 'allowed (comment required)' : 'allowed');
    push @applied, "added " . $label->($from, $to);
  }

  foreach my $t (@{$params->{comment} || []}) {
    my ($from, $to) = $pair->($t, 'comment');
    next unless exists $wf->{$from}{$to};
    my $req = $t->{require_comment} ? 1 : 0;
    next if $wf->{$from}{$to} == $req;
    $from
      ? $dbh->do('UPDATE status_workflow SET require_comment = ? WHERE old_status = ? AND new_status = ?', undef, $req, $from, $to)
      : $dbh->do('UPDATE status_workflow SET require_comment = ? WHERE old_status IS NULL AND new_status = ?', undef, $req, $to);
    $audit->($from, $to, $req ? 'comment optional' : 'comment required', $req ? 'comment required' : 'comment optional');
    push @applied, ($req ? 'comment now required on ' : 'comment now optional on ') . $label->($from, $to);
  }

  $dbh->bz_commit_transaction();
  my $result = $self->workflow_get();
  $result->{applied} = [map { $self->type('string', $_) } @applied];
  return $result;
}

1;
