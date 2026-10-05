(function () {
  const { request, escapeHtml: e } = window.AgesportPortal;
  const $ = (id) => document.getElementById(id);
  let revision = null,
    data = null;
  const status = (id, msg) => {
    $(id).textContent = msg;
  };
  const table = (head, rows) =>
    '<div class="table-scroll"><table class="table-list"><thead><tr>' +
    head.map((h) => '<th>' + e(h) + '</th>').join('') +
    '</tr></thead><tbody>' +
    rows.map((r) => '<tr>' + r.map((c) => '<td>' + c + '</td>').join('') + '</tr>').join('') +
    '</tbody></table></div>';
  const day = (v) => (v ? String(v).slice(0, 10) : '—');
  async function loadPolicy() {
    try {
      const r = await request('/api/admin/privacidad');
      revision = r.draft.revision;
      $('policyTitle').value = r.draft.title;
      $('policyContent').value = r.draft.content;
      preview();
      $('policyVersions').innerHTML = table(
        ['Versión', 'Publicación', 'Origen', 'Consultar'],
        r.versions.map((v) => [
          e(v.id),
          e(
            v.published_at
              ? new Date(v.published_at).toLocaleString('es-ES')
              : 'Anterior; sin nueva aprobación'
          ),
          e(v.provenance),
          '<a href="/privacidad.html?version=' +
            v.id +
            '" target="_blank" rel="noopener">Ver texto conservado</a>',
        ])
      );
      status('policyStatus', 'Borrador cargado. Renovación de consentimientos sin activar.');
    } catch (err) {
      status('policyStatus', err.message);
    }
  }
  function preview() {
    $('policyPreview').innerHTML = window.AgesportPolicyFormat.render($('policyContent').value);
  }
  $('policyContent').addEventListener('input', preview);
  $('policyToolbar').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-insert]');
    if (!b) return;
    const t = $('policyContent');
    t.setRangeText('\n' + b.dataset.insert + '\n', t.selectionStart, t.selectionEnd, 'end');
    preview();
    t.focus();
  });
  $('policyForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const button = ev.target.querySelector('[type=submit]');
    button.disabled = true;
    try {
      const r = await request('/api/admin/privacidad/borrador', {
        method: 'PUT',
        body: JSON.stringify({
          title: $('policyTitle').value,
          content: $('policyContent').value,
          revision,
        }),
      });
      revision = r.draft.revision;
      status('policyStatus', 'Borrador guardado. Todavía no está publicado.');
    } catch (err) {
      status('policyStatus', err.message);
    } finally {
      button.disabled = false;
    }
  });
  $('policyPublish').addEventListener('click', async () => {
    try {
      const r = await request('/api/admin/privacidad');
      if (
        r.draft.content !== $('policyContent').value ||
        r.draft.title !== $('policyTitle').value ||
        r.draft.revision !== revision
      )
        throw new Error('Guarda primero el borrador que estás revisando.');
      if (
        !confirm(
          '¿Confirmas que este es el texto definitivo autorizado y quieres publicarlo ahora? No se cambiarán preferencias ni se activarán nuevas casillas.'
        )
      )
        return;
      $('policyPublish').disabled = true;
      await request('/api/admin/privacidad/publicar', {
        method: 'POST',
        body: JSON.stringify({ revision, confirm: true }),
      });
      await loadPolicy();
      status(
        'policyStatus',
        'Texto publicado. La versión anterior se conserva y las preferencias no han cambiado.'
      );
    } catch (err) {
      status('policyStatus', err.message);
    } finally {
      $('policyPublish').disabled = false;
    }
  });
  $('policyResponsesForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    try {
      const r = await request(
        '/api/admin/privacidad/respuestas/' + encodeURIComponent($('policySocioId').value)
      );
      $('policyResponses').innerHTML = r.responses.length
        ? table(
            ['Fecha', 'Versión mostrada', 'Respuesta', 'Opción', 'Origen'],
            r.responses.map((v) => [
              e(new Date(v.recorded_at).toLocaleString('es-ES')),
              e(v.version_id || 'Sin versión identificada'),
              v.answer ? 'Sí' : 'No',
              e(v.label),
              e(v.source),
            ])
          )
        : 'No hay respuestas registradas desde esta actualización.';
    } catch (err) {
      status('policyResponses', err.message);
    }
  });
  function sponsors() {
    const company = $('linkCompany').value;
    $('linkSponsor').innerHTML =
      '<option value="">Sin patrocinio</option>' +
      data.patrocinios
        .filter((p) => String(p.empresa_id) === company)
        .map(
          (p) =>
            '<option value="' +
            p.id +
            '">' +
            e(p.modalidad) +
            ' (' +
            e(day(p.inicio)) +
            ' / ' +
            e(day(p.fin)) +
            ')</option>'
        )
        .join('');
  }
  function renderLinks() {
    const company = $('linkFilter').value;
    const list = data.vinculos.filter((v) => !company || String(v.empresa_id) === company);
    $('peopleLinksList').innerHTML = list.length
      ? table(
          [
            'Persona / ID',
            'Tipo de socio / cuenta',
            'Empresa',
            'Patrocinio',
            'Motivo',
            'Vigencia del vínculo',
            'Gestionar',
          ],
          list.map((v) => [
            e(v.nombre + ' ' + v.apellidos + ' · ' + v.socio_id),
            e(v.tipo_socio + ' · ' + v.estado_cuenta + (v.cuenta_activa ? '' : ' (inactiva)')),
            e(v.empresa),
            e(v.modalidad || 'Sin patrocinio'),
            e(v.motivo),
            e(day(v.inicio) + ' / ' + day(v.fin) + ' · ' + v.estado_vinculo),
            '<button class="btn btn-secondary" type="button" data-end="' + v.id + '">Fecha final</button>',
          ])
        )
      : 'No hay vínculos para esta empresa.';
  }
  async function loadLinks() {
    try {
      data = await request('/api/admin/vinculos');
      document.querySelectorAll('[data-company]').forEach((el) => {
        const old = el.value;
        el.innerHTML =
          '<option value="">' +
          (el.id === 'linkFilter' ? 'Todas las empresas' : 'Selecciona empresa') +
          '</option>' +
          data.empresas
            .map((c) => '<option value="' + c.id + '">' + e(c.nombre) + '</option>')
            .join('');
        el.value = old;
      });
      $('linkPerson').innerHTML =
        '<option value="">Selecciona persona</option>' +
        data.personas
          .map(
            (p) =>
              '<option value="' +
              p.id +
              '">' +
              e(p.nombre + ' ' + p.apellidos + ' · ID ' + p.id + ' · ' + p.estado) +
              '</option>'
          )
          .join('');
      sponsors();
      renderLinks();
      $('companiesList').innerHTML = table(
        ['Empresa', 'Referencia', 'Editar'],
        data.empresas.map((c) => [
          e(c.nombre),
          e(c.referencia || '—'),
          '<button class="btn btn-secondary" type="button" data-company-edit="' + c.id + '">Editar</button>',
        ])
      );
      $('sponsorsList').innerHTML = table(
        ['Empresa', 'Modalidad', 'Vigencia', 'Configuración sin activar', 'Editar'],
        data.patrocinios.map((p) => [
          e(p.empresa),
          e(p.modalidad),
          e(day(p.inicio) + ' / ' + day(p.fin)),
          e(
            'Cupo propuesto: ' +
              (p.configuracion_futura.cupos ?? 'sin definir') +
              ' · ' +
              (p.configuracion_futura.condiciones || 'condiciones sin definir')
          ),
          '<button class="btn btn-secondary" type="button" data-sponsor-edit="' + p.id + '">Editar</button>',
        ])
      );
      $('linksHistory').innerHTML = table(
        ['Fecha', 'Administrador', 'Cambio', 'Referencia'],
        data.historial.map((h) => [
          e(new Date(h.created_at).toLocaleString('es-ES')),
          e(h.administrador || '—'),
          e(h.tipo),
          e(h.recurso_id),
        ])
      );
      status('linksStatus', 'Listas actualizadas. Ningún vínculo concede derechos automáticos.');
    } catch (err) {
      status('linksStatus', err.message);
    }
  }
  function fill(form, obj) {
    for (const [k, v] of Object.entries(obj)) {
      if (form.elements[k])
        form.elements[k].value = ['inicio', 'fin'].includes(k) ? (v ? day(v) : '') : (v ?? '');
    }
    form.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  document.addEventListener('click', (ev) => {
    let b = ev.target.closest('[data-company-edit]');
    if (b)
      fill(
        $('companyForm'),
        data.empresas.find((x) => x.id === Number(b.dataset.companyEdit))
      );
    b = ev.target.closest('[data-sponsor-edit]');
    if (b) {
      const p = data.patrocinios.find((x) => x.id === Number(b.dataset.sponsorEdit));
      fill($('sponsorForm'), {
        ...p,
        cupo_propuesto: p.configuracion_futura.cupos,
        condiciones_propuestas: p.configuracion_futura.condiciones,
      });
    }
    b = ev.target.closest('[data-end]');
    if (b) {
      const v = data.vinculos.find((x) => x.id === Number(b.dataset.end));
      $('endLinkForm').hidden = false;
      $('endLinkName').textContent =
        'Fecha final: ' + v.nombre + ' ' + v.apellidos + ' — ' + v.empresa;
      fill($('endLinkForm'), { id: v.id, fin: v.fin });
    }
  });
  for (const [formId, route] of [
    ['companyForm', 'empresas'],
    ['sponsorForm', 'patrocinios'],
    ['personLinkForm', 'personas'],
    ['endLinkForm', 'personas'],
  ]) {
    $(formId).addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const form = ev.target,
        body = Object.fromEntries(new FormData(form));
      const editing = body.id;
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        await request(
          '/api/admin/vinculos/' +
            route +
            (editing ? '/' + editing : '') +
            (formId === 'endLinkForm' ? '/fin' : ''),
          { method: editing ? 'PUT' : 'POST', body: JSON.stringify(body) }
        );
        form.reset();
        if (formId === 'endLinkForm') form.hidden = true;
        await loadLinks();
        status(
          'linksStatus',
          'Cambio guardado. Se conservan los demás vínculos y los permisos de la cuenta.'
        );
      } catch (err) {
        status('linksStatus', err.message);
      } finally {
        btn.disabled = false;
      }
    });
  }
  for (const form of [$('companyForm'), $('sponsorForm')])
    form.addEventListener('reset', () => {
      form.elements.id.value = '';
    });
  $('linkCompany').addEventListener('change', sponsors);
  $('linkFilter').addEventListener('change', renderLinks);
  $('linksRefresh').addEventListener('click', loadLinks);
  document.getElementById('adminTabs').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-tab]');
    if (!b) return;
    if (b.dataset.tab === 'privacidad' && revision === null) loadPolicy();
    if (b.dataset.tab === 'vinculos' && !data) loadLinks();
  });
})();
