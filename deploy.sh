#!/usr/bin/env bash
# ============================================================================
# deploy.sh — AGESPORT Mapa del Talento
# ============================================================================
# Script de despliegue idempotente. Pensado para ser ejecutado por un admin
# de sistemas en el servidor de producción tras un `git pull`.
#
# QUÉ HACE (en orden):
#   1. Verifica binarios (node ≥20, npm, psql opcional, pm2 opcional).
#   2. Verifica .env existe y los secretos críticos NO son defaults.
#   3. npm ci --omit=dev (dependencias de producción).
#   4. Crea los directorios de uploads si no existen.
#   5. Aplica migraciones (db:migrate) si la BD existe;
#      si la BD no existe, sugiere `npm run db:setup` y aborta.
#   6. Reinicia PM2 (reload zero-downtime si ya estaba corriendo).
#   7. Smoke test: GET /health.
#
# QUÉ NO HACE:
#   - NO modifica el .env (sólo lo lee).
#   - NO instala paquetes del sistema (postgres, nginx, etc.) — eso es del
#     admin antes del primer deploy. Ver DEPLOY.md.
#   - NO emite TLS — usa certbot manualmente.
#   - NO toca nginx — sólo arranca la app en localhost:PORT.
#
# Uso:
#   ./deploy.sh              # despliegue normal
#   DRY_RUN=1 ./deploy.sh    # imprime los pasos sin ejecutar mutaciones
#
# Sale con código != 0 ante cualquier error. set -euo pipefail.
# ============================================================================

set -euo pipefail

# ---------- helpers ---------------------------------------------------------

if [ -t 1 ] && command -v tput >/dev/null 2>&1; then
  RED=$(tput setaf 1); GREEN=$(tput setaf 2); YELLOW=$(tput setaf 3); BLUE=$(tput setaf 4); NC=$(tput sgr0)
else
  RED=''; GREEN=''; YELLOW=''; BLUE=''; NC=''
fi

log()   { printf "%s[deploy]%s %s\n" "${BLUE}" "${NC}" "$*"; }
ok()    { printf "%s[deploy]%s ✓ %s\n" "${GREEN}" "${NC}" "$*"; }
warn()  { printf "%s[deploy]%s ⚠ %s\n" "${YELLOW}" "${NC}" "$*" >&2; }
fail()  { printf "%s[deploy]%s ✗ %s\n" "${RED}"   "${NC}" "$*" >&2; exit 1; }

# DRY_RUN=1 imprime los comandos en vez de ejecutarlos. Útil para revisar
# antes del primer deploy.
run() {
  if [ "${DRY_RUN:-0}" = "1" ]; then
    printf "%s[dry-run]%s %s\n" "${YELLOW}" "${NC}" "$*"
  else
    "$@"
  fi
}

# ---------- 1. binarios ----------------------------------------------------

log "Verificando binarios…"

command -v node >/dev/null 2>&1 || fail "node no encontrado. Instala Node.js ≥20."
NODE_MAJOR=$(node -v | sed -E 's/^v([0-9]+)\..*/\1/')
if [ "${NODE_MAJOR}" -lt 20 ]; then
  fail "Node v${NODE_MAJOR} es demasiado viejo. Requerido: ≥20."
fi
ok "Node $(node -v)"

command -v npm  >/dev/null 2>&1 || fail "npm no encontrado."
ok "npm $(npm -v)"

if ! command -v psql >/dev/null 2>&1; then
  warn "psql no encontrado. db:migrate seguirá funcionando si node-postgres puede conectar."
fi

HAS_PM2=0
if command -v pm2 >/dev/null 2>&1; then
  HAS_PM2=1
  ok "PM2 $(pm2 -v)"
else
  warn "PM2 no instalado. Tendrás que arrancar la app manualmente (o instala: npm i -g pm2)."
fi

# ---------- 2. .env --------------------------------------------------------

log "Verificando .env…"

[ -f .env ] || fail ".env no encontrado. Copia .env.example y rellena los valores (ver DEPLOY.md sección 4)."

# Sentinelas que la app rechaza en producción (config/config.js fail-fast).
# Tienen que coincidir con los DEFAULTs del código.
# Formato "KEY|DEFAULT" para evitar bash 4 (`declare -A`) — macOS sigue
# en bash 3.
check_secret() {
  local key="$1"
  local default_val="$2"
  local val
  val=$(grep -E "^${key}=" .env | head -1 | sed -E "s/^${key}=//" | tr -d '"' | tr -d "'")
  if [ -z "${val}" ]; then
    fail "${key} no está definido en .env"
  fi
  if [ "${val}" = "${default_val}" ]; then
    fail "${key} sigue con el valor por defecto. Genera uno fuerte (ver DEPLOY.md sección 4)."
  fi
}

check_secret JWT_SECRET     'your_super_secret_jwt_key_change_this_in_production'
check_secret ENCRYPTION_KEY 'your_encryption_key_for_sensitive_data_change'
check_secret DB_PASSWORD    'your_database_password_change_this_in_production'

