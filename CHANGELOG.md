# CHANGELOG · AGESPORT Mapa del Talento

Trazabilidad de cambios. Las versiones publicadas se mantienen en la rama
`main`. La fecha y el hash corto identifican unívocamente la
versión. Las entradas etiquetadas `[audit]` corresponden a hallazgos de
las **6 revisiones externas de código** ejecutadas antes del deploy.

---

## 0.4.0 — Hardening final + docs de despliegue (`e57d4a4`)

**Documentación**
- `DEPLOY.md`: guía operativa en 12 secciones (pre-requisitos, BD,
  `.env`, migraciones, PM2, nginx + TLS, smoke test, backup, rollback,
  troubleshooting).
- `deploy.sh` reescrito como script no-interactivo + idempotente.
  Detecta `.env` con secretos por defecto y aborta. `DRY_RUN=1` permite
  revisar sin tocar nada. Compatible con bash 3 (macOS) y 4+ (Linux).

---

## 0.3.6 — RGPD: directorio respeta consentimiento (`1a150fa`) [audit 6ª revisión]

**🔴 RED — consent leak en directorio (RGPD)**
- `controllers/sociosController.getDirectorio` ignoraba
  `consentimientos.acepta_visibilidad_datos`. Un socio que marcó NO
  en el formulario de registro ("Acepto la visibilidad de mis datos
  profesionales dentro del espacio privado") seguía apareciendo en el
  listado del directorio interno con nombre, apellidos, entidad,
  cargo, etc.
- Ambos paths (full-text search y filtros sin búsqueda) ahora aplican
  `WHERE acepta_visibilidad_datos = true OR id = $viewer`. El propio
  socio sí se ve a sí mismo (owner exception).

**🟡 YELLOWs**
- `enviarMensajeMulti`: cap de 50 receptores por POST. Sin el cap, el
  rate-limiter (20 reqs/5min) no protegía nada porque contaba el envío
  múltiple como 1 request — un socio podía spammear miles.
- `getConversaciones` ahora `LIMIT 200`, `getMensajes` `LIMIT 500`.
- `admin/getAllSocios` ahora devuelve `total` + `pages` (vía
  `COUNT(*) OVER()`).

**Tests** — 32/32 (+2 regresión).

---

## 0.3.5 — req.query sanitization REAL (`c018307`) [audit 5ª revisión]

**🔴 RED — regresión del fix 4R**
- La mutación in-place de `req.query` que se introdujo en 0.3.4 **NO**
  funcionaba en Express 5: el getter parsea `qs.parse(querystring)` en
  CADA acceso y devuelve un objeto NUEVO. La única forma fiable es
  `Object.defineProperty(req, 'query', { value: cleaned, … })`.
- Test de regresión añadido que envía `?search=<script>` y verifica
  que el server responde con `<>` sanitizado.

**🟡 YELLOWs**
- `verifySession` ahora aplica `filterSensitiveData` y descifra
  `telefono`/`dni_nie` para el owner. Antes los blobs `*_encrypted`
  llegaban en el JSON al cliente.
- Clamp `?limit=` (200/500) en `getSociosPendientes`, `getAllSocios`,
  `getAuditoria`. Sin esto, `?limit=10M` era DoS.
- Path de búsqueda full-text recupera el filtro `especialidad`
  (antes lo perdía silenciosamente).
- `getMensajesReportados` `LIMIT 200`.
- `geocodingService`: timeout de 8s en Nominatim/Mapbox (antes un
  upstream colgado bloqueaba `register`/`updatePerfil` indefinidamente).
- 3 nuevos tests de regresión: moderador → 403 al crear admin,
  superadmin con rol fuera de whitelist → 400, `req.query` sanitizado.

---

## 0.3.4 — Crear admin requiere superadmin (`8352f88`) [audit 4ª revisión]

**🔴 RED — escalación de privilegios**
- `POST /api/admin/admins` no exigía rol superadmin. Cualquier admin
  (incluido `moderador`) podía crear otro admin con
  `rol: 'superadmin'` → auto-promoción trivial.
- Nuevo middleware `requireSuperadmin` + whitelist explícita de roles
  válidos en el controller (defensa en profundidad).

**🟡 YELLOWs**
- `scripts/migrate-database.js` ahora stripea BEGIN/COMMIT internos
  antes de ejecutar. Postgres no trata BEGIN anidado como savepoint —
  el COMMIT interno cerraba la tx outer y dejaba el INSERT en
  `_migrations` en autocommit. Atomicidad real restaurada.
- `middleware/security.js`: primer intento de fix del `req.query`
  (luego corregido en 0.3.5).
- `exportarDatosPersonales` + `getMensajesReportados` pasan a
  `LEFT JOIN` + COALESCE → no pierden mensajes de cuentas borradas
  (corrige RGPD export Art. 20).
- `searchSocios` ahora pagina con LIMIT/OFFSET + clamp ≤ 200 y
  devuelve `{rows, total}` con `COUNT(*) OVER()`.
- `filterSensitiveData` borra `dni_nie_encrypted` antes del early
  return de owner/admin (storage interno, no útil al cliente).
- `schema.sql`: `estado_socio_enum` ya incluye `'baja'` para fresh
  installs.

---

## 0.3.3 — REDs + YELLOWs + GREENs 3ª revisión (`ba32ec0` + `bac4b39` + `6b2b60f`) [audit 3ª revisión]

**🔴 REDs**
- `logout`: el JWT se firma con `socioId`/`adminId` pero el código
  leía `decoded.id` → audit jamás se creaba. Bug introducido por el
  fix GREEN #14 anterior. Test de regresión que cuenta filas en
  `auditoria` antes/después.
- Nuevo `scripts/migrate-database.js`: `npm run db:migrate` antes
  apuntaba a un script inexistente. Ahora hay un runner real con
  tabla `_migrations`, auto-descubrimiento de SQL y tx por migración.

**🟡 YELLOWs**
- `schema.sql` FKs `ON DELETE SET NULL` (era CASCADE) en
  `mensajes`/`conversaciones` — fresh installs ya no resucitan el bug
  de mensajes que se borran al eliminar cuenta.
- `darBajaAdministrativa`: `getConversaciones` ya no oculta la
  conversación cuando el otro socio está en baja administrativa —
  la deja visible con `[Cuenta dada de baja]` (sentinel unificado).
- Admin hardcoded con hash inválido eliminado de `schema.sql`.
- `aprobarAccesoInvitado` con `SELECT FOR UPDATE` (TOCTOU + 409 limpio
  en lugar de 500 por UNIQUE violation).
- Migración 014: lookup del CHECK antiguo por COLUMNA (no por
  `LIKE '%estado%'` que matcheaba cualquier constraint).
- `getPerfil` valida `Number.isInteger(socioId)` → 400 en lugar de
  500 con NaN.

**🟢 GREENs**
- `searchSocios`: whitelist explícita de columnas filtrables.
- `aprobarSocio`/`rechazarSocio`: UPDATE condicional sobre
  `estado='pendiente'` + 409 si rowCount=0 (TOCTOU).
- `uploadImage` de landing borra el archivo previo del disco.

---

## 0.3.2 — REDs + YELLOWs + GREENs 2ª revisión (`2139870` + `f80006e` + `4d6ac18`) [audit 2ª revisión]

**🔴 REDs**
- `aprobarAccesoInvitado` envuelto en `db.transaction` (antes 3 queries
  no-atómicas dejaban el socio creado sin password conocido si fallaba
  el paso intermedio).
- Mismo flujo ahora INSERTa la fila de `consentimientos` (faltaba —
  cualquier socio importado por CSV quedaba invisible/incontactable
  hasta que opt-in manual).
- Test setup auto-descubre migraciones (la 013 no se aplicaba antes
  → su rama de dedup estaba sin cobertura).

**🟡 YELLOWs**
- `gestionarBaja` TOCTOU: `SELECT FOR UPDATE` dentro de tx, guard 409
  serializable.
- `forgotPassword`/`forgotPasswordAdmin` responden 200 SIEMPRE (incluso
  para body inválido). `validateInput` ahora corre ANTES del
  rate-limiter para que el keyGenerator vea el email normalizado.
- `services/csv.js`: prefija `'` a celdas que empiezan por `=+-@\t\r`
  → adiós Excel formula injection.
- Migración 013 loguea filas borradas en `auditoria` antes de dedup
  (reconciliación manual si se pierden opt-ins permisivos).
- `importarCSV`: filas con errores quedan en estado `'con_errores'`
  (no `'pendiente'`) y `aprobarAccesoInvitado` las rechaza.
- `PUBLIC_BASE_URL` vacío = fail-loud al arrancar. Helper
  `resolveBaseUrl()` nunca usa `req.get('host')` (cierra Host header
  injection en links de reset password).
- `schema.sql`: `estado_socio_enum` incluye `'baja'`.

**🟢 GREENs**
- `.replaceAll('{nombre}', …)` en templates de email.
- Documentado el residual exposure del token de reset (history del
  browser, logs de proxy).
- `services/messageSentinels.js`: constantes USUARIO_BAJA / MODERACION
  centralizadas (antes había 2 sentinels distintos para baja
  voluntaria vs admin).
- `logout` decodifica JWT oportunisticamente para auditar incluso si
  el token expiró.

---

## 0.3.1 — 1ª revisión externa (`11c9d82` + `d683951`) [audit 1ª revisión]

**🔴 REDs**
- CSV export rompía con TDZ por shadow de variable `csv`.
- CSV export SELECT referenciaba columna `telefono` (drop por
  migración 002): ahora usa `telefono_encrypted` + `decryptData`.
- 5 templates de email interpolaban valores de usuario/admin sin
  escape: ahora `escapeHtml()` en todos los placeholders.
- Subida de SVG con `<script>`: `services/uploadService` deriva la
  extensión del `mimetype` validado (no del `originalname` del
  cliente) + quitado SVG del whitelist.

**🟡 YELLOWs**
- `forgotPassword` ya no rate-limitado: `authLimiter` tenía
  `skipSuccessfulRequests:true` y el endpoint devuelve 200 siempre →
  nunca se activaba. Nuevo `forgotPasswordLimiter` dedicado.
- `PUT /api/admin/landing/:clave` ahora rechaza con 400 si la clave
  es de tipo `'image'` (antes se podía sobrescribir
  `topbar.logo` con texto plano).
- `GET /api/public/landing` excluye claves `email.%` (templates
  server-side que no deben llegar al frontend público).
- `restablecer.html`: `<meta name="referrer" content="no-referrer">`
  para que el token no viaje a fonts.gstatic.com vía Referer.
- Test de regresión del export CSV.

---

## 0.3.0 — Branch `landing-editor` (features previos al hardening)

- `feat`: editable landing CMS + mapa público real (no PII)
- `fix`: hero "points" titles render bold/navy
- `feat`: CMS extendido a todas las secciones (topbar, proyecto,
  capacidades, fases, estado, acceso, footer)
- `fix(admin)`: layout tabla pendientes + refresh del dashboard al
  cambiar de pestaña + endpoint baja administrativa
- `feat(cms)`: soporte de imágenes en landing_content
- `chore`: `scripts/seed-demo.js` para reseed rápido tras los tests
- `fix(admin)` + `feat(auth)`: dashboard a 0 con datos + recuperación
  de contraseña
- `feat`: recuperación de contraseña de admin + fix dark-panel
  btn-secondary + demo socio login
- `fix(email)` + `feat`: enlace correcto en email + plantilla welcome
  editable desde el CMS

---

## 0.2.0 — Karpathy-style refactor (`refactor/karpathy`)

Refactor en 7 fases siguiendo guidelines Karpathy:
- Fase 0: ESLint, Prettier, runner `node --test`.
- Fase 1: limpieza de código muerto (monitoring stub, LEGACY_* maps,
  installNodemailer helper, emojis decorativos en logs server-side).
- Fase 2: fail-fast en producción si JWT_SECRET, ENCRYPTION_KEY,
  DB_PASSWORD o EMAIL_PASS están en sus valores default;
  ADMIN_INITIAL_PASSWORD obligatorio para `db:setup`.
- Fase 2b: cifrado AES-256-CBC de `socios.telefono` y de
  `accesos_invitados.telefono` (migraciones 002 y 004) — el plaintext
  ya no existe en BD.
- Fase 3: docker-compose.test.yml + 3 integration tests
  (register→approve→login, mensajería, RGPD export).
- Fase 4: validadores y mensajería unificados; `services/csv.js`
  extraído.
- Fase 6: aplanar clases-singleton a funciones de módulo; `Server`
  clase → `start()` procedural.
- Fase 7: prettier sobre todo el repo + política de errores + métricas
  finales del refactor.

---

## Resumen de auditoría

| Revisión | RED arreglados | YELLOW | GREEN |
|----------|---------------:|-------:|------:|
| 1ª       | 4              | 7      | 0     |
| 2ª       | 3              | 7      | 4     |
| 3ª       | 2              | 6      | 3     |
| 4ª       | 1              | 5      | 1     |
| 5ª       | 1              | 5      | 0     |
| 6ª       | 1              | 3      | 0     |
| **Total**| **12**         | **33** | **8** |

**~46 bugs identificados por revisión externa, todos arreglados, con cobertura de tests**.

- Tests integration: 32/32 (frescos en cada release tras `npm run db:setup`).
- Lint: limpio.
- Migration runner: idempotente.

---

## Convenciones

- Versión semántica relajada: `MAJOR.MINOR.PATCH`. Aún en pre-1.0.
- Cada release = un commit en `main`. El hash corto en el
  título permite hacer `git show <hash>` o `git checkout <hash>` para
  inspeccionar/rollback.
- Las migraciones de BD son **idempotentes** y se aplican vía
  `npm run db:migrate`. El runner registra cada una en `_migrations`
  para no repetirla.
