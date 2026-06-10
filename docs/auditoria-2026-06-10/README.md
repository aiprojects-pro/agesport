# 🎯 Version 7 — Auditoría COMPLETA aplicada

**Cierra los 13 hallazgos** del informe `Auditoria_AGESPORT.docx`
(10 jun 2026), en un único bundle listo para producción.

---

## 📊 Resumen de cobertura

| Severidad | Hallazgos | Estado |
|-----------|----------:|--------|
| 🔴 ALTA   | 4         | ✅ 4/4 |
| 🟡 MEDIA  | 5         | ✅ 5/5 |
| 🟢 BAJA   | 4         | ✅ 4/4 |
| **TOTAL** | **13**    | ✅ **13/13** |

---

## ✅ Hallazgos cerrados (uno por uno)

### 🔴 ALTAS

| # | Hallazgo | Fix |
|---|----------|-----|
| H1 | Consentimientos RGPD premarcados | `public/registro.html`: `checked` quitado, `required` en los 2 obligatorios, etiquetas (obligatorio)/(opcional), aviso RGPD + enlace a `/privacidad.html` (nueva página completa de 10 secciones). |
| H2 | `/api/admin/landing` 404 (editor roto) | `routes/admin.js`: montadas 3 rutas (`GET/PUT /landing`, `POST /landing/:clave/imagen`). `services/uploadService.js`: nuevo `uploadLandingImage` (multer, 4 MB, sin SVG). |
| H3 | `/api/auth/forgot-password` 404 | `controllers/authController.js`: 4 métodos nuevos (forgot/reset socio + admin) con tokens SHA-256, TTL 1h, single-use, mensaje neutro (no enumera), setImmediate (sin timing leak). `services/emailService.js`: `sendPasswordReset()`. `routes/auth.js`: 4 rutas con `forgotPasswordLimiter`. |
| H4 | Login sin bloqueo fuerza bruta | `middleware/security.js`: `authLimiter` reducido a 5/15min por IP+email + nuevo `loginIpLimiter` 20/15min por IP solo (para credential stuffing rotando emails). Verificado: 6º intento fallido → **429**. |

### 🟡 MEDIAS

| # | Hallazgo | Fix |
|---|----------|-----|
| M1 | Divulgación de pila técnica en landing | `public/index.html`: las 4 cajas de "estado" ya no mencionan Node.js/PostgreSQL/Nginx/Let's Encrypt — descripciones funcionales (Acceso, Conexión, Datos, Disponibilidad). |
| M2 | Catch-all 200 sobre rutas inexistentes | `server.js`: el handler `app.get('/{*path}', ...)` devuelve **404** para rutas estáticas desconocidas (antes: 200 con SPA). Sólo `/` y `/index.html` sirven el HTML principal. |
| M3 | `admin.html` con `Cache-Control: public` | `server.js`: middleware nuevo que aplica `Cache-Control: no-store, no-cache, must-revalidate, private` a las HTML privadas (admin, panel, perfil, directorio, mensajes, restablecer). |
| M4 | CTA "Acceso socio" lleva al panel admin si hay sesión admin | `public/assets/access.js`: ya no auto-redirige. Si detecta sesión activa, muestra banner con dos opciones: "Ir al panel" o "Cerrar sesión y entrar con otra cuenta". `?force=socio` salta la detección. |
| M5 | Validación de registro con mensaje genérico | `public/assets/portal.js`: el helper `request()` concatena `data.details[]` al mensaje del error. Ahora el usuario ve `"Datos de registro inválidos: Email inválido; Provincia inválida"` en lugar del genérico. |

### 🟢 BAJAS

