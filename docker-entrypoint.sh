#!/bin/sh
set -e

# Bind mounts keep the host directory's ownership, so /data usually arrives
# root-owned; make it writable by the app user, then drop privileges.
if [ "$(id -u)" = "0" ]; then
  chown node:node /data
  exec setpriv --reuid node --regid node --clear-groups "$@"
fi

exec "$@"
