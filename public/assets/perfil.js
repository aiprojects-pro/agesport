(function () {
  const { requireSession, request, logout, setMessage, queryParam, escapeHtml } = window.AgesportPortal;
  const cat = window.AgesportCatalogos;

  const $ = (id) => document.getElementById(id);
  const title = $('profileTitle');
  const intro = $('profileIntro');
  const profileActions = $('profileActions');
  const contactBtn = $('contactBtn');
  const form = $('profileForm');
  const saveBtn = $('saveBtn');
  const profileMessage = $('profileMessage');
  const passwordForm = $('passwordForm');
  const passwordBtn = $('passwordBtn');
  const passwordMessage = $('passwordMessage');
  const mediaCard = $('mediaCard');
  const bajaCard = $('bajaCard');
  const fotoInput = $('fotoInput');
  const cvInput = $('cvInput');
  const avatarPreview = $('avatarPreview');
  const cvStatus = $('cvStatus');
  const cvViewBtn = $('cvViewBtn');
  const cvDeleteBtn = $('cvDeleteBtn');
  const mediaMessage = $('mediaMessage');
  const bajaForm = $('bajaForm');
  const bajaBtn = $('bajaBtn');
  const bajaMessage = $('bajaMessage');
  const orgField = $('orgField');
  const especialidadesList = $('especialidadesList');
  const rolDescripcion = $('rolDescripcion');

  $('logoutBtn').addEventListener('click', logout);

  let currentSession;
  let profileId;
  let isOwnProfile = false;

  // ===== Inicialización de selects desde el catálogo =====
  cat.fillTiposSocioSelect($('tipo_socio'), { placeholder: 'Selecciona tipo de socio' });
  cat.fillRolesSelect($('rol_cluster'), { placeholder: 'Selecciona rol principal' });
  cat.fillRolesSelect($('rol_secundario'), { placeholder: 'Sin segundo rol' });
  // CCAA
  const ccaaSelect = $('comunidad_autonoma');
  cat.COMUNIDADES_AUTONOMAS.forEach(function (ca) {
    const opt = document.createElement('option');
    opt.value = ca.slug;
    opt.textContent = ca.label;
    ccaaSelect.appendChild(opt);
  });
  // Provincia inicial: todas
  cat.fillProvincesSelect($('provincia'), { placeholder: 'Selecciona provincia' });

  // Cascada CCAA → provincias
  ccaaSelect.addEventListener('change', function () {
    const slug = ccaaSelect.value;
    if (!slug) {
      cat.fillProvincesSelect($('provincia'), { placeholder: 'Selecciona provincia' });
      return;
    }
    const ca = cat.COMUNIDADES_AUTONOMAS.find(function (c) { return c.slug === slug; });
    const sel = $('provincia');
    sel.innerHTML = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Selecciona provincia';
    sel.appendChild(placeholder);
    ca.provincias.forEach(function (p) {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p;
      sel.appendChild(opt);
    });
  });
  // Inversa: al cambiar provincia, autoselecciona CCAA si está vacía
  $('provincia').addEventListener('change', function () {
    if (!ccaaSelect.value) {
      const ca = cat.findCcaaByProvincia($('provincia').value);
      if (ca) ccaaSelect.value = ca.slug;
    }
  });

  // Especialidades como lista seleccionable (multi-checkbox)
  cat.ESPECIALIDADES.forEach(function (e) {
    const row = document.createElement('label');
    row.className = 'selectable-row';
    row.innerHTML =
      '<input type="checkbox" value="' + e.slug + '">' +
      '<div><strong>' + escapeHtml(e.label) + '</strong>' +
      '<div class="muted" style="font-size:.85rem;line-height:1.4;margin-top:2px">' + escapeHtml(e.descripcion) + '</div></div>' +
      '<span class="rol-chip" data-rol="proveedor_servicios_profesionales" style="visibility:hidden">·</span>';
    especialidadesList.appendChild(row);
  });

  // Tipo socio: campos de organización (persona jurídica) o de la persona.
  function applyTipoSocio(tipo) {
    const corporativo = tipo === 'asociado_corporativo';
    orgField.style.display = corporativo ? '' : 'none';
    $('anosLabel').innerHTML = (corporativo ? 'Años de actividad de la organización' : 'Años de experiencia en el sector deportivo <span class="req" aria-hidden="true">*</span>');
    $('cargoField').querySelector('label').innerHTML = corporativo ? 'Cargo de la persona de contacto' : 'Cargo actual <span class="req" aria-hidden="true">*</span>';
  }
  $('tipo_socio').addEventListener('change', function () { applyTipoSocio($('tipo_socio').value); });
  const verFichas = $('verFichasTipo');
  if (verFichas) verFichas.addEventListener('click', function (ev) { ev.preventDefault(); if (window.AgesportFichas) window.AgesportFichas.open({ tipo: $('tipo_socio').value }); });

  // Descripción del rol seleccionado
  $('rol_cluster').addEventListener('change', function () {
    const rol = cat.findRolBySlug($('rol_cluster').value);
    rolDescripcion.textContent = rol ? rol.descripcion : '';
    rolDescripcion.style.color = rol ? rol.color : '';
  });

  // ===== Decisiones obligatorias (radios sí/no) =====
  function radioValue(name) {
    const el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  }
  function setRadio(name, value) {
    form.querySelectorAll('input[name="' + name + '"]').forEach(function (r) { r.checked = value !== null && value !== undefined && r.value === value; });
  }
  const yesNo = function (v) { return v ? 'si' : 'no'; };

  const COLLAB_IDS = ['tutor_mentor','ponente','asistente','representacion','captacion_patrocinio','congreso_almeria'];
  function syncConditional() {
    const segundo = radioValue('dec_segundo_rol') === 'si';
    $('rolSecundarioWrap').hidden = !segundo;
    if (!segundo) $('rol_secundario').value = '';
    const b2b = radioValue('dec_b2b') === 'si';
    $('b2bOpciones').hidden = !b2b;
    if (!b2b) ['b2b_ofrece','b2b_busca','b2b_licita'].forEach(function (id) { $(id).checked = false; });
    const disp = $('disponibilidad').value;
    const collab = disp && disp !== 'ninguna';
    $('colaboracionOpciones').hidden = !collab;
    if (!collab) COLLAB_IDS.forEach(function (id) { $(id).checked = false; });
    const pref = radioValue('email_preferido');
    const target = pref === 'personal' ? $('email_personal').value.trim() : (pref === 'profesional' ? $('email_profesional').value.trim() : '');
    $('emailContactoResumen').textContent = target ? 'Los avisos y comunicaciones se enviarán a ' + target + '.' : (pref === 'personal' ? 'Escribe tu email personal para poder usarlo.' : '');
    renderPending();
  }
  form.addEventListener('change', syncConditional);
  form.addEventListener('input', syncConditional);

  // Lista de lo que falta. Cada entrada: [elemento a enfocar, texto].
  function collectPending() {
    const out = [];
    const need = function (cond, el, label) { if (cond) out.push([el, label]); };
    const firstRadio = function (name) { return form.querySelector('input[name="' + name + '"]'); };
    need(!radioValue('dec_directorio'), firstRadio('dec_directorio'), 'Aparecer en el directorio');
    need(!radioValue('dec_mapa'), firstRadio('dec_mapa'), 'Aparecer en el mapa');
    need(!radioValue('dec_mensajeria'), firstRadio('dec_mensajeria'), 'Aceptar mensajes');
    need(!$('email_profesional').value.trim(), $('email_profesional'), 'Email profesional');
    need(!radioValue('email_preferido'), firstRadio('email_preferido'), 'Email para avisos');
    need(radioValue('email_preferido') === 'personal' && !$('email_personal').value.trim(), $('email_personal'), 'Email personal (lo has elegido para avisos)');
    need(!radioValue('dec_avisos'), firstRadio('dec_avisos'), 'Avisos de mensajes por email');
    need(!radioValue('dec_email_ficha'), firstRadio('dec_email_ficha'), 'Email visible en la ficha');
    need(radioValue('dec_email_ficha') === 'personal' && !$('email_personal').value.trim(), $('email_personal'), 'Email personal (lo has elegido para tu ficha)');
    need(!$('nombre').value.trim(), $('nombre'), 'Nombre');
    need(!$('apellidos').value.trim(), $('apellidos'), 'Apellidos');
    const corporativo = $('tipo_socio').value === 'asociado_corporativo';
    need(corporativo && !$('nombre_organizacion').value.trim(), $('nombre_organizacion'), 'Nombre de la organización');
    need(!corporativo && !$('cargo_actual').value.trim(), $('cargo_actual'), 'Cargo actual');
    need(!corporativo && $('anos_experiencia').value === '', $('anos_experiencia'), 'Años de experiencia');
    need(!$('provincia').value, $('provincia'), 'Provincia');
    need(!$('localidad').value.trim(), $('localidad'), 'Localidad');
    need(!$('rol_cluster').value, $('rol_cluster'), 'Rol principal');
    need(!radioValue('dec_segundo_rol'), firstRadio('dec_segundo_rol'), 'Segundo rol (sí/no)');
    need(radioValue('dec_segundo_rol') === 'si' && !$('rol_secundario').value, $('rol_secundario'), 'Elegir el segundo rol');
    need(radioValue('dec_segundo_rol') === 'si' && $('rol_secundario').value && $('rol_secundario').value === $('rol_cluster').value, $('rol_secundario'), 'El segundo rol debe ser distinto del principal');
    need(!$('disponibilidad').value, $('disponibilidad'), 'Nivel de disponibilidad');
    need(!radioValue('dec_b2b'), firstRadio('dec_b2b'), 'Intereses de colaboración (sí/no)');
    need(radioValue('dec_b2b') === 'si' && !['b2b_ofrece','b2b_busca','b2b_licita'].some(function (id) { return $(id).checked; }), $('b2b_ofrece'), 'Marcar al menos un interés de colaboración');
    return out;
  }
  function renderPending() {
    const pending = collectPending();
    form.querySelectorAll('.decision, .field').forEach(function (el) { el.classList.remove('is-pending'); });
    pending.forEach(function (p) { const box = p[0] && p[0].closest('.decision, .field, .field-full'); if (box) box.classList.add('is-pending'); });
    $('pendingSummary').textContent = pending.length
      ? 'Falta por completar o decidir (' + pending.length + '): ' + pending.map(function (p) { return p[1]; }).join(' · ')
      : 'Todo listo para guardar.';
    $('pendingSummary').classList.toggle('ok', !pending.length);
    return pending;
  }

  // ===== Carga de datos del perfil =====
  function fillForm(socio) {
    ['nombre', 'apellidos', 'email', 'email_personal', 'email_profesional', 'telefono', 'entidad', 'cargo_actual',
     'anos_experiencia', 'localidad', 'linkedin_url', 'web_profesional', 'direccion_completa',
     'nombre_organizacion', 'ambito', 'sexo', 'sector', 'telefono_personal', 'rol_secundario'].forEach(function (id) {
      const el = $(id);
      if (el) el.value = socio[id] == null ? '' : socio[id];
    });

    if (!socio.email_profesional) $('email_profesional').value = socio.email || '';
    $('tipo_socio').value = socio.tipo_socio || 'numero';
    applyTipoSocio(socio.tipo_socio);

    // CCAA + provincia (rellena la cascada)
    if (socio.comunidad_autonoma) {
      ccaaSelect.value = socio.comunidad_autonoma;
      ccaaSelect.dispatchEvent(new Event('change'));
    }
    if (socio.provincia) $('provincia').value = socio.provincia;
    if (!socio.comunidad_autonoma && socio.provincia) {
      const ca = cat.findCcaaByProvincia(socio.provincia);
      if (ca) ccaaSelect.value = ca.slug;
    }

    if (socio.rol_cluster) {
      $('rol_cluster').value = socio.rol_cluster;
      const rol = cat.findRolBySlug(socio.rol_cluster);
      if (rol) {
        rolDescripcion.textContent = rol.descripcion;
        rolDescripcion.style.color = rol.color;
      }
    }

    // Especialidades (parseado de PG array si viene como string)
    const especialidades = Array.isArray(socio.especialidades)
      ? socio.especialidades
      : window.AgesportPortal.parsePgArray(socio.especialidades);
    Array.from(especialidadesList.querySelectorAll('input[type=checkbox]')).forEach(function (cb) {
      cb.checked = especialidades.indexOf(cb.value) !== -1;
    });


    // Foto y CV
    if (socio.foto_url) {
      avatarPreview.innerHTML = '';
      avatarPreview.style.backgroundImage = 'url("' + socio.foto_url + '")';
      avatarPreview.style.backgroundSize = 'cover';
      avatarPreview.style.backgroundPosition = 'center';
    }
    if (socio.cv_url) {
      cvStatus.textContent = 'CV subido correctamente.';
      cvViewBtn.style.display = '';
      cvViewBtn.href = socio.cv_url + '?acceso=privado-v2';
      cvDeleteBtn.style.display = '';
    }

    ['visible_telefono','visible_telefono_personal','visible_web_profesional','visible_linkedin',
     'b2b_ofrece','b2b_busca','b2b_licita','tutor_mentor','ponente','asistente','representacion','captacion_patrocinio','congreso_almeria'].forEach(function (key) {
      const el = $(key);
      if (el) el.checked = !!socio[key];
    });

    // Decisiones: si el socio ya las confirmó, se muestran sus respuestas;
    // si no, quedan sin marcar para obligarle a elegir (antes un "no" por
    // defecto se confundía con una decisión y el socio no aparecía).
    const reviewed = !!socio.preferencias_revisadas_at;
    const b2bAny = !!(socio.b2b_ofrece || socio.b2b_busca || socio.b2b_licita);
    setRadio('dec_directorio', reviewed || socio.acepta_visibilidad_datos ? yesNo(socio.acepta_visibilidad_datos) : null);
    setRadio('dec_mapa', reviewed || socio.acepta_mapa_interactivo ? yesNo(socio.acepta_mapa_interactivo) : null);
    setRadio('dec_mensajeria', reviewed || socio.acepta_mensajeria ? yesNo(socio.acepta_mensajeria) : null);
    setRadio('dec_avisos', reviewed || socio.acepta_notificaciones_email ? yesNo(socio.acepta_notificaciones_email) : null);
    setRadio('email_preferido', reviewed ? (socio.email_preferido || 'profesional') : (socio.email_preferido === 'personal' ? 'personal' : null));
    setRadio('dec_email_ficha', socio.visible_email_directo ? (socio.email_visible || 'profesional') : (reviewed ? 'no' : null));
    setRadio('dec_segundo_rol', socio.rol_secundario ? 'si' : (reviewed ? 'no' : null));
    setRadio('dec_b2b', b2bAny ? 'si' : (reviewed ? 'no' : null));
    $('disponibilidad').value = socio.disponibilidad || (reviewed ? 'ninguna' : '');
    $('pendingBanner').hidden = reviewed;
    $('pendingBanner').innerHTML = reviewed ? '' : '<strong>Tienes decisiones pendientes.</strong> Para aparecer en el directorio y en el mapa, responde a las preguntas marcadas como «Decisión obligatoria» y guarda el perfil.';
    syncConditional();
  }

  function showPublicProfile(socio) {
    form.closest('article').hidden = true;
    mediaCard.hidden = true;
    passwordForm.closest('article').hidden = true;
    bajaCard.hidden = true;
    $('portabilityCard').hidden = true;
    const card = document.createElement('article'); card.className='form-card';
    const labels = {entidad:'Entidad', nombre_organizacion:'Organización', cargo_actual:'Cargo', localidad:'Localidad', provincia:'Provincia', email:'Email de contacto', telefono:'Teléfono profesional', telefono_personal:'Teléfono personal', web_profesional:'Web', linkedin_url:'LinkedIn'};
    card.innerHTML='<h2>Ficha profesional</h2><dl>'+Object.keys(labels).filter(k => socio[k]).map(k => '<dt><strong>'+labels[k]+'</strong></dt><dd style="overflow-wrap:anywhere;margin:4px 0 16px">'+escapeHtml(socio[k])+'</dd>').join('')+'</dl>';
    const roles = [socio.rol_cluster,socio.rol_secundario].filter(Boolean).map(slug => cat.findRolBySlug(slug)?.label || slug);
    const specialties = (socio.especialidades || []).map(slug => cat.findEspecialidadBySlug(slug)?.label || slug);
    card.innerHTML += '<p><strong>Roles:</strong> '+escapeHtml(roles.join(' · ') || 'Sin declarar')+'</p><p><strong>Especialidades:</strong> '+escapeHtml(specialties.join(' · ') || 'Sin declarar')+'</p>';
    if (socio.cv_url) { const link=document.createElement('a'); link.href=socio.cv_url+'?acceso=privado-v2'; link.textContent='Descargar CV'; link.className='btn btn-secondary'; card.appendChild(link); }
    form.closest('article').before(card);
    contactBtn.hidden = !socio.acepta_mensajeria;
    intro.textContent='Información profesional compartida en el entorno privado de AGESPORT.';
  }

  // ===== Subida de foto =====
  fotoInput.addEventListener('change', async function () {
    if (!fotoInput.files || !fotoInput.files[0]) return;
    const fd = new FormData();
    fd.append('foto', fotoInput.files[0]);
    setMessage(mediaMessage, true, 'Subiendo foto...');
    try {
      const res = await fetch('/api/socios/perfil/foto', {
        method: 'POST', credentials: 'same-origin', body: fd
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error subiendo foto');
      avatarPreview.classList.remove('placeholder');
      avatarPreview.style.backgroundImage = 'url("' + data.foto_url + '")';
      setMessage(mediaMessage, true, 'Foto actualizada correctamente.');
    } catch (err) {
      setMessage(mediaMessage, false, err.message);
    }
  });

  // ===== Subida de CV =====
  cvInput.addEventListener('change', async function () {
    if (!cvInput.files || !cvInput.files[0]) return;
    const fd = new FormData();
    fd.append('cv', cvInput.files[0]);
    setMessage(mediaMessage, true, 'Subiendo CV...');
    try {
      const res = await fetch('/api/socios/perfil/cv', {
        method: 'POST', credentials: 'same-origin', body: fd
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error subiendo CV');
      cvStatus.textContent = 'CV subido correctamente.';
      cvViewBtn.style.display = '';
      cvViewBtn.href = data.cv_url;
      cvDeleteBtn.style.display = '';
      setMessage(mediaMessage, true, 'CV actualizado correctamente.');
    } catch (err) {
      setMessage(mediaMessage, false, err.message);
    }
  });

  cvDeleteBtn.addEventListener('click', async function () {
    if (!window.confirm('¿Quitar el CV?')) return;
    try {
      await request('/api/socios/perfil/cv', { method: 'DELETE' });
      cvStatus.textContent = 'No has subido CV todavía.';
      cvViewBtn.style.display = 'none';
      cvDeleteBtn.style.display = 'none';
      cvViewBtn.href = '#';
      setMessage(mediaMessage, true, 'CV eliminado.');
    } catch (err) {
      setMessage(mediaMessage, false, err.message);
    }
  });

  // ===== Inicialización de sesión =====
  requireSession('socio').then(async function (session) {
    currentSession = session;
    profileId = queryParam('id') || queryParam('socioId') || session.user.id;
    isOwnProfile = String(profileId) === String(session.user.id);

    const data = await request('/api/socios/perfil/' + profileId, { method: 'GET', headers: {} });
    const socio = data.socio;

    title.textContent = isOwnProfile
      ? 'Mi perfil profesional'
      : (socio.nombre || '') + ' ' + (socio.apellidos || '');
    intro.textContent = isOwnProfile
      ? 'Actualiza tu información profesional, visibilidad y preferencias del entorno privado.'
      : 'Estás viendo la ficha pública de este socio. No puedes editar sus datos.';

    fillForm(socio);
    if (isOwnProfile) {
      $('locationStatus').textContent = socio.ubicacion_estado === 'municipio' ? 'Ubicación disponible a nivel de municipio.' : socio.ubicacion_estado === 'provincia' ? 'El mapa utiliza una referencia aproximada de tu provincia. Guarda tu localidad para intentar precisar el municipio.' : 'Ubicación pendiente: revisa provincia y localidad.';
    }

    if (!isOwnProfile) {
      profileActions.style.display = 'flex';
      contactBtn.href = '/mensajes.html?receptor=' + encodeURIComponent(profileId);
      contactBtn.textContent = 'Contactar con ' + (socio.nombre || '');
      showPublicProfile(socio);
    }
  }).catch(function () {});

  // ===== Guardar perfil =====
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!isOwnProfile) return;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';

    const especialidades = Array.from(especialidadesList.querySelectorAll('input[type=checkbox]:checked'))
      .map(function (cb) { return cb.value; });

    try {
      const pending = renderPending();
      if (pending.length) {
        const first = pending[0][0];
        if (first && first.focus) first.focus();
        throw new Error('Antes de guardar, completa o decide: ' + pending.map(function (p) { return p[1]; }).join(' · ') + '.');
      }
      const emailFicha = radioValue('dec_email_ficha');
      const disponibilidad = $('disponibilidad').value;
      await request('/api/socios/perfil', {
        method: 'PUT',
        body: JSON.stringify({
          policy_version_id: window.AgesportPolicyContext.id,
          confirmar_preferencias: true,
          b2b_ofrece: $('b2b_ofrece').checked,
          b2b_busca: $('b2b_busca').checked,
          b2b_licita: $('b2b_licita').checked,
          nombre: $('nombre').value.trim(),
          apellidos: $('apellidos').value.trim(),
          nombre_organizacion: $('nombre_organizacion').value.trim() || null,
          email_profesional: $('email_profesional').value.trim(),
          email_personal: $('email_personal').value.trim() || null,
          email_preferido: radioValue('email_preferido'),
          email_visible: emailFicha === 'personal' ? 'personal' : 'profesional',
          visible_email_directo: emailFicha !== 'no',
          telefono: $('telefono').value.trim() || null,
          telefono_personal: $('telefono_personal').value.trim() || null,
          sector: $('sector').value || null,
          rol_secundario: radioValue('dec_segundo_rol') === 'si' ? $('rol_secundario').value : null,
          visible_telefono_personal: $('visible_telefono_personal').checked,
          entidad: $('entidad').value.trim(),
          cargo_actual: $('cargo_actual').value.trim(),
          anos_experiencia: $('anos_experiencia').value === '' ? null : Number($('anos_experiencia').value),
          comunidad_autonoma: ccaaSelect.value || null,
          provincia: $('provincia').value,
          localidad: $('localidad').value.trim(),
          rol_cluster: $('rol_cluster').value || null,
          especialidades: especialidades,
          linkedin_url: $('linkedin_url').value.trim(),
          web_profesional: $('web_profesional').value.trim(),
          direccion_completa: $('direccion_completa').value.trim(),
          acepta_visibilidad_datos: radioValue('dec_directorio') === 'si',
          acepta_mapa_interactivo: radioValue('dec_mapa') === 'si',
          acepta_mensajeria: radioValue('dec_mensajeria') === 'si',
          acepta_notificaciones_email: radioValue('dec_avisos') === 'si',
          visible_telefono: $('visible_telefono').checked,
          visible_web_profesional: $('visible_web_profesional').checked,
          visible_linkedin: $('visible_linkedin').checked,
          sexo: $('sexo').value || null,
          disponibilidad: disponibilidad,
          tutor_mentor: $('tutor_mentor').checked,
          ponente: $('ponente').checked,
          asistente: $('asistente').checked,
          representacion: $('representacion').checked,
          captacion_patrocinio: $('captacion_patrocinio').checked,
          congreso_almeria: $('congreso_almeria').checked
        })
      });
      $('pendingBanner').hidden = true;
      setMessage(profileMessage, true, '✓ Perfil actualizado correctamente.');
      // Auditoría 19 jun #5: la usuaria reportaba que no aparecía
      // mensaje de confirmación. El mensaje SÍ se pintaba pero
      // quedaba fuera del viewport (debajo del botón). Forzamos
      // scroll para que sea inmediatamente visible.
      try { profileMessage.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      catch (_) { profileMessage.scrollIntoView(); }
    } catch (error) {
      setMessage(profileMessage, false, error.message);
      try { profileMessage.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      catch (_) { profileMessage.scrollIntoView(); }
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Guardar cambios';
    }
  });

  // ===== Cambio de contraseña =====
  passwordForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    passwordBtn.disabled = true;
    passwordBtn.textContent = 'Actualizando...';
    try {
      const passwordError=window.AgesportPassword.error($('newPassword').value);if(passwordError)throw new Error(passwordError);
      await request('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: $('currentPassword').value,
          newPassword: $('newPassword').value
        })
      });
      passwordForm.reset();
      setMessage(passwordMessage, true, '✓ Contraseña actualizada correctamente.');
      try { passwordMessage.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
    } catch (error) {
      setMessage(passwordMessage, false, error.message);
      try { passwordMessage.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (_) {}
    } finally {
      passwordBtn.disabled = false;
      passwordBtn.textContent = 'Actualizar contraseña';
    }
  });

  // ===== Portabilidad RGPD: descargar mis datos =====
  const portabilityBtn = $('portabilityBtn');
  const portabilityMessage = $('portabilityMessage');
  if (portabilityBtn) {
    portabilityBtn.addEventListener('click', async function () {
      portabilityBtn.disabled = true;
      const oldLabel = portabilityBtn.textContent;
      portabilityBtn.textContent = 'Generando...';
      try {
        // El endpoint devuelve JSON con todos los datos del socio.
        // Usamos fetch directamente para poder crear el Blob.
        const res = await fetch('/api/socios/mis-datos/exportar', {
          credentials: 'same-origin',
        });
        if (!res.ok) {
          const err = await res.json().catch(function () { return {}; });
          throw new Error(err.error || 'No se pudo generar el fichero');
        }
        const data = await res.json();
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const fecha = new Date().toISOString().slice(0, 10);
        a.download = 'agesport-mis-datos-' + fecha + '.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        setMessage(portabilityMessage, true, 'Fichero descargado correctamente.');
      } catch (error) {
        setMessage(portabilityMessage, false, error.message);
      } finally {
        portabilityBtn.disabled = false;
        portabilityBtn.textContent = oldLabel;
      }
    });
  }

  // ===== Solicitud de baja =====
  bajaForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!window.confirm('¿Seguro que quieres solicitar tu baja? La administración revisará tu petición.')) return;
    bajaBtn.disabled = true;
    bajaBtn.textContent = 'Enviando...';
    try {
      await request('/api/socios/solicitar-baja', {
        method: 'POST',
        body: JSON.stringify({ motivo: $('bajaMotivo').value.trim() || null })
      });
      setMessage(bajaMessage, true, 'Solicitud enviada correctamente. Recibirás noticias en breve.');
      bajaForm.reset();
    } catch (error) {
      setMessage(bajaMessage, false, error.message);
    } finally {
      bajaBtn.disabled = false;
      bajaBtn.textContent = 'Solicitar baja';
    }
  });
})();