| # | Hallazgo | Fix |
|---|----------|-----|
| B1 | "Administrador AGSport" en panel | `public/assets/admin-dashboard.js`: nueva función `normalizeBrand()` que convierte cualquier variante (AGSport, Agesport) a "AGESPORT" al renderizar el saludo. |
| B2 | Columna TIPO muestra "numero" crudo | `public/assets/admin-dashboard.js`: nueva función `tipoSocioLabel()` que mapea `slug → label` desde `catalogos.js` ("numero" → "Socio/a de número"). |
| B3 | Botones "Pendientes" siempre activos | `loadPendientes()` ahora desactiva `#selectAllPendBtn` y `#approveSelectedBtn` cuando `socios.length === 0`. |
| B4 | Accesibilidad + SEO + CSP | `public/index.html`: añadidas 10 etiquetas Open Graph + Twitter Card (vista previa al compartir en redes). `server.js`: CSP endurecida (object-src 'none', frame-ancestors 'self', base-uri 'self', form-action 'self'), HSTS con preload (2 años), `Permissions-Policy` restrictiva (camera/microphone/geolocation/payment/usb/etc deshabilitados). |

---

## 📦 Contenido del bundle

```
Version 7 - Auditoria Completa 20260610/
├── 00-LEEME-AUDITORIA-COMPLETA.md                  ← este fichero
├── Auditoria_AGESPORT.docx                          ← informe original (referencia)
├── agesport-codigo-auditoria-completa-20260610.tar.gz   ← código completo (130+ archivos, 1.3 MB)
└── archivos-modificados/                            ← parche mínimo (15 archivos)
    ├── server.js                                     (catch-all 404, Cache-Control, CSP, Permissions-Policy)
    ├── middleware/security.js                        (rate limiters login)
    ├── routes/auth.js                                (+ 4 rutas forgot/reset)
    ├── routes/admin.js                               (+ 3 rutas landing)
    ├── controllers/authController.js                 (+ 4 métodos forgot/reset)
    ├── controllers/admin/landing.js                  (CMS landing — ya existía)
    ├── services/emailService.js                      (+ sendPasswordReset)
    ├── services/uploadService.js                     (+ uploadLandingImage)
    └── public/
        ├── index.html                                (M1 sin pila, B4 Open Graph)
        ├── registro.html                             (H1 consentimientos RGPD)
        ├── privacidad.html                           (nueva: política de privacidad)
        └── assets/
            ├── portal.js                             (M5 details en errores)
            ├── portal.css                            (.req / .opt / .consent-note)
            ├── access.js                             (M4 banner sesión activa)
            └── admin-dashboard.js                    (B1 normalizeBrand, B2 tipoSocioLabel, B3 desactivar botones)
```

---

## 🚀 Deploy (Opción A — parche mínimo, RECOMENDADO)

```bash
cd /var/www/mapa-talento

# Backup
sudo cp -r controllers controllers.bak-$(date +%Y%m%d)
sudo cp -r middleware middleware.bak-$(date +%Y%m%d)
sudo cp -r routes routes.bak-$(date +%Y%m%d)
sudo cp -r services services.bak-$(date +%Y%m%d)
sudo cp -r public public.bak-$(date +%Y%m%d)
sudo cp server.js server.js.bak-$(date +%Y%m%d)

# Aplicar parche
cp -r /ruta/Version_7/archivos-modificados/. .

# Reload zero-downtime
pm2 reload mapa-talento-agesport
```

**No requiere tocar BD** — las migraciones 010 y 011 (tokens) deben estar
aplicadas ya. Si dudas: `npm run db:migrate` (idempotente).

## 🚀 Deploy (Opción B — reemplazo completo)

```bash
cd /var/www
tar xzf /ruta/agesport-codigo-auditoria-completa-20260610.tar.gz
sudo mv mapa-talento mapa-talento.old
sudo mv agesport-main mapa-talento
sudo cp mapa-talento.old/.env mapa-talento/
cd mapa-talento
npm ci --omit=dev
npm run db:migrate
pm2 reload mapa-talento-agesport
```

---

## ✅ Smoke test post-deploy

