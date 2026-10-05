-- Additive: does not modify existing profiles, preferences or authorizations.
CREATE TABLE IF NOT EXISTS privacy_versions (
 id SERIAL PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL,
 format TEXT NOT NULL CHECK(format IN ('legacy_html','markdown')),
 provenance TEXT NOT NULL, published_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 admin_id INTEGER REFERENCES administradores(id) ON DELETE SET NULL
);
INSERT INTO privacy_versions(id,title,content,format,provenance)
VALUES (1,'Política de privacidad', $legacy$

      <h2>1. Responsable del tratamiento</h2>
      <p>
        El responsable del tratamiento de los datos personales recogidos
        a través de esta plataforma es la
        <strong>Asociación Andaluza de Gestores del Deporte (AGESPORT)</strong>,
        con domicilio social en Andalucía (España).
      </p>
      <p>
        Para cualquier consulta relacionada con el tratamiento de tus datos
        personales, puedes contactarnos a través del correo electrónico
        <a href="mailto:privacidad@agesport.org">privacidad@agesport.org</a>.
      </p>

      <h2>2. Finalidades del tratamiento</h2>
      <p>
        Tus datos se tratan para las siguientes finalidades:
      </p>
      <ul>
        <li>
          Gestionar tu alta como socio del Mapa del Talento y el ciclo
          de vida de tu cuenta (registro, aprobación, actualización,
          baja).
        </li>
        <li>
          Mostrar tu perfil profesional dentro del entorno privado de
          socios autenticados, según los consentimientos que hayas
          otorgado.
        </li>
        <li>
          Habilitar la mensajería interna entre socios (sólo si has
          aceptado el consentimiento opcional correspondiente).
        </li>
        <li>
          Enviar comunicaciones operativas relacionadas con tu cuenta
          (aprobación, recuperación de contraseña, notificaciones de
          mensajes).
        </li>
        <li>
          Cumplir con las obligaciones legales y de auditoría aplicables.
        </li>
      </ul>

      <h2>3. Base legal</h2>
      <p>
        La base legal para tratar tus datos es el <strong>consentimiento
        explícito</strong> que prestas al completar el formulario de
        registro (art. 6.1.a y art. 7 del RGPD), así como la
        <strong>ejecución de la relación asociativa</strong> con AGESPORT
        cuando seas socio aprobado (art. 6.1.b RGPD).
      </p>
      <p>
        Cumplimos también con los criterios de la sentencia
        <em>Planet49</em> del TJUE (2019): el consentimiento debe ser
        una acción afirmativa del usuario, motivo por el que las
        casillas del formulario de alta aparecen siempre desmarcadas
        por defecto.
      </p>

      <h2>4. Datos que recogemos</h2>
      <p>
        Recogemos únicamente los datos estrictamente necesarios para
        las finalidades anteriores:
      </p>
      <ul>
        <li>
          Datos identificativos: nombre, apellidos, DNI/NIE
          (almacenado <strong>cifrado AES-256</strong> en la base
          de datos).
        </li>
        <li>
          Datos de contacto: email, teléfono (almacenado
          <strong>cifrado AES-256</strong>).
        </li>
        <li>
          Datos profesionales: entidad, cargo, años de experiencia,
          especialidad, rol en el clúster.
        </li>
        <li>
          Datos de ubicación: provincia, comunidad autónoma, localidad
          (necesarios para el mapa interactivo).
        </li>
        <li>
          Datos de actividad: fecha de registro, último acceso,
          consentimientos otorgados, IP del consentimiento (auditoría).
        </li>
      </ul>

      <h2>5. Conservación de los datos</h2>
      <p>
        Tus datos se conservan mientras mantengas tu cuenta activa.
        En caso de baja (voluntaria o administrativa), los datos
        personales se eliminan o anonimizan respetando las obligaciones
        legales de conservación mínima para auditoría
        (mensajes anonimizados, registro de baja en
        <code>bajas_pendientes</code>).
      </p>

      <h2>6. Cesión a terceros</h2>
      <p>
        No cedemos tus datos a terceros, salvo:
      </p>
      <ul>
        <li>
          Cuando exista obligación legal (juzgados, autoridades
          competentes).
        </li>
        <li>
          A proveedores de servicios estrictamente necesarios para el
          funcionamiento de la plataforma (alojamiento web, envío de
          email), todos ellos vinculados por contratos de
          encargo del tratamiento conforme al art. 28 RGPD.
        </li>
      </ul>

      <h2>7. Tus derechos</h2>
      <p>
        En todo momento puedes ejercer los siguientes derechos sobre
        tus datos:
      </p>
      <ul>
        <li>
          <strong>Acceso</strong>: solicitar copia de los datos que
          tenemos sobre ti.
        </li>
        <li>
          <strong>Rectificación</strong>: corregir datos inexactos o
          incompletos directamente desde tu perfil.
        </li>
        <li>
          <strong>Supresión</strong> ("derecho al olvido"): solicitar la
          eliminación de tu cuenta y datos asociados.
        </li>
        <li>
          <strong>Oposición</strong>: oponerte al tratamiento de tus
          datos para finalidades concretas (p. ej. retirar el
          consentimiento de visibilidad o de mensajería).
        </li>
        <li>
          <strong>Portabilidad</strong>: recibir tus datos en un formato
          estructurado y de uso común (CSV/JSON) — disponible desde el
          panel del socio.
        </li>
        <li>
          <strong>Reclamación</strong>: presentar reclamación ante la
          Agencia Española de Protección de Datos (AEPD,
          <a href="https://www.aepd.es" target="_blank" rel="noopener">www.aepd.es</a>).
        </li>
      </ul>
      <p>
        Para ejercer cualquiera de estos derechos, envíanos un email a
        <a href="mailto:privacidad@agesport.org">privacidad@agesport.org</a>
        indicando el derecho que deseas ejercer.
      </p>

      <h2>8. Seguridad</h2>
      <p>
        Aplicamos medidas técnicas y organizativas apropiadas para
        proteger tus datos:
      </p>
      <ul>
        <li>
          Cifrado en reposo de identificadores y datos sensibles
          (DNI/NIE, teléfono) con AES-256-CBC.
        </li>
        <li>
          Cifrado en tránsito (HTTPS/TLS) en todas las comunicaciones.
        </li>
        <li>
          Contraseñas almacenadas con bcrypt (factor de coste 12).
        </li>
        <li>
          Tokens de recuperación de contraseña con caducidad de 1 hora
          y de un solo uso.
        </li>
        <li>
          Registro de auditoría de accesos a datos personales.
        </li>
      </ul>

      <h2>9. Cookies</h2>
      <p>
        Esta plataforma utiliza exclusivamente cookies técnicas
        estrictamente necesarias para el funcionamiento del servicio
        (sesión autenticada). No se utilizan cookies de
        seguimiento, publicidad ni analítica de terceros.
      </p>

      <h2>10. Cambios en esta política</h2>
      <p>
        Esta política puede actualizarse para reflejar cambios
        normativos o de la propia plataforma. La fecha de la última
        actualización aparece al inicio de este documento. Si los
        cambios son sustanciales, te lo notificaremos por email.
      </p>

    $legacy$, 'legacy_html','Texto existente de junio de 2026; archivado sin nueva aprobación jurídica')
