# Teams: named groups of people, each with one team leader, so a leader can be
# sent their team's activity. Teams are independent of products - a member may
# work on any product.
#
# Tables (created by ops/bugzilla/setup-teams.pl, or by checksetup.pl):
#   kp_teams         id, name (unique), leader_id -> profiles, created_ts
#   kp_team_members  team_id -> kp_teams (cascade), user_id -> profiles (cascade)
#
# Web service and its REST routes:
#   GET  /rest/team          list every team with leader and members
#   POST /rest/team          create  {name, leader, members[]}       (logins)
#   POST /rest/team/update   update  {id, name?, leader?, members?}  (members replaces the list)
#   POST /rest/team/remove   delete  {id}
#
# Source of truth: ops/bugzilla/extensions/Teams in the BUGZILLA-UI repo.
# Install: copy the folder to C:\Bugzilla\extensions\Teams.
package Bugzilla::Extension::Teams;

use 5.14.0;
use strict;
use warnings;

use parent qw(Bugzilla::Extension);

use Bugzilla::WebService::Constants qw(STATUS_CREATED);

our $VERSION = '1.0';

sub db_schema_abstract_schema {
  my ($self, $args) = @_;
  $args->{schema}->{kp_teams} = {
    FIELDS => [
      id         => {TYPE => 'MEDIUMSERIAL', NOTNULL => 1, PRIMARYKEY => 1},
      name       => {TYPE => 'varchar(64)', NOTNULL => 1},
      leader_id  => {TYPE => 'INT3', REFERENCES => {TABLE => 'profiles', COLUMN => 'userid', DELETE => 'SET NULL'}},
      created_ts => {TYPE => 'DATETIME', NOTNULL => 1},
    ],
    INDEXES => [kp_teams_name_idx => {FIELDS => ['name'], TYPE => 'UNIQUE'}],
  };
  $args->{schema}->{kp_team_members} = {
    FIELDS => [
      team_id => {TYPE => 'INT3', NOTNULL => 1, REFERENCES => {TABLE => 'kp_teams', COLUMN => 'id', DELETE => 'CASCADE'}},
      user_id => {TYPE => 'INT3', NOTNULL => 1, REFERENCES => {TABLE => 'profiles', COLUMN => 'userid', DELETE => 'CASCADE'}},
    ],
    INDEXES => [
      kp_team_members_team_user_idx => {FIELDS => ['team_id', 'user_id'], TYPE => 'UNIQUE'},
      kp_team_members_user_idx      => ['user_id'],
    ],
  };
}

sub webservice {
  my ($self, $args) = @_;
  $args->{dispatch}->{Team} = 'Bugzilla::Extension::Teams::WebService';
}

sub webservice_rest_resources {
  my ($self, $args) = @_;
  $args->{resources}->{'Bugzilla::Extension::Teams::WebService'} = [
    qr{^/team$},
    {GET => {method => 'list'}, POST => {method => 'create', success_code => STATUS_CREATED}},
    qr{^/team/update$}, {POST => {method => 'update'}},
    qr{^/team/remove$}, {POST => {method => 'remove'}},
  ];
}

__PACKAGE__->NAME;