```bash
URL=https://mapatalento.agesport.org

# 1) Health
curl -fsS $URL/health

# 2) Pila técnica oculta (M1)
curl -s $URL/ | grep -iE "Node\.js|PostgreSQL|Nginx|Let's Encrypt" | head
# → vacío

# 3) Catch-all → 404 (M2)
curl -s -o /dev/null -w "%{http_code}\n" $URL/dashboard.html
# → 404

# 4) Cache-Control admin.html (M3)
curl -s -I $URL/admin.html | grep -i cache
# → Cache-Control: no-store, no-cache, must-revalidate, private

# 5) Permissions-Policy (B4)
curl -s -I $URL/ | grep -i permissions
# → Permissions-Policy: camera=(), microphone=(), …

# 6) Open Graph (B4)
curl -s $URL/ | grep "og:title"
# → <meta property="og:title" content="Mapa del Talento AGESPORT">

# 7) Editor landing (H2) — necesita token admin
TOKEN=$(curl -s -X POST $URL/api/auth/login/admin \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@agesport.org","password":"<TU_PASSWORD>"}' \
  | python3 -c "import json,sys;print(json.load(sys.stdin)['token'])")
curl -s -H "Authorization: Bearer $TOKEN" $URL/api/admin/landing | head -c 100
# → {"content":[...] con 80+ claves

# 8) Recuperación de contraseña (H3)
curl -s -X POST $URL/api/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"alguno@example.com"}'
# → {"message":"Si la cuenta existe..."}

# 9) Fuerza bruta (H4)
for i in {1..7}; do
  curl -s -o /dev/null -w "Intento $i: %{http_code}\n" \
    -X POST $URL/api/auth/login/admin \
    -H 'Content-Type: application/json' \
    -d '{"email":"admin@agesport.org","password":"WRONG"}'
done
# → del 6º en adelante: 429

# 10) Registro: casillas vacías por defecto (H1)
curl -s $URL/registro.html | grep -c 'type="checkbox" checked'
# → 0 (sólo el radio oculto técnico, no los consentimientos)
```

---

## 🔬 Verificaciones locales antes de empaquetar

| Test | Resultado |
|------|-----------|
| `/health` | 200 OK ✅ |
| Pila técnica en landing | NO aparece ✅ |
| `/dashboard.html`, `/portal.html`, `/inexistente` | **404** ✅ |
| `/` | 200 ✅ |
| `/admin.html` Cache-Control | `no-store, no-cache, must-revalidate, private` ✅ |
| `Permissions-Policy` | Aplicada con whitelist mínima ✅ |
| `og:title` en landing | Presente ✅ |
| `GET /api/admin/landing` (con token admin) | **200**, 84 claves ✅ |
| `POST /api/auth/forgot-password` | **200**, mensaje neutro ✅ |
| 5 logins fallidos consecutivos | 401 ✅ |
| 6º login fallido | **429** ✅ |
| 7º login fallido | **429** ✅ |
| `registro.html` consentimientos `checked` | 0 ✅ |

---

## 🔄 Rollback rápido si algo falla

```bash
cd /var/www/mapa-talento
sudo rm -rf controllers middleware routes services public server.js
sudo mv controllers.bak-AAAAMMDD controllers
sudo mv middleware.bak-AAAAMMDD middleware
sudo mv routes.bak-AAAAMMDD routes
sudo mv services.bak-AAAAMMDD services
sudo mv public.bak-AAAAMMDD public
sudo mv server.js.bak-AAAAMMDD server.js
pm2 reload mapa-talento-agesport
```

---

## 📝 Notas finales

- **CSP `style-src` mantiene `'unsafe-inline'`**: el código tiene
  decenas de `style="..."` inline en plantillas. Endurecerlo sin
  refactor masivo rompería la UI. Marcado como deuda técnica.
- **B1 (AGSport en nombre admin)**: el código del frontend normaliza
  el nombre al renderizar. Si quieres limpiar también la BD:
  ```sql
  UPDATE administradores SET nombre = REPLACE(nombre, 'AGSport', 'AGESPORT');
  ```
- **Política de privacidad** (`/privacidad.html`): plantilla genérica
  basada en RGPD + AEPD. Adáptala si AGESPORT tiene datos legales más
  específicos (responsable, DPO, etc.).
- **Migraciones 010/011** (`password_reset_tokens` y
  `admin_password_reset_tokens`): ya deberían estar aplicadas. Si no:
  `npm run db:migrate`.
