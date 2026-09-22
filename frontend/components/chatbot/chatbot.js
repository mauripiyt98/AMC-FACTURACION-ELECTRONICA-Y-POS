(function () {
  'use strict';

  const chat = document.getElementById('mauro-chat');
  if (!chat) return;

  const launcher = document.getElementById('mauro-launcher');
  const form = document.getElementById('mauro-form');
  const input = document.getElementById('mauro-input');
  const messages = document.getElementById('mauro-messages');
  const API_BASE = 'http://localhost:3000/api';

  const escapeHtml = (value) => {
    const element = document.createElement('div');
    element.textContent = String(value || '');
    return element.innerHTML;
  };

  const normalizar = (value) => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  const moduleRoutes = {
    factura: { label: 'Crear factura electrónica', action: () => window.mostrarSeccion ? window.mostrarSeccion('crear-factura') : window.location.assign('index.html?sec=crear-factura') },
    cliente: { label: 'Abrir clientes', action: () => window.location.assign('terceros/terceros.html') },
    producto: { label: 'Abrir productos', action: () => window.location.assign('productos/productos.html') },
    inventario: { label: 'Abrir inventarios', action: () => window.location.assign('inventarios/inventarios.html') },
    compra: { label: 'Registrar compra', action: () => window.location.assign('compras/factura-compra.html') },
    pos: { label: 'Abrir Facturación POS', action: () => window.location.assign('pos/pos.html') },
    reporte: { label: 'Ver reportes', action: () => window.location.assign('reportes/reportes.html') },
    nomina: { label: 'Abrir nómina', action: () => window.location.assign('nomina-electronica/nomina-electronica.html') }
  };

  function addMessage(text, type = 'assistant') {
    const message = document.createElement('div');
    message.className = `mauro-message ${type}`;
    message.innerHTML = text;
    messages.appendChild(message);
    messages.scrollTop = messages.scrollHeight;
  }

  function addThinking() {
    const message = document.createElement('div');
    message.className = 'mauro-message assistant mauro-thinking';
    message.innerHTML = '<span></span><span></span><span></span><em>Consultando inventario…</em>';
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

  function extraerCodigo(mensaje) {
    const texto = normalizar(mensaje);
    const match = texto.match(/(?:codigo|cod\.?|referencia)\s*(?:del?\s*)?(?:producto\s*)?[:#-]?\s*["'“”]?([a-z0-9][a-z0-9._/-]{0,63})/i)
      || texto.match(/producto\s+([a-z0-9][a-z0-9._/-]{0,63})/i);
    return match ? match[1] : null;
  }

  function esConsultaInventario(mensaje) {
    return /stock|existencia|inventario|disponible|unidades/i.test(mensaje) && !!extraerCodigo(mensaje);
  }

  function mostrarStock(producto, fuente) {
    const stock = Number(producto.stock || producto.stock_total || producto.stockTotal || 0);
    const minimo = Number(producto.stockMinimo || producto.stock_minimo || producto.stockMin || 0);
    const estado = producto.estado || (stock <= 0 ? 'AGOTADO' : stock <= minimo ? 'BAJO' : 'DISPONIBLE');
    const etiqueta = estado === 'DISPONIBLE' ? 'Inventario suficiente' : estado === 'BAJO' ? 'Stock bajo' : 'Producto agotado';
    addMessage(`<strong>${escapeHtml(producto.nombre || 'Producto')}</strong><span class="mauro-stock-code">Código: ${escapeHtml(producto.codigo || '—')}</span><span class="mauro-stock-value">${stock.toLocaleString('es-CO')} ${escapeHtml(producto.unidadMedida || producto.unidad_medida || 'unidades')}</span><span class="mauro-stock-status ${estado.toLowerCase()}">${etiqueta}</span><small>${fuente}</small>`);
    addAction('inventario');
  }

  async function consultarInventarioEnApi(mensaje) {
    const token = obtenerToken();
    if (!token) return false;
    const response = await fetch(`${API_BASE}/mauro/consultar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ mensaje })
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || 'No fue posible consultar el inventario.');
    if (body.respuesta?.tipo === 'inventory_stock') {
      mostrarStock(body.respuesta.data, 'Datos consultados en tiempo real.');
      return true;
    }
    addMessage(`<strong>Consulta de inventario</strong>${escapeHtml(body.respuesta?.mensaje || 'No encontré ese producto en tu empresa.')}`);
    return true;
  }

  function consultarInventarioLocal(mensaje) {
    const codigo = extraerCodigo(mensaje);
    if (!codigo) return false;
    const userCode = sessionStorage.getItem('amc_active_user_code') || '1110591592';
    try {
      const productos = JSON.parse(localStorage.getItem(`amc_productos_db_v1_${userCode}`) || '[]');
      const producto = Array.isArray(productos) && productos.find((item) => String(item.codigo || '').trim().toLowerCase() === codigo.toLowerCase() && item.activo !== false);
      if (producto) {
        mostrarStock(producto, 'Datos del catálogo local de esta sesión.');
      } else {
        addMessage(`<strong>Consulta de inventario</strong>No encontré un producto activo con el código ${escapeHtml(codigo)} en esta empresa.`);
      }
      return true;
    } catch {
      return false;
    }
  }

  function addAction(module) {
    const target = moduleRoutes[module];
    if (!target) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mauro-suggestion';
    button.textContent = target.label;
    button.addEventListener('click', target.action);
    document.getElementById('mauro-suggestions').appendChild(button);
  }

  function answer(question) {
    const text = question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/(factura|facturar|venta|cufe|dian|iva)/.test(text)) {
      addMessage('<strong>Facturación electrónica</strong>Para crear una factura, completa los datos del cliente, agrega los productos y selecciona “Generar factura”.');
      addAction('factura');
    } else if (/(cliente|tercero|nit)/.test(text)) {
      addMessage('<strong>Clientes y terceros</strong>Registra primero la información del cliente: nombre o razón social, documento, correo y ciudad.');
      addAction('cliente');
    } else if (/(producto|servicio|precio)/.test(text)) {
      addMessage('<strong>Productos y servicios</strong>Desde este módulo puedes crear productos, definir precios, IVA y controlar existencias.');
      addAction('producto');
    } else if (/(inventario|bodega|stock)/.test(text)) {
      addMessage('<strong>Inventarios</strong>Consulta existencias, movimientos y el control de tus bodegas desde Inventarios.');
      addAction('inventario');
    } else if (/(compra|proveedor|gasto)/.test(text)) {
      addMessage('<strong>Compras</strong>Registra la factura del proveedor para actualizar costos, gastos o inventario.');
      addAction('compra');
    } else if (/(pos|caja|punto de venta)/.test(text)) {
      addMessage('<strong>Facturación POS</strong>Abre el punto de venta para registrar y gestionar ventas de mostrador.');
      addAction('pos');
    } else if (/(reporte|informe|ventas del mes)/.test(text)) {
      addMessage('<strong>Reportes</strong>Consulta indicadores de ventas, compras e impuestos por período.');
      addAction('reporte');
    } else if (/(nomina|empleado)/.test(text)) {
      addMessage('<strong>Nómina electrónica</strong>En este módulo podrás gestionar la nómina electrónica de tu empresa.');
      addAction('nomina');
    } else {
      addMessage('<strong>Estoy para ayudarte</strong>Puedo guiarte con facturación, clientes, productos, compras, inventarios, POS, nómina y reportes. ¿Sobre qué módulo deseas consultar?');
    }
  }

  async function responder(question) {
    if (!esConsultaInventario(question)) {
      answer(question);
      return;
    }

    const thinking = addThinking();
    try {
      const atendidoPorApi = await consultarInventarioEnApi(question);
      if (!atendidoPorApi) consultarInventarioLocal(question);
    } catch (error) {
      addMessage(`<strong>No pude consultar el inventario en este momento.</strong>${escapeHtml(error.message)} Puedes intentarlo nuevamente.`);
    } finally {
      thinking.remove();
    }
  }

  launcher.addEventListener('click', () => {
    chat.classList.toggle('is-open');
    launcher.setAttribute('aria-expanded', String(chat.classList.contains('is-open')));
    if (chat.classList.contains('is-open')) input.focus();
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const question = input.value.trim().slice(0, 300);
    if (!question) return;
    addMessage(escapeHtml(question), 'user');
    input.value = '';
    void responder(question);
  });

  document.querySelectorAll('[data-mauro-question]').forEach((button) => {
    button.addEventListener('click', () => {
      const question = button.dataset.mauroQuestion;
      addMessage(escapeHtml(question), 'user');
      void responder(question);
    });
  });
})();
