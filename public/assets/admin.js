(function () {
  'use strict';

  const D = window.AgesportData;
  const Portal = window.AgesportPortal;
  const INV_KEY = 'agesport_invitations_v1';
  const ORG_KEY = 'agesport_org_v2';
  const previewState = { rows: [] };

  const defaults = {
    nombre: 'AGESPORT Andalucía',
    tipo: 'admin_publica',
    provincia: 'Almería',
    web: 'https://agesport.aiprojects.pro',
    desc: 'Plataforma privada para la activación del talento profesional del deporte andaluz.',
    color: '#0d355f',
    nif: '',
    logo: null
  };

  function loadOrg() {
    try {
      return Object.assign({}, defaults, JSON.parse(localStorage.getItem(ORG_KEY) || '{}'));
    } catch (error) {
      return Object.assign({}, defaults);
    }
  }

  function saveOrg(org) {
    localStorage.setItem(ORG_KEY, JSON.stringify(org));
  }

  function loadInvitations() {
    try {
      return JSON.parse(localStorage.getItem(INV_KEY) || '[]');
    } catch (error) {
      return [];
    }
  }

  function saveInvitations(invitations) {
    localStorage.setItem(INV_KEY, JSON.stringify(invitations));
  }

  function setBox(id, ok, text) {
    Portal.setMessage(document.getElementById(id), ok, text);
  }

  function normalizeCsvLine(line) {
    const out = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          quoted = !quoted;
        }
      } else if (ch === ',' && !quoted) {
        out.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    out.push(current);
    return out;
  }

  function parseCsv(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const lines = text.split(/\r?\n/).filter(function (line) { return line.trim(); });
    if (!lines.length) return [];
    const headers = normalizeCsvLine(lines[0]).map(function (header) { return header.trim().toLowerCase(); });
    return lines.slice(1).map(function (line) {
      const row = {};
      normalizeCsvLine(line).forEach(function (value, index) {
        row[headers[index]] = (value || '').trim();
      });
      return row;
    });
  }

  function buildCsvTemplate() {
    const headers = ['nombre', 'apellidos', 'email', 'tipo_socio', 'tipo_corporativo', 'organizacion', 'provincia', 'localidad', 'cargo', 'rol_cluster', 'especialidades'];
    const rows = [
      ['Juan', 'Pérez García', 'juan.perez@ejemplo.es', 'numero', '', '', 'Sevilla', 'Sevilla', 'Director Deportivo', 'gestion', 'Gestión de Instalaciones|Marketing y Patrocinio'],
      ['Ana', 'Ruiz Lozano', 'ana.ruiz@clubdeportivo.es', 'corporativo', 'club', 'Club Deportivo Aljarafe', 'Sevilla', 'Tomares', 'Presidencia', 'gestion', 'Organización de Eventos']
    ];
    return [headers].concat(rows).map(function (row) {
      return row.map(function (value) {
        if (/[",\n\r]/.test(value)) return '"' + value.replace(/"/g, '""') + '"';
        return value;
      }).join(',');
    }).join('\n');
  }

  function validateInvitationRow(row) {
    const errors = [];
    if (!row.nombre) errors.push('nombre');
    if (!row.apellidos) errors.push('apellidos');
    if (!row.email) errors.push('email');
    if (!row.provincia || !D.PROVINCIAS.find(function (prov) { return prov.nombre === row.provincia; })) errors.push('provincia');
    if (!row.rol_cluster || !D.ROLES_CLUSTER.find(function (rol) { return rol.id === row.rol_cluster; })) errors.push('rol_cluster');
    if (!row.tipo_socio || !D.TIPOS_SOCIO.find(function (tipo) { return tipo.id === row.tipo_socio; })) errors.push('tipo_socio');
    if (row.tipo_socio === 'corporativo' && row.tipo_corporativo && !D.TIPOS_CORPORATIVO.find(function (tipo) { return tipo.id === row.tipo_corporativo; })) errors.push('tipo_corporativo');
    return errors;
  }

  function renderInvitations() {
    const invitations = loadInvitations();
    document.getElementById('invStatPending').textContent = invitations.filter(function (item) { return item.estado === 'pendiente'; }).length + ' pendientes';
    document.getElementById('invStatAccepted').textContent = invitations.filter(function (item) { return item.estado === 'aceptada'; }).length + ' aceptadas';
    document.getElementById('invitationsBody').innerHTML = invitations.map(function (invitation, index) {
      const onboardingUrl = '/onboarding.html?token=' + encodeURIComponent(invitation.token);
      return ''
        + '<tr>'
        + '  <td><strong>' + Portal.escapeHtml(invitation.nombre + ' ' + invitation.apellidos) + '</strong><br><small>' + Portal.escapeHtml(invitation.email) + '</small></td>'
        + '  <td>' + Portal.escapeHtml(invitation.tipo_socio === 'corporativo' ? 'Socio Corporativo' : 'Socio de Número') + '</td>'
        + '  <td><span class="row-status ' + Portal.escapeHtml(invitation.estado) + '">' + Portal.escapeHtml(invitation.estado) + '</span></td>'
        + '  <td>' + Portal.escapeHtml(Portal.formatDate(invitation.createdAt)) + '</td>'
        + '  <td><div class="actions">'
        + '    <a class="btn btn-secondary btn-sm" href="' + onboardingUrl + '" target="_blank" rel="noopener">Abrir</a>'
        + '    <button class="btn btn-secondary btn-sm js-copy" data-url="' + onboardingUrl + '">Copiar</button>'
        + '    <button class="btn btn-ghost btn-sm js-revoke" data-index="' + index + '">Revocar</button>'
        + '  </div></td>'
        + '</tr>';
    }).join('');

    Array.from(document.querySelectorAll('.js-copy')).forEach(function (button) {
      button.addEventListener('click', async function () {
        try {
          await navigator.clipboard.writeText(window.location.origin + button.dataset.url);
          setBox('bulkMsg', true, 'Enlace de onboarding copiado al portapapeles.');
        } catch (error) {
          setBox('bulkMsg', false, 'No se ha podido copiar el enlace.');
        }
      });
    });

    Array.from(document.querySelectorAll('.js-revoke')).forEach(function (button) {
      button.addEventListener('click', function () {
        const invitations = loadInvitations();
        invitations[Number(button.dataset.index)].estado = 'revocada';
        saveInvitations(invitations);
        renderInvitations();
      });
    });
  }

  function renderPreview() {
    const head = document.querySelector('#previewTable thead');
    const body = document.querySelector('#previewTable tbody');
    const rows = previewState.rows;
    if (!rows.length) return;

    head.innerHTML = '<tr><th>Nombre</th><th>Email</th><th>Tipo</th><th>Provincia</th><th>Estado</th></tr>';
    body.innerHTML = rows.map(function (row) {
      return '<tr class="' + (row.errors.length ? 'row-error' : '') + '">'
        + '<td>' + Portal.escapeHtml((row.nombre || '') + ' ' + (row.apellidos || '')) + '</td>'
        + '<td>' + Portal.escapeHtml(row.email || '') + '</td>'
        + '<td>' + Portal.escapeHtml(row.tipo_socio || '') + '</td>'
        + '<td>' + Portal.escapeHtml(row.provincia || '') + '</td>'
        + '<td>' + (row.errors.length ? '<span class="row-status rechazada">Error: ' + Portal.escapeHtml(row.errors.join(', ')) + '</span>' : '<span class="row-status aceptada">Válida</span>') + '</td>'
        + '</tr>';
    }).join('');

    document.getElementById('previewWrap').style.display = '';
    document.getElementById('bulkSummary').textContent = rows.filter(function (row) { return !row.errors.length; }).length + ' filas válidas · ' + rows.filter(function (row) { return row.errors.length; }).length + ' con incidencias';
  }

  Portal.mountTopbar('admin', 'admin').then(async function () {
    const org = loadOrg();

    document.getElementById('orgTipo').innerHTML = D.TIPOS_CORPORATIVO.map(function (tipo) {
      return '<option value="' + tipo.id + '"' + (tipo.id === org.tipo ? ' selected' : '') + '>' + tipo.etiqueta + '</option>';
    }).join('');
    document.getElementById('orgProvincia').innerHTML = D.PROVINCIAS.map(function (provincia) {
      return '<option value="' + provincia.nombre + '"' + (provincia.nombre === org.provincia ? ' selected' : '') + '>' + provincia.nombre + '</option>';
    }).join('');
    document.getElementById('orgNombre').value = org.nombre;
    document.getElementById('orgWeb').value = org.web;
    document.getElementById('orgDesc').value = org.desc;
    document.getElementById('orgColor').value = org.color;
    document.getElementById('orgNif').value = org.nif;

    function renderLogo() {
      if (org.logo) {
        document.getElementById('orgLogoImg').src = org.logo;
        document.getElementById('orgLogoImg').style.display = 'block';
        document.getElementById('orgLogoPlaceholder').style.display = 'none';
      } else {
        document.getElementById('orgLogoImg').style.display = 'none';
        document.getElementById('orgLogoPlaceholder').style.display = 'grid';
      }
    }

    renderLogo();

    document.getElementById('btnUploadLogo').addEventListener('click', function () {
      document.getElementById('orgLogoInput').click();
    });
    document.getElementById('orgLogoInput').addEventListener('change', function (event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = function () {
        org.logo = reader.result;
        renderLogo();
      };
      reader.readAsDataURL(file);
    });
    document.getElementById('btnRemoveLogo').addEventListener('click', function () {
      org.logo = null;
      renderLogo();
    });
    document.getElementById('btnSaveOrg').addEventListener('click', function () {
      org.nombre = document.getElementById('orgNombre').value.trim();
      org.tipo = document.getElementById('orgTipo').value;
      org.provincia = document.getElementById('orgProvincia').value;
      org.web = document.getElementById('orgWeb').value.trim();
      org.desc = document.getElementById('orgDesc').value.trim();
      org.color = document.getElementById('orgColor').value;
      org.nif = document.getElementById('orgNif').value.trim();
      saveOrg(org);
      setBox('okMsg', true, 'Cambios guardados. La identidad de la organización se ha actualizado.');
    });

    const statsResponse = await request('/api/admin/estadisticas', { method: 'GET', headers: {} });
    const pendingResponse = await request('/api/admin/socios/pendientes', { method: 'GET', headers: {} });

    const stats = statsResponse.stats || {};
    document.getElementById('adminKpis').innerHTML = [
      ['Socios activos', stats.socios_activos || 0, '👥'],
      ['Pendientes', stats.socios_pendientes || 0, '⏳'],
      ['Mensajes (30d)', stats.mensajes_ultimo_mes || 0, '✉️'],
      ['Conversaciones', stats.conversaciones_activas || 0, '🤝']
    ].map(function (item) {
      return '<article class="kpi-card"><div class="kpi-head"><span class="kpi-label">' + item[0] + '</span><span class="kpi-icon">' + item[2] + '</span></div><div class="kpi-value">' + item[1] + '</div></article>';
    }).join('');

    const pendientes = pendingResponse.socios || [];
    document.getElementById('pendientes').innerHTML = pendientes.length ? pendientes.map(function (socio) {
      return ''
        + '<div class="card" style="padding:14px 16px;display:flex;align-items:center;gap:14px;margin-bottom:10px">'
        + '  <div style="flex:1;min-width:0">'
        + '    <strong style="color:var(--navy);font-size:.95rem;display:block">' + Portal.escapeHtml(socio.nombre + ' ' + socio.apellidos) + '</strong>'
        + '    <small style="color:var(--muted);display:block">' + Portal.escapeHtml((socio.entidad || 'Sin entidad') + ' · ' + (socio.provincia || '')) + '</small>'
        + '    <small style="color:var(--muted-soft);font-size:.78rem">' + Portal.escapeHtml(socio.email) + '</small>'
        + '  </div>'
        + '  <button class="btn btn-lime btn-sm js-approve" data-id="' + socio.id + '">Aprobar</button>'
        + '  <button class="btn btn-ghost btn-sm js-reject" data-id="' + socio.id + '">Rechazar</button>'
        + '</div>';
    }).join('') : '<div class="card" style="padding:14px 16px;color:var(--muted)">No hay solicitudes pendientes.</div>';

    Array.from(document.querySelectorAll('.js-approve')).forEach(function (button) {
      button.addEventListener('click', async function () {
        await request('/api/admin/socios/' + button.dataset.id + '/aprobar', { method: 'POST', body: JSON.stringify({ notas: 'Alta validada desde panel' }) });
        window.location.reload();
      });
    });
    Array.from(document.querySelectorAll('.js-reject')).forEach(function (button) {
      button.addEventListener('click', async function () {
        await request('/api/admin/socios/' + button.dataset.id + '/rechazar', { method: 'POST', body: JSON.stringify({ motivo: 'Revisión administrativa', notas: 'Solicitud no admitida en esta fase.' }) });
        window.location.reload();
      });
    });

    document.getElementById('actividad').innerHTML = (statsResponse.actividad_reciente || []).map(function (row) {
      return '<li style="display:flex;gap:12px;align-items:center;padding:10px 12px;background:var(--bg-soft);border-radius:10px"><span style="width:8px;height:8px;border-radius:50%;background:#4ea7d6;flex:none"></span><span style="flex:1;color:var(--navy);font-size:.9rem">' + Portal.escapeHtml(row.accion) + '</span><small style="color:var(--muted-soft)">' + Portal.escapeHtml(row.total) + '</small></li>';
    }).join('');

    document.getElementById('btnDownloadTemplate').addEventListener('click', function () {
      const blob = new Blob(['\uFEFF' + buildCsvTemplate()], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'agesport-plantilla-socios.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    });

    function loadCsvFile(file) {
      const reader = new FileReader();
      reader.onload = function () {
        previewState.rows = parseCsv(String(reader.result || '')).map(function (row) {
          row.errors = validateInvitationRow(row);
          return row;
        });
        renderPreview();
      };
      reader.readAsText(file, 'utf-8');
    }

    const uploadZone = document.getElementById('uploadZone');
    const csvFile = document.getElementById('csvFile');
    csvFile.addEventListener('change', function (event) {
      if (event.target.files && event.target.files[0]) loadCsvFile(event.target.files[0]);
    });
    uploadZone.addEventListener('dragover', function (event) {
      event.preventDefault();
      uploadZone.classList.add('dragover');
    });
    uploadZone.addEventListener('dragleave', function () {
      uploadZone.classList.remove('dragover');
    });
    uploadZone.addEventListener('drop', function (event) {
      event.preventDefault();
      uploadZone.classList.remove('dragover');
      if (event.dataTransfer.files && event.dataTransfer.files[0]) loadCsvFile(event.dataTransfer.files[0]);
    });

    document.getElementById('btnCancelBulk').addEventListener('click', function () {
      previewState.rows = [];
      document.getElementById('previewWrap').style.display = 'none';
      csvFile.value = '';
    });

    document.getElementById('btnProcessBulk').addEventListener('click', function () {
      const invitations = loadInvitations();
      const validRows = previewState.rows.filter(function (row) { return !row.errors.length; });
      validRows.forEach(function (row) {
        invitations.unshift({
          token: 'inv-' + Math.random().toString(36).slice(2) + Date.now().toString(36),
          createdAt: new Date().toISOString(),
          estado: 'pendiente',
          nombre: row.nombre,
          apellidos: row.apellidos,
          email: row.email,
          tipo_socio: row.tipo_socio,
          tipoSocio: row.tipo_socio,
          tipo_corporativo: row.tipo_corporativo,
          tipoCorporativo: row.tipo_corporativo,
          organizacion: row.organizacion,
          organizacionInvitadora: org.nombre,
          invitadoPor: 'Administración AGESPORT',
          provincia: row.provincia,
          localidad: row.localidad,
          cargo: row.cargo,
          rolCluster: row.rol_cluster,
          especialidades: (row.especialidades || '').split('|').map(function (item) { return item.trim(); }).filter(Boolean),
          expiraAt: new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString()
        });
      });
      saveInvitations(invitations);
      renderInvitations();
      setBox('bulkMsg', true, 'Accesos generados correctamente. Ya puedes abrir o copiar cada enlace.');
      previewState.rows = [];
      document.getElementById('previewWrap').style.display = 'none';
      csvFile.value = '';
    });

    renderInvitations();
  }).catch(function () {});
})();
