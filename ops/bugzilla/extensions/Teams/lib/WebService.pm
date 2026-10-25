# Teams web service: list, create, update and remove teams.
#
# People are named by login (email). The leader is stored on the team, not as a
# member: a leader receives the team's report and may lead several teams; a
# person may also be a member of several teams.
#
# Writes require editusers (user administration), the same right as managing
# accounts. The UI's backend calls these with its service key after its own
# admin check.
package Bugzilla::Extension::Teams::WebService;

use 5.14.0;
use strict;
use warnings;

use parent qw(Bugzilla::WebService);

use Bugzilla::Constants;
use Bugzilla::Error;
use Bugzilla::User;
use Bugzilla::Util qw(detaint_natural trick_taint trim);

use constant PUBLIC_METHODS => qw(list create update remove);
use constant READ_ONLY      => qw(list);
use constant MAX_NAME       => 64;

sub _require_admin {
  my $user = Bugzilla->login(LOGIN_REQUIRED);
  $user->in_group('editusers')
    || ThrowUserError('auth_failure', {group => 'editusers', action => 'edit', object => 'users'});
  return $user;
}

sub _clean_name {
  my ($name) = @_;
  $name = trim($name // '');
  $name =~ s/\s+/ /g;
  ThrowUserError('kp_team_name_required') if $name eq '';
  ThrowUserError('kp_team_name_too_long', {max => MAX_NAME}) if length($name) > MAX_NAME;
  trick_taint($name);    # validated above; only ever bound as a placeholder
  return $name;
}

sub _user_id {
  my ($login) = @_;
  my $user = Bugzilla::User->new({name => trim($login // '')});
  ThrowUserError('kp_team_unknown_user', {login => $login}) unless $user && $user->id;
  return $user->id;
}

sub _check_unique_name {
  my ($name, $except_id) = @_;
  my $taken = Bugzilla->dbh->selectrow_array(
    'SELECT id FROM kp_teams WHERE LOWER(name) = LOWER(?) AND id <> ?', undef, $name, $except_id // 0);
  ThrowUserError('kp_team_name_taken', {name => $name}) if $taken;
}

sub _team_row {
  my ($id) = @_;
  my $clean = $id // '';
  ThrowUserError('kp_team_not_found', {id => $id}) unless detaint_natural($clean);
  my $row = Bugzilla->dbh->selectrow_hashref('SELECT id, name, leader_id, created_ts FROM kp_teams WHERE id = ?', undef, $clean);
  ThrowUserError('kp_team_not_found', {id => $id}) unless $row;
  return $row;
}

# Replaces the team's member list; the leader is never stored as a member.
sub _set_members {
  my ($team_id, $leader_id, $logins) = @_;
  my %ids = map { _user_id($_) => 1 } @{$logins // []};
  delete $ids{$leader_id} if $leader_id;
  my $dbh = Bugzilla->dbh;
  $dbh->do('DELETE FROM kp_team_members WHERE team_id = ?', undef, $team_id);
  $dbh->do('INSERT INTO kp_team_members (team_id, user_id) VALUES (?, ?)', undef, $team_id, $_) for sort { $a <=> $b } keys %ids;
}

sub _person {
  my ($self, $user) = @_;
  return {
    id    => $self->type('int',    $user->id),
    email => $self->type('email',  $user->login),
    name  => $self->type('string', $user->name || $user->login),
  };
}

sub _describe {
  my ($self, $row) = @_;
  my $member_ids = Bugzilla->dbh->selectcol_arrayref('SELECT user_id FROM kp_team_members WHERE team_id = ?', undef, $row->{id});
  my @members = sort { lc($a->{name}) cmp lc($b->{name}) }
    map { $self->_person($_) } @{Bugzilla::User->new_from_list($member_ids)};
  my $leader = $row->{leader_id} ? Bugzilla::User->new($row->{leader_id}) : undef;
  return {
    id      => $self->type('int',      $row->{id}),
    name    => $self->type('string',   $row->{name}),
    leader  => $leader ? $self->_person($leader) : undef,
    members => \@members,
    created => $self->type('dateTime', $row->{created_ts}),
  };
}

sub list {
  my ($self) = @_;
  Bugzilla->login(LOGIN_REQUIRED);
  my $rows = Bugzilla->dbh->selectall_arrayref(
    'SELECT id, name, leader_id, created_ts FROM kp_teams ORDER BY name', {Slice => {}});
  return {teams => [map { $self->_describe($_) } @$rows]};
}

sub create {
  my ($self, $params) = @_;
  _require_admin();
  my $name = _clean_name($params->{name});
  ThrowUserError('kp_team_leader_required') unless trim($params->{leader} // '') ne '';
  my $leader_id = _user_id($params->{leader});

  my $dbh = Bugzilla->dbh;
  $dbh->bz_start_transaction();
  _check_unique_name($name);
  $dbh->do('INSERT INTO kp_teams (name, leader_id, created_ts) VALUES (?, ?, NOW())', undef, $name, $leader_id);
  my $id = $dbh->bz_last_key('kp_teams', 'id');
  _set_members($id, $leader_id, $params->{members});
  $dbh->bz_commit_transaction();
  return {team => $self->_describe(_team_row($id))};
}

sub update {
  my ($self, $params) = @_;
  _require_admin();
  my $dbh = Bugzilla->dbh;
  $dbh->bz_start_transaction();
  my $row = _team_row($params->{id});
  if (defined $params->{name}) {
    my $name = _clean_name($params->{name});
    _check_unique_name($name, $row->{id});
    $dbh->do('UPDATE kp_teams SET name = ? WHERE id = ?', undef, $name, $row->{id});
  }
  my $leader_id = $row->{leader_id};
  if (defined $params->{leader}) {
    ThrowUserError('kp_team_leader_required') unless trim($params->{leader}) ne '';
    $leader_id = _user_id($params->{leader});
    $dbh->do('UPDATE kp_teams SET leader_id = ? WHERE id = ?', undef, $leader_id, $row->{id});
    $dbh->do('DELETE FROM kp_team_members WHERE team_id = ? AND user_id = ?', undef, $row->{id}, $leader_id);
  }
  _set_members($row->{id}, $leader_id, $params->{members}) if defined $params->{members};
  $dbh->bz_commit_transaction();
  return {team => $self->_describe(_team_row($row->{id}))};
}

sub remove {
  my ($self, $params) = @_;
  _require_admin();
  my $row  = _team_row($params->{id});
  my $desc = $self->_describe($row);
  my $dbh  = Bugzilla->dbh;
  $dbh->bz_start_transaction();
  $dbh->do('DELETE FROM kp_team_members WHERE team_id = ?', undef, $row->{id});
  $dbh->do('DELETE FROM kp_teams WHERE id = ?', undef, $row->{id});
  $dbh->bz_commit_transaction();
  return {removed => $desc};
}

1;
