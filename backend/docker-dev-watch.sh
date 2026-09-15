#!/bin/sh
# spring-boot:run + devtools restarts the app when target/classes changes,
# but nothing recompiles src/ automatically the way Vite recompiles the
# frontend — Maven has no built-in watch mode. This polls for changed
# source files and recompiles when it finds any; devtools does the rest.
# Polling, not inotify, for the same reason vite.config.ts polls: a Windows
# host directory bind-mounted into Docker Desktop's Linux VM doesn't
# deliver native filesystem change events reliably.
set -e

touch /tmp/.last-compile

(
  while true; do
    if [ -n "$(find src -name '*.java' -newer /tmp/.last-compile -print -quit)" ]; then
      ./mvnw compiler:compile -o -q -Dmaven.test.skip=true && touch /tmp/.last-compile
    fi
    sleep 2
  done
) &

exec ./mvnw spring-boot:run
