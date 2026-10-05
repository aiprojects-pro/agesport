(async function () {
  const { request, requireSession, logout, escapeHtml: e, setMessage } = window.AgesportPortal;
  const cat = window.AgesportCatalogos,
    $ = (id) => document.getElementById(id);
  let province = '';
  let ready = false,
    review = null,
    busy = false;
  const bindings = {
    search: 'search',
    type: 'tipo_socio',
    role: 'rol_cluster',
    specialty: 'especialidad',
    availability: 'disponibilidad',
  };
  const filters = () =>
    Object.fromEntries(
      Object.entries(bindings)
        .map(([id, key]) => [key, $(id).value])
        .filter(([, v]) => v)
    );
  const communicationFilters = () => ({ ...filters(), provincia: province });
  const signature = () =>
    JSON.stringify({
      filtros: communicationFilters(),
      asunto: $('subject').value,
      cuerpo: $('body').value,
    });
  const invalidate = () => {
    review = null;
    $('send').disabled = true;
    $('audience').textContent = 'Revisa los destinatarios antes de enviar.';
  };
  const options = (id, items) =>
    items.forEach((v) => {
      const o = document.createElement('option');
      o.value = v.value || v.slug;
      o.textContent = v.label;
      $(id).appendChild(o);
    });
  options('type', cat.TIPOS_SOCIO);
  options('role', cat.ROLES_CLUSTER);
  options('specialty', cat.ESPECIALIDADES);
  $('logout').onclick = logout;
  async function members() {
    if (!ready) return;
    const data = await request('/api/delegacion/socios?' + new URLSearchParams(filters()), {
      method: 'GET',
    });
    if (province && province !== data.provincia) invalidate();
    province = data.provincia;
    $('title').textContent = 'Delegación de ' + data.provincia;
    $('scope').textContent = 'Tu acceso está limitado a los socios de ' + data.provincia + '.';
    $('resultCount').textContent = data.total + ' socios encontrados en ' + data.provincia;
    $('members').innerHTML = data.socios.length
      ? data.socios
          .map(
            (s) =>
              '<tr><td>' +
              e([s.nombre, s.apellidos].join(' ')) +
              '</td><td>' +
              e(s.entidad || '—') +
              '</td><td>' +
              e(s.localidad || s.provincia) +
              '</td><td>' +
              e(
                (cat.TIPOS_SOCIO.find((t) => (t.value || t.slug) === s.tipo_socio) || {}).label ||
                  s.tipo_socio ||
                  '—'
              ) +
              '</td><td>' +
              (s.recibe_comunicaciones ? 'Acepta avisos' : 'No recibe avisos') +
              '</td></tr>'
          )
          .join('')
      : '<tr><td colspan="5">No hay socios con estos filtros.</td></tr>';
  }
  async function history() {
    const data = await request('/api/delegacion/comunicaciones', { method: 'GET' });
    const labels = {
      en_cola: 'En cola',
      enviando: 'Enviando',
      completada: 'Completada',
      con_errores: 'Con incidencias',
    };
    $('history').innerHTML = data.comunicaciones.length
      ? data.comunicaciones
          .map(
            (c) =>
              '<tr><td>' +
              e(new Date(c.created_at).toLocaleString('es-ES')) +
              '</td><td>' +
              e(c.asunto) +
              '</td><td>' +
              c.total_destinatarios +
              '</td><td>' +
              c.enviados +
              '</td><td>' +
              c.fallidos +
              '</td><td>' +
              e(labels[c.estado] || c.estado) +
              '</td></tr>'
          )
          .join('')
      : '<tr><td colspan="6">Todavía no has enviado comunicaciones desde esta delegación.</td></tr>';
  }
  function failure(err) {
    setMessage($('message'), false, err.message);
  }
  $('filters').oninput = invalidate;
  $('communication').oninput = invalidate;
  $('filters').onsubmit = async (ev) => {
    ev.preventDefault();
    invalidate();
    try {
      await members();
    } catch (err) {
      failure(err);
    }
  };
  $('clear').onclick = async () => {
    $('filters').reset();
    invalidate();
    try {
      await members();
    } catch (err) {
      failure(err);
    }
  };
  $('communication').onsubmit = async (ev) => {
    ev.preventDefault();
    if (!ready || busy) return;
    const snapshot = signature();
    $('preview').disabled = true;
    invalidate();
    try {
      await members();
      const data = await request('/api/delegacion/comunicaciones/preview', {
        method: 'POST',
        body: JSON.stringify(communicationFilters()),
      });
      if (snapshot !== signature()) return;
      review = { signature: snapshot, count: data.destinatarios };
      $('audience').textContent =
        data.destinatarios + ' socios recibirían este correo, según sus preferencias actuales.';
      $('send').disabled = !data.destinatarios;
    } catch (err) {
      failure(err);
    } finally {
      $('preview').disabled = false;
    }
  };
  $('send').onclick = async () => {
    if (!review || review.signature !== signature() || busy) return;
    if (
      !window.confirm(
        '¿Enviar esta comunicación a los ' +
          review.count +
          ' socios que permiten avisos y cumplen los filtros de tu provincia?'
      )
    )
      return;
    busy = true;
    $('send').disabled = true;
    $('preview').disabled = true;
    try {
      const data = await request('/api/delegacion/comunicaciones/enviar', {
        method: 'POST',
        body: JSON.stringify({
          asunto: $('subject').value,
          cuerpo: $('body').value,
          filtros: communicationFilters(),
        }),
      });
      setMessage(
        $('message'),
        true,
        'Comunicación en cola para ' +
          data.destinatarios +
          ' socios. Puedes consultar los resultados en el histórico.'
      );
      invalidate();
      await history();
    } catch (err) {
      failure(err);
      invalidate();
    } finally {
      busy = false;
      $('preview').disabled = false;
    }
  };
  $('refreshHistory').onclick = () => history().catch(failure);
  try {
    const session = await requireSession('admin');
    if (session.user.rol !== 'delegado_provincial') {
      location.href = '/admin.html';
      return;
    }
    ready = true;
    $('title').textContent = 'Delegación de ' + session.user.provincia_delegacion;
    $('scope').textContent =
      'Hola, ' +
      session.user.nombre +
      '. Tu acceso está limitado a ' +
      session.user.provincia_delegacion +
      '.';
    await members();
    await history();
  } catch (err) {
    failure(err);
  }
})();