ON CONFLICT(id) DO NOTHING;
SELECT setval(pg_get_serial_sequence('privacy_versions','id'),GREATEST(1,(SELECT max(id) FROM privacy_versions)));
CREATE TABLE IF NOT EXISTS privacy_draft (
 id INTEGER PRIMARY KEY CHECK(id=1), title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '',
 revision INTEGER NOT NULL DEFAULT 0, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), admin_id INTEGER REFERENCES administradores(id) ON DELETE SET NULL
);
INSERT INTO privacy_draft(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS privacy_responses (
 id BIGSERIAL PRIMARY KEY, socio_id INTEGER REFERENCES socios(id) ON DELETE SET NULL,
 version_id INTEGER REFERENCES privacy_versions(id), purpose TEXT NOT NULL, answer BOOLEAN NOT NULL,
 label TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('registration','profile')),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS privacy_responses_socio_idx ON privacy_responses(socio_id,recorded_at);
CREATE TABLE IF NOT EXISTS empresas_vinculadas (
 id SERIAL PRIMARY KEY, nombre TEXT NOT NULL, referencia TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS patrocinios (
 id SERIAL PRIMARY KEY, empresa_id INTEGER NOT NULL REFERENCES empresas_vinculadas(id),
 modalidad TEXT NOT NULL, inicio DATE NOT NULL, fin DATE, notas TEXT,
 configuracion_futura JSONB NOT NULL DEFAULT '{"estado":"pendiente_aprobacion","cupos":null,"condiciones":null}'::jsonb,
 CHECK(fin IS NULL OR fin >= inicio), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS vinculos_persona (
 id SERIAL PRIMARY KEY, socio_id INTEGER NOT NULL REFERENCES socios(id), empresa_id INTEGER NOT NULL REFERENCES empresas_vinculadas(id),
 patrocinio_id INTEGER REFERENCES patrocinios(id), motivo TEXT NOT NULL,
 inicio DATE NOT NULL, fin DATE, CHECK(fin IS NULL OR fin >= inicio),
 created_by INTEGER REFERENCES administradores(id) ON DELETE SET NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS vinculos_historial (
 id BIGSERIAL PRIMARY KEY, tipo TEXT NOT NULL, recurso_id INTEGER NOT NULL,
 admin_id INTEGER REFERENCES administradores(id) ON DELETE SET NULL, datos JSONB NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
