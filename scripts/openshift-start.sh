#!/usr/bin/env sh
set -eu

for i in $(seq 1 30); do
  if pg_isready -h "${DB_HOST:-agesport-postgres}" -p "${DB_PORT:-5432}" -U "${DB_USER:-agesport}" -d "${DB_NAME:-agesport_mapa_talento}" >/dev/null 2>&1; then
    exec npm start
  fi
  echo "[start] waiting for database ($i/30)"
  sleep 5
done

echo "[start] database is not ready after retries" >&2
exit 1
