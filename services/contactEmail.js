// services/contactEmail.js
// Resolución única de los emails de un socio. `socios.email` es el email de
// acceso (login) y no se usa para comunicaciones una vez que el socio ha
// elegido otro: los avisos van a `email_preferido` y el directorio muestra
// `email_visible`, ambos independientes del email de acceso.

const validEmail = (v) => typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

function professionalEmail(socio) {
  if (!socio) return null;
  if (validEmail(socio.email_profesional)) return socio.email_profesional.trim();
  return validEmail(socio.email) ? socio.email.trim() : null;
}

// Email en el que el socio recibe avisos y comunicaciones.
function contactEmailFor(socio) {
  if (!socio) return null;
  if (socio.email_preferido === 'personal' && validEmail(socio.email_personal)) {
    return socio.email_personal.trim();
  }
  return professionalEmail(socio);
}

// Email que el socio muestra en su ficha (sólo si visible_email_directo).
function displayEmailFor(socio) {
  if (!socio) return null;
  if (socio.email_visible === 'personal' && validEmail(socio.email_personal)) {
    return socio.email_personal.trim();
  }
  return professionalEmail(socio);
}

module.exports = { contactEmailFor, displayEmailFor, professionalEmail };
