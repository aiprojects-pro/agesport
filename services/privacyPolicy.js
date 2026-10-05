const db = require('../config/database');
const labels = {
  acepta_mapa_interactivo:
    'Autorizo la participación de mi perfil en el entorno privado y en las dinámicas internas de relación profesional.',
  acepta_visibilidad_datos:
    'Acepto la visibilidad de mis datos profesionales dentro del espacio privado de la plataforma.',
  acepta_mensajeria: 'Acepto el uso de mensajería interna por parte de otros socios autenticados.',
  acepta_notificaciones_email: 'Recibir avisos de mensajes por correo',
  visible_telefono: 'Mostrar teléfono profesional',
  visible_telefono_personal: 'Mostrar teléfono personal',
  visible_email_directo: 'Mostrar correo en el directorio',
  visible_web_profesional: 'Mostrar web profesional',
  visible_linkedin: 'Mostrar LinkedIn',
};
async function current(client = db) {
  return (await client.query('SELECT * FROM privacy_versions ORDER BY id DESC LIMIT 1')).rows[0];
}
async function record(client, socioId, body, source) {
  await client.query('SELECT pg_advisory_xact_lock(824601)');
  const policy = await current(client);
  // A policy version is attached only when the client actually identified the text shown.
  const version = body.policy_version_id == null ? null : Number(body.policy_version_id);
  if (source === 'registration' && policy.format !== 'legacy_html' && version === null) {
    const e = new Error('Consulta la política vigente antes de enviar la solicitud.');
    e.status = 409;
    throw e;
  }
  if (version !== null && (!Number.isInteger(version) || version !== policy.id)) {
    const e = new Error(
      'La política se ha actualizado. Abre la política vigente, revisa su contenido y vuelve a enviar el formulario. Tus datos se conservan.'
    );
    e.status = 409;
    throw e;
  }
  for (const [purpose, label] of Object.entries(labels))
    if (typeof body[purpose] === 'boolean') {
      await client.query(
        'INSERT INTO privacy_responses(socio_id,version_id,purpose,answer,label,source) VALUES($1,$2,$3,$4,$5,$6)',
        [
          socioId,
          version,
          purpose,
          body[purpose],
          source === 'profile' && purpose === 'acepta_mapa_interactivo'
            ? 'Mostrarme en el mapa'
            : label,
          source,
        ]
      );
    }
}
module.exports = { current, record };
