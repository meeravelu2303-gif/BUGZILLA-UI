# UeducateAdmin - REST endpoints for the admin screens of the UEducate Bugzilla UI.
#
# Switch it off instantly by creating an empty file named "disabled" in this
# folder; Bugzilla (mod_cgi) skips the extension from the next request on.
package Bugzilla::Extension::UeducateAdmin;

use 5.14.0;
use strict;
use warnings;

use constant NAME => 'UeducateAdmin';

use constant REQUIRED_MODULES => [];
use constant OPTIONAL_MODULES => [];

__PACKAGE__->NAME;
