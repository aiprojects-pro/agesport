(function () {
  const { requireSession, request, logout, escapeHtml, formatDate, setMessage, queryParam } = window.AgesportPortal;
  const $ = (id) => document.getElementById(id);

  const convItems = $('conversationItems');
  const convEmpty = $('convEmpty');
  const convCount = $('convCount');
  const convSearch = $('convSearch');
  const title = $('conversationTitle');
  const meta = $('conversationMeta');
  const messagesBox = $('messagesBox');
  const messagesEmpty = $('messagesEmpty');
  const messageForm = $('messageForm');
  const messageText = $('messageText');
  const sendBtn = $('sendBtn');
  const notifyEmail = $('notifyEmail');
  const messageStatus = $('messageStatus');
  const newMessageBtn = $('newMessageBtn');
  const composeCard = $('composeCard');
  const composeText = $('composeText');
  const composeEmail = $('composeEmail');
  const composeSend = $('composeSend');
  const composeCancel = $('composeCancel');
  const composeMessage = $('composeMessage');
  const receptorChips = $('receptorChips');
  const receptorSearch = $('receptorSearch');
  const receptorSuggestions = $('receptorSuggestions');

  $('logoutBtn').addEventListener('click', logout);

  let session;
  let conversations = [];
  let activeConversation;
  let allSocios = [];
  let composeReceptors = []; // [{id, nombre, apellidos, entidad}]
  const requestedReceiverId = queryParam('receptor');

  function initials(socio) {
    return ((socio.nombre || '?')[0] + (socio.apellidos || '')[0]).toUpperCase();
  }

  function renderConversations(filter) {
    filter = (filter || '').trim().toLowerCase();
    const filtered = filter
      ? conversations.filter(function (c) {
          const text = (c.otro_socio_nombre + ' ' + (c.otro_socio_entidad || '')).toLowerCase();
          return text.indexOf(filter) !== -1;
        })
      : conversations;

    const totalUnread = conversations.reduce(function (a, b) { return a + (parseInt(b.no_leidos || 0, 10)); }, 0);
    convCount.textContent = totalUnread > 0 ? (filtered.length + ' (' + totalUnread + ' sin leer)') : filtered.length;

    if (!filtered.length) {
      convItems.innerHTML = '';
      convEmpty.style.display = 'block';
      convEmpty.textContent = filter ? 'Sin resultados para "' + filter + '".' : 'No hay conversaciones activas por el momento.';
      return;
    }
    convEmpty.style.display = 'none';
    convItems.innerHTML = filtered.map(function (conv) {
      const active = String(conv.conversacion_id) === String(activeConversation);
      const unread = parseInt(conv.no_leidos || 0, 10);
      const avatar = '<div class="conv-avatar" style="background:linear-gradient(135deg,var(--green),var(--green-deep))">' + escapeHtml(initials({ nombre: conv.otro_socio_nombre || '?', apellidos: '' })) + '</div>';
      return '<div class="conversation-item ' + (active ? 'active' : '') + '" data-id="' + conv.conversacion_id + '">' +
        avatar +
        '<div class="conv-body">' +
          '<strong>' + escapeHtml(conv.otro_socio_nombre || 'Conversación') + '</strong>' +
          '<div class="muted">' + escapeHtml(conv.ultimo_mensaje || 'Sin mensajes') + '</div>' +
          '<div class="muted" style="font-size:.78rem;margin-top:2px">' + escapeHtml(formatDate(conv.ultima_actividad)) + '</div>' +
        '</div>' +
        (unread > 0 ? '<span class="unread-badge">' + unread + '</span>' : '') +
      '</div>';
    }).join('');
    Array.from(document.querySelectorAll('.conversation-item')).forEach(function (node) {
      node.addEventListener('click', function () { loadMessages(node.dataset.id); });
    });
  }

  async function loadMessages(id) {
    activeConversation = id;
    const data = await request('/api/mensajeria/conversaciones/' + id + '/mensajes', { method: 'GET', headers: {} });
    const current = conversations.find(function (item) { return String(item.conversacion_id) === String(id); });
    title.textContent = current ? current.otro_socio_nombre : 'Conversación';
    meta.textContent = current ? (current.otro_socio_entidad || current.otro_socio_provincia || '') : '';
    messagesEmpty.style.display = 'none';
    messageForm.style.display = 'block';
    messagesBox.innerHTML = (data.mensajes || []).map(function (msg) {
      const mine = String(msg.emisor_id) === String(session.user.id);
      return '<div class="message ' + (mine ? 'mine' : '') + '"><strong>' + escapeHtml(msg.emisor_nombre + ' ' + msg.emisor_apellidos) + '</strong><br>' + escapeHtml(msg.contenido) + '<div class="muted" style="margin-top:6px;font-size:.82rem">' + escapeHtml(formatDate(msg.created_at)) + '</div></div>';
    }).join('');
    messagesBox.scrollTop = messagesBox.scrollHeight;
    // Refrescar lista para que el contador no leídos se actualice
    loadConversations();
  }

  async function loadConversations() {
    const data = await request('/api/mensajeria/conversaciones', { method: 'GET', headers: {} });
    conversations = data.conversaciones || [];
    renderConversations(convSearch.value);
    if (conversations.length && !activeConversation) {
      await loadMessages(conversations[0].conversacion_id);
    }
  }

  async function ensureConversation() {
    if (!requestedReceiverId || String(requestedReceiverId) === String(session.user.id)) return;

    const existing = conversations.find(function (item) {
      return String(item.otro_socio_id) === String(requestedReceiverId);
    });
    if (existing) { await loadMessages(existing.conversacion_id); return; }

    await request('/api/mensajeria/conversaciones', {
      method: 'POST',
      body: JSON.stringify({ receptorId: Number(requestedReceiverId) })
    });
    await loadConversations();

    // Tras crear la conversación, abrirla automáticamente
    const justCreated = conversations.find(function (c) {
      return String(c.otro_socio_id) === String(requestedReceiverId);
    });
    if (justCreated) await loadMessages(justCreated.conversacion_id);
  }

  // ===== Búsqueda en lista de conversaciones =====
  convSearch.addEventListener('input', function () { renderConversations(convSearch.value); });

  // ===== Envío de mensaje desde la conversación activa =====
  messageForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (!activeConversation) return;
    const current = conversations.find(function (item) { return String(item.conversacion_id) === String(activeConversation); });
    if (!current) return;
    sendBtn.disabled = true;
    sendBtn.textContent = 'Enviando...';
    try {
      await request('/api/mensajeria/mensajes', {
        method: 'POST',
        body: JSON.stringify({
          receptorId: current.otro_socio_id,
          contenido: messageText.value.trim(),
          notificarPorEmail: notifyEmail.checked
        })
      });
      messageText.value = '';
      setMessage(messageStatus, true, 'Mensaje enviado correctamente.');
      await loadConversations();
      await loadMessages(activeConversation);
    } catch (error) {
      setMessage(messageStatus, false, error.message);
    } finally {
      sendBtn.disabled = false;
      sendBtn.textContent = 'Enviar mensaje';
    }
  });

  // ===== Composer multi-receptor =====
  newMessageBtn.addEventListener('click', async function () {
    composeCard.style.display = '';
    composeReceptors = [];
    composeText.value = '';
    renderChips();
    if (allSocios.length === 0) {
      try {
        const data = await request('/api/socios/directorio?limit=200', { method: 'GET', headers: {} });
        allSocios = (data.socios || []).filter(function (s) { return s.id && s.id !== session.user.id; });
      } catch (e) {
        setMessage(composeMessage, false, 'No se pudo cargar el directorio de socios.');
      }
    }
    receptorSearch.focus();
  });

  composeCancel.addEventListener('click', function () { composeCard.style.display = 'none'; });

  function renderChips() {
    receptorChips.innerHTML = composeReceptors.length
      ? composeReceptors.map(function (r) {
          return '<span class="receptor-chip" data-id="' + r.id + '">' +
            escapeHtml(r.nombre + ' ' + (r.apellidos || '')) +
            ' <button type="button" data-remove="' + r.id + '" aria-label="Quitar">×</button>' +
          '</span>';
        }).join('')
      : '<span class="muted" style="font-size:.85rem">Aún no has añadido destinatarios</span>';
  }

  receptorChips.addEventListener('click', function (ev) {
    const btn = ev.target.closest('button[data-remove]');
    if (!btn) return;
    const id = btn.dataset.remove;
    composeReceptors = composeReceptors.filter(function (r) { return String(r.id) !== String(id); });
    renderChips();
  });

  receptorSearch.addEventListener('input', function () {
    const q = receptorSearch.value.trim().toLowerCase();
    if (!q) { receptorSuggestions.classList.remove('visible'); return; }
    const matches = allSocios.filter(function (s) {
      if (composeReceptors.some(function (r) { return String(r.id) === String(s.id); })) return false;
      const txt = ((s.nombre || '') + ' ' + (s.apellidos || '') + ' ' + (s.entidad || '')).toLowerCase();
      return txt.indexOf(q) !== -1;
    }).slice(0, 12);
    if (!matches.length) { receptorSuggestions.classList.remove('visible'); return; }
    receptorSuggestions.innerHTML = matches.map(function (s) {
      return '<div class="suggestion-item" data-id="' + s.id + '">' +
        '<div><strong>' + escapeHtml(s.nombre + ' ' + s.apellidos) + '</strong><div class="muted">' + escapeHtml(s.entidad || s.provincia || '') + '</div></div>' +
        '<button type="button" class="btn-upload">Añadir</button>' +
      '</div>';
    }).join('');
    receptorSuggestions.classList.add('visible');
  });

  receptorSuggestions.addEventListener('click', function (ev) {
    const item = ev.target.closest('.suggestion-item');
    if (!item) return;
    const id = item.dataset.id;
    const socio = allSocios.find(function (s) { return String(s.id) === String(id); });
    if (!socio) return;
    composeReceptors.push({ id: socio.id, nombre: socio.nombre, apellidos: socio.apellidos, entidad: socio.entidad });
    renderChips();
    receptorSearch.value = '';
    receptorSuggestions.classList.remove('visible');
    receptorSearch.focus();
  });

  composeSend.addEventListener('click', async function () {
    if (composeReceptors.length === 0) { setMessage(composeMessage, false, 'Añade al menos un destinatario.'); return; }
    if (!composeText.value.trim()) { setMessage(composeMessage, false, 'El mensaje no puede estar vacío.'); return; }
    composeSend.disabled = true;
    composeSend.textContent = 'Enviando...';
    try {
      const ids = composeReceptors.map(function (r) { return r.id; });
      const res = await request('/api/mensajeria/mensajes/multi', {
        method: 'POST',
        body: JSON.stringify({
          receptorIds: ids,
          contenido: composeText.value.trim(),
          notificarPorEmail: composeEmail.checked
        })
      });
      setMessage(composeMessage, true, 'Enviado a ' + res.enviados + ' de ' + res.total + ' destinatarios.');
      composeText.value = '';
      composeReceptors = [];
      renderChips();
      await loadConversations();
    } catch (err) {
      setMessage(composeMessage, false, err.message);
    } finally {
      composeSend.disabled = false;
      composeSend.textContent = 'Enviar mensaje';
    }
  });

  requireSession('socio').then(function (verified) {
    session = verified;
    return loadConversations().then(ensureConversation);
  }).catch(function () {});
})();
