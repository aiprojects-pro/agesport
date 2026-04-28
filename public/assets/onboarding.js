/* ============================================================
   AGESPORT — Activación de cuenta (onboarding)
   Lee el token de la URL, recupera la invitación de localStorage
   y guía al usuario por los 4 pasos del alta.
   ============================================================ */

(function () {
  'use strict';

  const D  = window.AgesportData;
  const $  = AgesportPortal.$;
  const $$ = AgesportPortal.$$;

  const INV_KEY = 'agesport_invitations_v1';

  /* --------------------- Texto de las cláusulas --------------------- */
  /* Versión resumida; los textos completos los entrega la asociación.   */

  const CLAUSULAS = [
    {
      id: 'rgpd',
      titulo: 'Política de privacidad y protección de datos (RGPD)',
      texto: 'He sido informado/a y consiento el tratamiento de mis datos personales por parte de AGESPORT con la finalidad de gestionar mi alta como socio, mantener actualizado el directorio del clúster y posibilitar la mensajería interna. La base jurídica es mi consentimiento, conforme al Reglamento (UE) 2016/679 y la LOPDGDD 3/2018. Puedo ejercer mis derechos de acceso, rectificación, supresión, oposición, limitación y portabilidad escribiendo a dpo@agesport.es.'
    },
    {
      id: 'estatutos',
      titulo: 'Adhesión a los estatutos y régimen interno de AGESPORT',
      texto: 'Declaro conocer y aceptar los estatutos vigentes de la Asociación Andaluza de Profesionales del Deporte, así como su régimen interno, fines, derechos y obligaciones de los socios, y me comprometo a colaborar con sus actividades en la medida de mis posibilidades.'
    },
    {
      id: 'codigo_etico',
      titulo: 'Código ético y deontológico del clúster',
      texto: 'Me comprometo a actuar con integridad, transparencia y respeto en todas mis relaciones con el resto de socios y con terceros. Acepto evitar prácticas anticompetitivas, conflictos de interés no declarados y cualquier conducta contraria a la legalidad vigente o a los principios de buen gobierno del clúster.'
    },
    {
      id: 'reglamento',
      titulo: 'Reglamento del Mapa del Talento y mensajería',
      texto: 'Acepto las condiciones de uso de la plataforma Mapa del Talento, incluida la utilización responsable de la mensajería interna (privada y pública), el respeto a la confidencialidad de los datos a los que pueda acceder y la prohibición expresa de utilizarla para finalidades comerciales no autorizadas o publicidad no solicitada.'
    },
    {
      id: 'imagen',
      titulo: 'Cesión de imagen y datos profesionales en el directorio',
      texto: 'Autorizo a AGESPORT a publicar mi nombre, apellidos, cargo, entidad, fotografía de perfil (cuando la aporte) y especialidades en el directorio del clúster y en el visor geográfico, con el único fin de hacer posible la conexión profesional entre socios. Podré desactivar esta visibilidad en cualquier momento desde mi perfil.'
    }
  ];

  /* --------------------- Carga de invitación --------------------- */

  function getToken() {
    return new URLSearchParams(window.location.search).get('token');
  }

  function loadInvitations() {
    try {
      const raw = localStorage.getItem(INV_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }
  function saveInvitations(arr) {
    try { localStorage.setItem(INV_KEY, JSON.stringify(arr)); } catch (e) {}
  }

  const token = getToken();
  const invitaciones = loadInvitations();
  const invitacion = invitaciones.find(function (i) { return i.token === token; });

  /* --------------------- Estados de error --------------------- */

  function showInvalid(title, text) {
    $('#invalidTitle').textContent = title;
    $('#invalidText').textContent = text;
    $('#invalidState').style.display = 'block';
    $('#onboardingFlow').style.display = 'none';
  }

  if (!token) {
    showInvalid('Falta el token de invitación', 'Este enlace no contiene un token de invitación. Pide al administrador que te reenvíe el correo de alta.');
    return;
  }
  if (!invitacion) {
    showInvalid('Enlace no válido', 'No encontramos esta invitación. Es posible que haya sido revocada por el administrador o que el enlace esté incompleto.');
    return;
  }
  if (invitacion.estado === 'aceptada') {
    showInvalid('Esta invitación ya fue utilizada', 'La cuenta asociada a este enlace ya fue activada. Si eres tú, accede desde la página de acceso con tu email y contraseña.');
    return;
  }
  if (invitacion.estado === 'revocada') {
    showInvalid('Invitación revocada', 'El administrador ha revocado este enlace. Ponte en contacto con la organización para que te envíe una nueva invitación.');
    return;
  }
  if (invitacion.expiraAt && new Date(invitacion.expiraAt) < new Date()) {
    invitacion.estado = 'expirada';
    saveInvitations(invitaciones);
    showInvalid('Enlace caducado', 'Este enlace de invitación ha caducado. Pide al administrador que te envíe uno nuevo.');
    return;
  }

  $('#onboardingFlow').style.display = 'block';

  /* --------------------- Paso 1: bienvenida --------------------- */

  $('#welcomeName').textContent = invitacion.nombre || '';
  $('#invitedBy').textContent  = (invitacion.organizacionInvitadora || 'AGESPORT')
    + (invitacion.invitadoPor ? ' (' + invitacion.invitadoPor + ')' : '');
  $('#welcomeEmail').textContent = invitacion.email;
  $('#welcomeProvincia').textContent = invitacion.provincia || '—';
  (function setTipoLabel() {
    if (invitacion.tipoSocio === 'corporativo') {
      const meta = D.tipoCorpMeta(invitacion.tipoCorporativo);
      const sub  = meta ? meta.etiqueta : invitacion.tipoCorporativo;
      $('#welcomeTipo').textContent = 'Socio Corporativo' + (sub ? ' · ' + sub : '');
    } else {
      $('#welcomeTipo').textContent = 'Socio de Número';
    }
  })();

  /* --------------------- Paso 2: cláusulas --------------------- */

  $('#clausesList').innerHTML = CLAUSULAS.map(function (c) {
    return ''
      + '<label class="clause-item" data-id="' + c.id + '">'
      + '  <div class="clause-item-head">'
      + '    <input type="checkbox" data-clause="' + c.id + '">'
      + '    <strong>' + c.titulo + '</strong>'
      + '  </div>'
      + '  <p>' + c.texto + '</p>'
      + '</label>';
  }).join('');

  function actualizarBotonClausulas() {
    const total = CLAUSULAS.length;
    const marcadas = $$('#clausesList input[type=checkbox]').filter(function (cb) { return cb.checked; }).length;
    const allCb = $('#acceptAllClauses');

    /* Sincroniza el "marcar todas" según el resto */
    allCb.checked = (marcadas === total);
    allCb.indeterminate = (marcadas > 0 && marcadas < total);

    $('#btnClausesNext').disabled = (marcadas !== total);
  }

  $$('#clausesList input[type=checkbox]').forEach(function (cb) {
    cb.addEventListener('change', function () {
      const wrapper = cb.closest('.clause-item');
      if (wrapper) wrapper.classList.toggle('checked', cb.checked);
      actualizarBotonClausulas();
    });
  });
  /* Click en la tarjeta entera (no solo en el checkbox), excepto si pulsas el propio checkbox */
  $$('.clause-item').forEach(function (item) {
    item.addEventListener('click', function (ev) {
      if (ev.target.tagName === 'INPUT') return;
      const cb = item.querySelector('input[type=checkbox]');
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change'));
    });
  });

  $('#acceptAllClauses').addEventListener('change', function () {
    const checked = this.checked;
    $$('#clausesList input[type=checkbox]').forEach(function (cb) {
      cb.checked = checked;
      const w = cb.closest('.clause-item');
      if (w) w.classList.toggle('checked', checked);
    });
    actualizarBotonClausulas();
  });

  /* --------------------- Paso 3: datos --------------------- */

  /* Volcado prefilled */
  $('#dNombre').value = invitacion.nombre || '';
  $('#dApellidos').value = invitacion.apellidos || '';
  $('#dEmail').value = invitacion.email || '';
  $('#dCargo').value = invitacion.cargo || '';
  $('#dLocalidad').value = invitacion.localidad || '';

  $('#dProvincia').innerHTML = '<option value="">Selecciona…</option>'
    + D.PROVINCIAS.map(function (p) {
      return '<option' + (p.nombre === invitacion.provincia ? ' selected' : '') + '>' + p.nombre + '</option>';
    }).join('');

  $('#dRol').innerHTML = '<option value="">Selecciona…</option>'
    + D.ROLES_CLUSTER.map(function (r) {
      return '<option value="' + r.id + '"' + (r.id === invitacion.rolCluster ? ' selected' : '') + '>' + r.nombre + '</option>';
    }).join('');

  $('#dDisp').innerHTML = '<option value="">Selecciona…</option>'
    + D.DISPONIBILIDADES.map(function (d) {
      return '<option value="' + d.id + '">' + d.etiqueta + '</option>';
    }).join('');

  /* Sección corporativa o sección mentor según tipo */
  if (invitacion.tipoSocio === 'corporativo') {
    $('#seccionCorporativo').style.display = '';
    $('#dOrganizacion').value = invitacion.organizacion || '';
    $('#dTipoCorp').innerHTML = '<option value="">Selecciona…</option>'
      + D.TIPOS_CORPORATIVO.map(function (t) {
        return '<option value="' + t.id + '"' + (t.id === invitacion.tipoCorporativo ? ' selected' : '') + '>' + t.etiqueta + '</option>';
      }).join('');
  } else {
    $('#seccionMentor').style.display = '';
    bindSwitch($('#dSwitchMentor'));
  }

  /* Especialidades: precheck las que vinieron en la invitación */
  const setEsp = new Set(invitacion.especialidades || []);
  $('#dEspecialidades').innerHTML = D.ESPECIALIDADES.map(function (e, i) {
    const checked = setEsp.has(e);
    return ''
      + '<label class="especialidad-pick' + (checked ? ' active' : '') + '">'
      + '  <input type="checkbox" name="esp_' + i + '" value="' + e + '"' + (checked ? ' checked' : '') + '>'
      + '  <span>' + e + '</span>'
      + '</label>';
  }).join('');
  $$('#dEspecialidades input').forEach(function (cb) {
    cb.addEventListener('change', function () {
      cb.parentElement.classList.toggle('active', cb.checked);
    });
  });

  function bindSwitch(node) {
    function toggle() {
      const on = !node.classList.contains('on');
      node.classList.toggle('on', on);
      node.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    node.addEventListener('click', toggle);
    node.addEventListener('keydown', function (e) {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(); }
    });
  }

  function validarDatos() {
    const errs = [];
    if (!$('#dNombre').value.trim())    errs.push('nombre');
    if (!$('#dApellidos').value.trim()) errs.push('apellidos');
    if (!$('#dProvincia').value)        errs.push('provincia');
    if (!$('#dRol').value)              errs.push('rol en clúster');
    if (!$('#dDisp').value)             errs.push('disponibilidad');
    if (invitacion.tipoSocio === 'corporativo') {
      if (!$('#dOrganizacion').value.trim()) errs.push('organización');
      if (!$('#dTipoCorp').value)            errs.push('tipo de entidad');
    }
    const espMarcadas = $$('#dEspecialidades input:checked').length;
    if (espMarcadas === 0) errs.push('al menos una especialidad');
    return errs;
  }

  $('#btnDatosNext').addEventListener('click', function () {
    const errs = validarDatos();
    const m = $('#datosMsg');
    if (errs.length) {
      m.className = 'message-box error';
      m.style.display = 'block';
      m.textContent = 'Faltan campos obligatorios: ' + errs.join(', ') + '.';
      return;
    }
    m.style.display = 'none';
    goTo(4);
  });

  /* --------------------- Paso 4: contraseña --------------------- */

  $('#btnFinish').addEventListener('click', function () {
    const a = $('#pwd1').value;
    const b = $('#pwd2').value;
    const m = $('#pwdMsg');
    if (a.length < 8) {
      m.className = 'message-box error';
      m.style.display = 'block';
      m.textContent = 'La contraseña debe tener al menos 8 caracteres.';
      return;
    }
    if (a !== b) {
      m.className = 'message-box error';
      m.style.display = 'block';
      m.textContent = 'Las contraseñas no coinciden. Reintroduce la confirmación.';
      return;
    }

    /* En producción, aquí se enviaría todo al backend (POST /api/invitations/accept).
       En la demo, marcamos la invitación como aceptada con timestamps de cláusulas
       y dejamos al usuario una sesión activa. */
    invitacion.estado = 'aceptada';
    invitacion.aceptadaAt = new Date().toISOString();
    invitacion.clausulasFirmadas = CLAUSULAS.map(function (c) {
      return { id: c.id, firmadaAt: invitacion.aceptadaAt };
    });
    /* Guardamos los datos finales del formulario (snapshot) */
    invitacion.datosFinales = {
      nombre:        $('#dNombre').value.trim(),
      apellidos:     $('#dApellidos').value.trim(),
      telefono:      $('#dTelefono').value.trim(),
      cargo:         $('#dCargo').value.trim(),
      anos:          parseInt($('#dAnos').value, 10) || 0,
      provincia:     $('#dProvincia').value,
      localidad:     $('#dLocalidad').value.trim(),
      rolCluster:    $('#dRol').value,
      disponibilidad:$('#dDisp').value,
      bio:           $('#dBio').value.trim(),
      especialidades:$$('#dEspecialidades input:checked').map(function (cb) { return cb.value; }),
      esMentor:      invitacion.tipoSocio === 'numero' ? $('#dSwitchMentor').classList.contains('on') : false,
      organizacion:  invitacion.tipoSocio === 'corporativo' ? $('#dOrganizacion').value.trim() : null,
      tipoCorp:      invitacion.tipoSocio === 'corporativo' ? $('#dTipoCorp').value : null,
      nif:           invitacion.tipoSocio === 'corporativo' ? $('#dNif').value.trim() : null
    };
    /* OJO: nunca almacenamos la contraseña en claro en localStorage en una demo.
       En producción se enviaría hasheada al backend (bcrypt/argon2). */
    saveInvitations(invitaciones);

    /* Sesión simulada: la siguiente página privada arrancará como "Yo" (Ana)
       igual que el resto de la demo, pero el aviso final ya muestra el nombre real. */
    AgesportPortal.clearSession();
    goTo(5);
  });

  /* --------------------- Navegación entre pasos --------------------- */

  let stepActual = 1;

  function goTo(n) {
    if (n < 1 || n > 5) return;
    /* Mostrar/ocultar panels */
    for (let i = 1; i <= 5; i++) {
      const p = document.getElementById('panel-' + i);
      if (p) p.hidden = (i !== n);
    }
    /* Actualizar stepper visual (solo los 4 primeros pasos son visibles en él) */
    $$('#stepsList .step-item').forEach(function (item, idx) {
      const num = idx + 1;
      item.classList.remove('active', 'done');
      if (num === n) item.classList.add('active');
      else if (num < n) item.classList.add('done');
    });
    stepActual = n;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  $$('[data-next]').forEach(function (b) {
    b.addEventListener('click', function () { goTo(stepActual + 1); });
  });
  $$('[data-back]').forEach(function (b) {
    b.addEventListener('click', function () { goTo(stepActual - 1); });
  });

  /* --------------------- Init --------------------- */

  goTo(1);
})();
