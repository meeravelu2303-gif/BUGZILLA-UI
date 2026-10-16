#!/usr/bin/env bash
# Compile-checks the extension (perl -T, as Bugzilla runs it) and only then copies it to STAGING.
# A failed compile copies nothing.
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)/UeducateAdmin"
DEST=/d/Bugzilla-staging/extensions/UeducateAdmin
cd /d/Bugzilla-staging
for f in Config.pm Extension.pm lib/WebService.pm; do
  /c/Strawberry/perl/bin/perl.exe -I. -Ilib -T -c "$SRC/$f"
done
mkdir -p "$DEST/lib"
cp "$SRC/Config.pm" "$SRC/Extension.pm" "$DEST/"
cp "$SRC/lib/WebService.pm" "$DEST/lib/"
echo "deployed to STAGING: $DEST"
