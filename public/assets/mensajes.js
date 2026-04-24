(function () {
  const { requireSession, request, logout, escapeHtml, formatDate, setMessage, queryParam } = window.AgesportPortal;
  const convItems = document.getElementById('conversationItems');
  const convEmpty = document.getElementById('convEmpty');
  const convCount = document.getElementById('convCount');
  const title = document.getElementById('conversationTitle');
  const meta = document.getElementById('conversationMeta');
  const messagesBox = document.getElementById('messagesBox');
  const messagesEmpty = document.getElementById('messagesEmpty');
  const messageForm = document.getElementById('messageForm');
  const messageText = document.getElementById('messageText');
  const sendBtn = document.getElementById('sendBtn');
  const messageStatus = document.getElementById('messageStatus');
  document.getElementById('logoutBtn').addEventListener('click', logout);

  let session;
  let conversations = [];
  let activeConversation;
  const requestedReceiverId = queryParam('receptor');

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
    renderConversations();
  }

  function renderConversations() {
    convCount.textContent = String(conversations.length);
    if (!conversations.length) {
      convItems.innerHTML = '';
      convEmpty.style.display = 'block';
      return;
    }
    convEmpty.style.display = 'none';
    convItems.innerHTML = conversations.map(function (conv) {
      const active = String(conv.conversacion_id) === String(activeConversation);
      return '<div class="conversation-item ' + (active ? 'active' : '') + '" data-id="' + conv.conversacion_id + '">' +
        '<strong>' + escapeHtml(conv.otro_socio_nombre) + '</strong>' +
        '<div class="muted">' + escapeHtml(conv.ultimo_mensaje || 'Sin mensajes') + '</div>' +
        '<div class="muted" style="font-size:.82rem;margin-top:6px">' + escapeHtml(formatDate(conv.ultima_actividad)) + '</div>' +
      '</div>';
    }).join('');
    Array.from(document.querySelectorAll('.conversation-item')).forEach(function (node) {
      node.addEventListener('click', function () { loadMessages(node.dataset.id); });
    });
  }

  async function loadConversations() {
    const data = await request('/api/mensajeria/conversaciones', { method: 'GET', headers: {} });
    conversations = data.conversaciones || [];
    renderConversations();
    if (conversations.length && !activeConversation) {
      await loadMessages(conversations[0].conversacion_id);
    }
  }

  async function ensureConversation() {
    if (!requestedReceiverId || String(requestedReceiverId) === String(session.user.id)) {
      return;
    }

    const existing = conversations.find(function (item) {
      return String(item.otro_socio_id) === String(requestedReceiverId);
    });

    if (existing) {
      await loadMessages(existing.conversacion_id);
      return;
    }

    await request('/api/mensajeria/conversaciones', {
      method: 'POST',
      body: JSON.stringify({ receptorId: Number(requestedReceiverId) })
    });

    await loadConversations();
  }

  requireSession('socio').then(function (verified) {
    session = verified;
    return loadConversations().then(ensureConversation);
  }).catch(function () {});

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
          contenido: messageText.value.trim()
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
})();