# PUBLIC_BASE_URL debe ser http(s)://...
PUBLIC_BASE_URL=$(grep -E '^PUBLIC_BASE_URL=' .env | head -1 | sed -E 's/^PUBLIC_BASE_URL=//' | tr -d '"' | tr -d "'")
if [ -z "${PUBLIC_BASE_URL}" ] || ! echo "${PUBLIC_BASE_URL}" | grep -Eq '^https?://[^[:space:]]+$'; then
  fail "PUBLIC_BASE_URL debe ser una URL absoluta (http:// o https://...). Valor actual: '${PUBLIC_BASE_URL}'"
fi

# NODE_ENV — sólo warn (no fail). El fail-fast del propio Node ya pillará el caso peligroso.
NODE_ENV_VAL=$(grep -E '^NODE_ENV=' .env | head -1 | sed -E 's/^NODE_ENV=//' | tr -d '"' | tr -d "'")
if [ "${NODE_ENV_VAL}" != "production" ]; then
  warn "NODE_ENV='${NODE_ENV_VAL}' (esperado 'production'). El fail-fast de secretos sólo aplica en 'production'."
fi

ok ".env validado"

# Exporta lo mínimo para que los scripts que lanzaremos (node) lean el env.
# `set -a` exporta todo lo que se asigne; el filtro grep evita que líneas
# raras (comentarios, espacios) rompan el shell.
set -a
# shellcheck disable=SC1091
. <(grep -E '^[A-Z][A-Z0-9_]*=' .env)
set +a

# ---------- 3. dependencias ------------------------------------------------

log "Instalando dependencias de producción (npm ci --omit=dev)…"
run npm ci --omit=dev
ok "Dependencias instaladas"

# ---------- 4. directorios de uploads --------------------------------------

UPLOADS_PATH_VAL="${UPLOADS_PATH:-./uploads}"
log "Asegurando directorios de uploads en ${UPLOADS_PATH_VAL}…"
for sub in foto cv landing logos; do
  run mkdir -p "${UPLOADS_PATH_VAL}/${sub}"
done
run mkdir -p logs
ok "Directorios listos"

# ---------- 5. base de datos -----------------------------------------------

log "Comprobando si la BD '${DB_NAME:-?}' existe…"

DB_EXISTS=0
if [ "${DRY_RUN:-0}" != "1" ]; then
  # SELECT 1 ligero via node-postgres. Falla silenciosamente si no se puede
  # conectar — eso significa "BD no existe o credenciales mal".
  if node -e "
    require('dotenv').config();
    const { Client } = require('pg');
    const c = new Client({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });
    c.connect()
      .then(() => c.query('SELECT 1'))
      .then(() => c.end())
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  " 2>/dev/null; then
    DB_EXISTS=1
  fi
fi

if [ "${DB_EXISTS}" = "1" ]; then
  ok "BD '${DB_NAME}' alcanzable"
  log "Aplicando migraciones pendientes (db:migrate)…"
  run npm run db:migrate
  ok "Migraciones al día"
else
  warn "BD '${DB_NAME:-?}' NO alcanzable o no existe."
  warn "Si es la primera instalación, ejecuta MANUALMENTE: npm run db:setup"
  warn "(con ADMIN_INITIAL_PASSWORD definido en .env y un usuario PG con permiso de CREATE DATABASE)."
  fail "Aborto: la BD no está lista. No puedo arrancar la app."
fi

# ---------- 6. PM2 ---------------------------------------------------------

if [ "${HAS_PM2}" = "1" ]; then
  log "Arrancando/reiniciando proceso PM2…"
  if pm2 describe mapa-talento-agesport >/dev/null 2>&1; then
    # reload = zero-downtime restart (PM2 levanta un nuevo proceso antes
    # de matar el viejo). --update-env recoge cambios del .env.
    run pm2 reload mapa-talento-agesport --update-env
    ok "PM2 reload completado (zero-downtime)"
  else
    run pm2 start ecosystem.config.js --env production
    run pm2 save
    ok "PM2 start hecho. Recuerda ejecutar 'pm2 startup' la primera vez."
  fi
else
  warn "PM2 no está instalado — la app no se ha arrancado automáticamente."
  warn "Arranca a mano: NODE_ENV=production node server.js  (o configura systemd)"
fi

# ---------- 7. smoke test --------------------------------------------------

PORT_VAL="${PORT:-3001}"
HOST_VAL="${HOST:-127.0.0.1}"

if [ "${HAS_PM2}" = "1" ] && [ "${DRY_RUN:-0}" != "1" ]; then
  log "Esperando 3s para que el proceso arranque…"
  sleep 3
  log "Smoke test: GET http://${HOST_VAL}:${PORT_VAL}/health"
  if curl -fsS --max-time 5 "http://${HOST_VAL}:${PORT_VAL}/health" >/dev/null; then
    ok "Healthcheck OK"
  else
    warn "Healthcheck FALLÓ. Revisa: pm2 logs mapa-talento-agesport"
    exit 1
  fi
fi

# ---------- fin ------------------------------------------------------------

cat <<EOF

${GREEN}╔════════════════════════════════════════════════════════╗
║  Despliegue completado                                 ║
╚════════════════════════════════════════════════════════╝${NC}

Próximos pasos manuales (sólo la primera vez):
  - Configurar nginx + TLS (ver DEPLOY.md sección 7).
  - 'pm2 startup' para que arranque tras reboot.
  - Configurar el cron de backup (DEPLOY.md sección 9).

Logs en vivo:
  pm2 logs mapa-talento-agesport

EOF
