(function () {
  'use strict';

  const chat = document.getElementById('mauro-chat');
  if (!chat) return;

  const launcher = document.getElementById('mauro-launcher');
  const form = document.getElementById('mauro-form');
  const input = document.getElementById('mauro-input');
  const messages = document.getElementById('mauro-messages');
  const suggestions = document.getElementById('mauro-suggestions');
  const API_BASE = window.AMC_API_BASE || 'http://localhost:3000/api';
  const CONVERSATION_KEY = 'amc_mauro_conversation_v1';

  // Rutas permitidas en el frontend. El backend solo devuelve moduleKey; no se
  // ejecutan URLs arbitrarias recibidas en el contenido del chat.
  const moduleRoutes = {
    facturacion: { label: 'Facturación electrónica', path: 'crear-factura.html', run: () => window.location.assign('crear-factura.html') },
    facturas: { label: 'Facturas generadas', path: 'facturas-generadas/facturas-generadas.html' },
    clientes: { label: 'Clientes y terceros', path: 'terceros/terceros.html' },
    productos: { label: 'Productos y servicios', path: 'productos/productos.html' },
    inventario: { label: 'Inventarios y bodegas', path: 'inventarios/inventarios.html' },
    compras: { label: 'Compras', path: 'compras/factura-compra.html' },
    pos: { label: 'Facturación POS', path: 'pos/pos.html' },
    nomina: { label: 'Nómina electrónica', path: 'nomina-electronica/nomina-electronica.html' },
    reportes: { label: 'Reportes', path: 'reportes/reportes.html' },
    calendario: { label: 'Calendario empresarial', path: 'calendario/calendario.html' },
    cotizaciones: { label: 'Cotizaciones', path: 'cotizaciones/cotizacion.html' },
    configuracion: { label: 'Usuarios y configuración', path: 'usuario/usuario.html' },
    mauro: { label: 'Mauro IA', run: openChat },
  };

  function openChat() {
    chat.classList.add('is-open');
    launcher.setAttribute('aria-expanded', 'true');
    input.focus();
  }

  function node(tag, className, text) {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined && text !== null) item.textContent = String(text);
    return item;
  }

  function addUserMessage(text) {
    const message = node('div', 'mauro-message user', text);
    messages.appendChild(message);
    messages.scrollTop = messages.scrollHeight;
  }

  function addThinking() {
    const message = node('div', 'mauro-message assistant mauro-thinking');
    message.setAttribute('role', 'status');
    message.append(node('span'), node('span'), node('span'), node('em', '', 'Revisando tu consulta…'));
    messages.appendChild(message);
    messages.scrollTop = messages.scrollHeight;
    return message;
  }

  function obtenerToken() {
    try {
      return JSON.parse(sessionStorage.getItem('amc_session_v2') || '{}').token || null;
    } catch {
      return null;
    }
  }

  function crearUuid() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    if (window.crypto?.getRandomValues) {
      const bytes = window.crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
      const random = Math.random() * 16 | 0;
      return (character === 'x' ? random : (random & 0x3 | 0x8)).toString(16);
    });
  }

  function obtenerConversationId() {
    let id = sessionStorage.getItem(CONVERSATION_KEY);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || '')) {
      id = crearUuid();
      sessionStorage.setItem(CONVERSATION_KEY, id);
    }
    return id;
  }

  function formatearMoneda(value) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(Number(value || 0));
  }

  function renderCard(response, container) {
    const data = response.data || {};
    if (response.tarjeta) {
      const card = node('section', 'mauro-data-card');
      card.append(node('small', 'mauro-data-eyebrow', response.tarjeta.etiqueta || 'Resumen'));
      card.append(node('strong', '', response.tarjeta.valor || ''));
      container.append(card);
      return;
    }
    if (!['inventory_stock', 'product_details', 'client_lookup'].includes(response.tipo)) return;

    const card = node('section', 'mauro-data-card');
    card.append(node('small', 'mauro-data-eyebrow', response.tipo === 'inventory_stock' ? 'Inventario en tiempo real' : response.tipo === 'product_details' ? 'Ficha del producto' : 'Tercero de tu empresa'));
    const rows = [];
    if (response.tipo === 'inventory_stock') {
      rows.push(['Código', data.codigo], ['Existencias', `${Number(data.stock || 0).toLocaleString('es-CO')} ${data.unidadMedida || 'unidades'}`], ['Estado', data.etiquetaEstado || data.estado]);
      rows.push(['Stock mínimo', Number(data.stockMinimo || 0).toLocaleString('es-CO')]);
    } else if (response.tipo === 'product_details') {
      rows.push(['Código', data.codigo], ['Tipo', data.tipo], ['Precio', formatearMoneda(data.precio)], ['IVA', `${Number(data.iva || 0)}%`], ['Existencias', `${Number(data.stock || 0).toLocaleString('es-CO')} ${data.unidadMedida || 'unidades'}`]);
    } else {
      rows.push(['Documento', data.documento], ['Tipo', data.tipoDocumento], ['Correo', data.correo], ['Teléfono', data.telefono], ['Ciudad', data.ciudad]);
    }
    rows.forEach(([label, value]) => {
      if (value === undefined || value === null || value === '') return;
      const row = node('div', 'mauro-data-row');
      row.append(node('span', '', label), node('strong', '', value));
      card.append(row);
    });
    if (data.fuente) card.append(node('small', 'mauro-data-source', data.fuente));
    if (data.etiquetaEstado) card.append(node('span', `mauro-badge ${String(data.estado || '').toLowerCase()}`, data.etiquetaEstado));
    container.append(card);
  }

  function renderTable(table, container) {
    if (!table || !Array.isArray(table.columnas) || !Array.isArray(table.filas)) return;
    const wrapper = node('div', 'mauro-table-wrap');
    const element = document.createElement('table');
    const head = document.createElement('thead');
    const headerRow = document.createElement('tr');
    table.columnas.forEach((column) => headerRow.append(node('th', '', column)));
    head.append(headerRow);
    element.append(head);
    const body = document.createElement('tbody');
    table.filas.slice(0, 20).forEach((row) => {
      const line = document.createElement('tr');
      row.slice(0, table.columnas.length).forEach((value) => line.append(node('td', '', value)));
      body.append(line);
    });
    element.append(body);
    wrapper.append(element);
    container.append(wrapper);
  }

  function ejecutarAccion(action) {
    const target = moduleRoutes[action?.moduleKey];
    if (!target) return;
    if (typeof target.run === 'function') {
      target.run();
      return;
    }
    if (target.path) window.location.assign(target.path);
  }

  function renderAssistant(response) {
    const message = node('article', `mauro-message assistant${response.tipo === 'security' ? ' mauro-security-message' : ''}`);
    if (response.titulo) message.append(node('strong', '', response.titulo));
    message.append(node('p', 'mauro-answer-text', response.mensaje || 'Con gusto te ayudo.'));
    renderCard(response, message);
    renderTable(response.tabla, message);

    if (Array.isArray(response.badges) && response.badges.length) {
      const badges = node('div', 'mauro-badges');
      response.badges.slice(0, 8).forEach((badge) => badges.append(node('span', 'mauro-badge', badge.label || badge)));
      message.append(badges);
    }
    if (response.seguimiento) message.append(node('small', 'mauro-follow-up', response.seguimiento));

    const actions = (Array.isArray(response.acciones) ? response.acciones : []).filter((action) => moduleRoutes[action?.moduleKey]);
    if (actions.length) {
      const actionGroup = node('div', 'mauro-response-actions');
      actions.slice(0, 3).forEach((action) => {
        const button = node('button', 'mauro-action-button');
        button.type = 'button';
        const icon = node('span', 'mauro-action-icon', '↗');
        icon.setAttribute('aria-hidden', 'true');
        button.append(icon, node('span', '', action.label || `Abrir ${moduleRoutes[action.moduleKey].label}`));
        button.addEventListener('click', () => ejecutarAccion(action));
        actionGroup.append(button);
      });
      message.append(actionGroup);
    }
    messages.append(message);
    messages.scrollTop = messages.scrollHeight;
  }

  async function responder(question) {
    const token = obtenerToken();
    if (!token) {
      renderAssistant({
        tipo: 'help', titulo: 'Conexión segura requerida',
        mensaje: 'Esta sesión inició en modo local y no recibió un token seguro. Por eso no puedo consultar memoria ni datos empresariales. Revisa que el backend de AMC esté conectado a PostgreSQL, cierra sesión e ingresa de nuevo cuando la autenticación esté disponible.',
        seguimiento: 'No compartas contraseñas ni tokens en el chat.',
      });
      return;
    }

    const thinking = addThinking();
    try {
      const response = await fetch(`${API_BASE}/mauro/consultar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mensaje: question, conversationId: obtenerConversationId() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'No fue posible consultar a Mauro en este momento.');
      if (body.conversationId) sessionStorage.setItem(CONVERSATION_KEY, body.conversationId);
      renderAssistant(body.respuesta || {});
    } catch (error) {
      renderAssistant({
        tipo: 'error', titulo: 'No pude completar la consulta',
        mensaje: error.message || 'Revisa tu conexión con AMC e inténtalo de nuevo.',
        seguimiento: '¿Quieres intentarlo nuevamente?',
      });
    } finally {
      thinking.remove();
    }
  }

  function submitQuestion(question) {
    const text = String(question || '').trim().slice(0, 300);
    if (!text) return;
    addUserMessage(text);
    if (input) input.value = '';
    void responder(text);
  }

  launcher.addEventListener('click', () => {
    const open = !chat.classList.contains('is-open');
    chat.classList.toggle('is-open', open);
    launcher.setAttribute('aria-expanded', String(open));
    if (open) input.focus();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submitQuestion(input.value);
  });

  if (suggestions) {
    suggestions.addEventListener('click', (event) => {
      const button = event.target.closest('[data-mauro-question]');
      if (button) submitQuestion(button.dataset.mauroQuestion);
    });
  }
})();
