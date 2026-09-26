'use strict';

/**
 * Catálogo conversacional de Mauro IA.
 * Los ejemplos son datos de entrenamiento locales para el enrutador determinístico;
 * no se envían a proveedores externos ni se ejecutan como código.
 */

const modules = Object.freeze({
  facturacion: { label: 'Facturación electrónica', route: 'index.html?sec=crear-factura', available: true },
  facturas: { label: 'Facturas generadas', route: 'facturas-generadas/facturas-generadas.html', available: true },
  clientes: { label: 'Clientes y terceros', route: 'terceros/terceros.html', available: true },
  productos: { label: 'Productos y servicios', route: 'productos/productos.html', available: true },
  inventario: { label: 'Inventarios y bodegas', route: 'inventarios/inventarios.html', available: true },
  compras: { label: 'Compras', route: 'compras/factura-compra.html', available: true },
  pos: { label: 'Facturación POS', route: 'pos/pos.html', available: true },
  nomina: { label: 'Nómina electrónica', route: 'nomina-electronica/nomina-electronica.html', available: true },
  reportes: { label: 'Reportes', route: 'reportes/reportes.html', available: true },
  calendario: { label: 'Calendario empresarial', route: 'calendario/calendario.html', available: true },
  cotizaciones: { label: 'Cotizaciones', route: 'cotizaciones/cotizacion.html', available: true },
  configuracion: { label: 'Usuarios y configuración', route: 'usuario/usuario.html', available: true, roles: ['ADMIN', 'SUPERADMIN'] },
  mauro: { label: 'Mauro IA', route: null, available: true },
  contabilidad: { label: 'Contabilidad', route: null, available: false },
  backups: { label: 'Backups', route: null, available: false, roles: ['ADMIN', 'SUPERADMIN'] },
});

const ASK_FORMS = Object.freeze([
  (seed) => `¿Cómo ${seed}?`,
  (seed) => `Necesito saber cómo ${seed}.`,
  (seed) => `¿Me puedes guiar para ${seed}?`,
  (seed) => `Ayúdame a ${seed}, por favor.`,
  (seed) => `¿Qué pasos debo seguir para ${seed}?`,
  (seed) => `Quisiera consultar cómo ${seed}.`,
  (seed) => `Tengo una duda: ¿cómo ${seed}?`,
  (seed) => `¿Dónde puedo ${seed}?`,
  (seed) => `Explícame el proceso para ${seed}.`,
  (seed) => `Por favor, explícame cómo ${seed}.`,
  (seed) => `¿Se puede ${seed} en el sistema?`,
  (seed) => `Busco la opción para ${seed}.`,
]);

function intent(id, title, seed, count, cues, moduleKey, options = {}) {
  const examples = Array.isArray(options.examples) ? options.examples.slice(0, count) : [];
  for (let formIndex = 0; examples.length < count; formIndex += 1) {
    const form = ASK_FORMS[formIndex % ASK_FORMS.length];
    const suffix = formIndex >= ASK_FORMS.length ? ` (consulta ${Math.floor(formIndex / ASK_FORMS.length) + 1})` : '';
    examples.push(`${form(seed)}${suffix}`);
  }
  const topic = title.toLowerCase();
  const responseTemplates = [
    `Con gusto te ayudo con {topic}. {guidance}`,
    `Claro, revisemos {topic}: {guidance}`,
    `Por supuesto. Para {topic}, {guidance}`,
  ];
  const followUpTemplates = [
    '¿Quieres que te abra el módulo o prefieres que te explique el siguiente paso?',
    '¿Qué parte de este proceso quieres revisar primero?',
    '¿Te ayudo con algún dato o paso específico?',
  ];
  return Object.freeze({ id, title, seed, count, cues: Object.freeze(cues), moduleKey: moduleKey || null, kind: options.kind || 'guide', examples: Object.freeze(examples), responseTemplates: Object.freeze(responseTemplates), followUpTemplates: Object.freeze(followUpTemplates) });
}

const domains = Object.freeze([
  {
    id: 'general', title: 'Saludos y conversación general', count: 30, intents: [
      intent('saludo', 'Saludo', 'saludar a Mauro', 12, ['hola', 'buenos dias', 'buenas tardes', 'buenas noches', 'que tal', 'hey', 'como estas'], null, { kind: 'greeting', examples: ['Hola.', 'Buenos días.', 'Buenas tardes, Mauro.', 'Buenas noches.', 'Hola, ¿cómo estás?', '¿Qué tal, Mauro?', 'Buen día.', 'Buenas, asistente.', 'Hola Mauro, ¿estás ahí?', 'Un saludo para Mauro.', '¿Todo bien?', 'Hola, buenos días.'] }),
      intent('identidad', 'Identidad de Mauro', 'conocer quién es Mauro IA', 8, ['quien eres', 'quien es mauro', 'que eres', 'tu nombre', 'eres una inteligencia artificial'], null, { kind: 'identity', examples: ['¿Quién eres?', '¿Cómo te llamas?', '¿Eres Mauro IA?', '¿Qué tipo de asistente eres?', '¿Cuál es tu función en AMC?', 'Cuéntame quién eres.', '¿Eres una inteligencia artificial?', '¿Quién me está atendiendo?'] }),
      intent('capacidades', 'Capacidades de Mauro', 'conocer qué puede hacer Mauro en AMC', 6, ['que puedes hacer', 'en que me ayudas', 'que sabes hacer', 'tus funciones', 'para que sirves'], null, { kind: 'capabilities', examples: ['¿Qué puedes hacer?', '¿En qué me puedes ayudar?', '¿Qué funciones tienes?', '¿Puedes orientarme en AMC?', '¿Qué consultas puedes resolver?', '¿Para qué sirve Mauro IA?'] }),
      intent('agradecimiento_despedida', 'Agradecimiento o despedida', 'agradecer o despedirse de Mauro', 4, ['gracias', 'muchas gracias', 'hasta luego', 'chao', 'adios'], null, { kind: 'thanks', examples: ['Gracias.', 'Muchas gracias por la ayuda.', 'Hasta luego, Mauro.', 'Chao, hablamos después.'] }),
    ],
  },
  {
    id: 'navegacion', title: 'Navegación del sistema', count: 40, intents: [
      intent('abrir_facturacion', 'Abrir facturación', 'abrir facturación electrónica', 3, ['facturacion', 'facturar', 'factura'], 'facturacion', { kind: 'navigate' }),
      intent('abrir_facturas_generadas', 'Abrir facturas generadas', 'abrir el historial de facturas generadas', 3, ['facturas generadas', 'historial de facturas', 'facturas emitidas'], 'facturas', { kind: 'navigate' }),
      intent('abrir_clientes', 'Abrir clientes', 'abrir clientes y terceros', 3, ['cliente', 'tercero', 'nit'], 'clientes', { kind: 'navigate' }),
      intent('abrir_inventario', 'Abrir inventarios', 'abrir inventarios y bodegas', 3, ['inventario', 'bodega', 'stock'], 'inventario', { kind: 'navigate' }),
      intent('abrir_compras', 'Abrir compras', 'abrir el módulo de compras', 3, ['compra', 'proveedor'], 'compras', { kind: 'navigate' }),
      intent('abrir_nomina', 'Abrir nómina', 'abrir nómina electrónica', 4, ['nomina', 'empleado'], 'nomina', { kind: 'navigate' }),
      intent('abrir_reportes', 'Abrir reportes', 'abrir reportes empresariales', 3, ['reporte', 'informe'], 'reportes', { kind: 'navigate' }),
      intent('abrir_calendario', 'Abrir calendario', 'abrir el calendario empresarial', 3, ['calendario', 'agenda'], 'calendario', { kind: 'navigate' }),
      intent('abrir_configuracion', 'Abrir configuración', 'abrir configuración y usuarios', 2, ['configuracion', 'usuario', 'permisos'], 'configuracion', { kind: 'navigate' }),
      intent('abrir_mauro', 'Abrir Mauro IA', 'abrir Mauro IA', 3, ['mauro', 'chatbot', 'asistente'], 'mauro', { kind: 'navigate' }),
      intent('abrir_contabilidad', 'Abrir contabilidad', 'abrir el módulo de contabilidad', 3, ['contabilidad', 'balance', 'libro diario'], 'contabilidad', { kind: 'navigate' }),
      intent('abrir_backups', 'Abrir backups', 'abrir backups empresariales', 2, ['backup', 'respaldo', 'copia de seguridad'], 'backups', { kind: 'navigate' }),
      intent('abrir_cotizaciones', 'Abrir cotizaciones', 'abrir cotizaciones', 2, ['cotizacion', 'propuesta comercial'], 'cotizaciones', { kind: 'navigate' }),
      intent('abrir_productos', 'Abrir productos', 'abrir productos y servicios', 3, ['producto', 'servicio', 'catalogo'], 'productos', { kind: 'navigate' }),
    ],
  },
  {
    id: 'facturacion', title: 'Facturación electrónica', count: 70, intents: [
      intent('crear_factura', 'Crear factura electrónica', 'crear una factura electrónica de venta', 5, ['crear factura', 'crear una factura', 'creo', 'hacer factura', 'hago', 'emitir factura', 'emitir una factura', 'facturar'], 'facturacion'),
      intent('editar_factura', 'Editar factura', 'editar una factura existente', 5, ['editar factura', 'modificar factura', 'corregir factura'], 'facturas'),
      intent('buscar_factura', 'Buscar factura', 'buscar una factura emitida', 5, ['buscar factura', 'consultar factura', 'ver factura'], 'facturas'),
      intent('anular_factura', 'Anular factura', 'anular una factura', 5, ['anular factura', 'cancelar factura', 'rechazar factura'], 'facturas'),
      intent('nota_credito', 'Nota crédito', 'crear una nota crédito', 5, ['nota credito', 'notas credito'], 'facturacion'),
      intent('nota_debito', 'Nota débito', 'crear una nota débito', 5, ['nota debito', 'notas debito'], 'facturacion'),
      intent('documento_soporte', 'Documento soporte', 'generar un documento soporte', 5, ['documento soporte', 'documentos soporte'], 'facturacion'),
      intent('factura_pos', 'Factura POS', 'emitir una factura POS', 5, ['factura pos', 'pos'], 'pos'),
      intent('consultar_cufe', 'Consultar CUFE', 'consultar el CUFE de una factura', 5, ['cufe'], 'facturas'),
      intent('consultar_xml', 'Consultar XML', 'consultar el XML de una factura', 5, ['xml factura', 'archivo xml'], 'facturas'),
      intent('consultar_pdf', 'Consultar PDF', 'descargar el PDF de una factura', 5, ['pdf factura', 'descargar pdf'], 'facturas'),
      intent('estado_dian', 'Estado ante la DIAN', 'consultar el estado de una factura ante la DIAN', 5, ['estado dian', 'dian factura', 'estado de la factura'], 'facturas'),
      intent('factura_aceptada', 'Factura aceptada', 'verificar que la factura fue aceptada', 5, ['factura aceptada', 'aceptada por la dian'], 'facturas'),
      intent('factura_rechazada', 'Factura rechazada', 'revisar una factura rechazada', 5, ['factura rechazada', 'rechazada por la dian', 'error al transmitir'], 'facturas'),
    ],
  },
  {
    id: 'clientes', title: 'Clientes y terceros', count: 40, intents: [
      intent('crear_cliente', 'Crear cliente', 'crear un cliente', 5, ['crear cliente', 'crear un cliente', 'creo un cliente', 'agregar cliente', 'agrego', 'registrar cliente'], 'clientes'),
      intent('buscar_cliente', 'Buscar cliente', 'buscar un cliente por documento', 5, ['buscar cliente', 'consultar cliente', 'encontrar cliente'], 'clientes'),
      intent('editar_cliente', 'Editar cliente', 'editar los datos de un cliente', 5, ['editar cliente', 'actualizar cliente', 'modificar cliente'], 'clientes'),
      intent('cartera_cliente', 'Cartera de clientes', 'consultar la cartera de un cliente', 5, ['cartera', 'cuenta por cobrar', 'saldo cliente'], 'reportes'),
      intent('historial_cliente', 'Historial del cliente', 'consultar el historial de compras de un cliente', 5, ['historial de compras', 'historial del cliente', 'compras del cliente'], 'clientes'),
      intent('datos_nit', 'NIT del cliente', 'registrar o consultar el NIT de un cliente', 4, ['nit cliente', 'nit del cliente', 'nit'], 'clientes'),
      intent('datos_rut', 'RUT del cliente', 'revisar el RUT de un cliente', 4, ['rut cliente', 'rut del cliente', 'rut'], 'clientes'),
      intent('contacto_cliente', 'Contacto del cliente', 'actualizar el correo o teléfono del cliente', 4, ['correo cliente', 'telefono cliente', 'email cliente', 'contacto cliente'], 'clientes'),
      intent('proveedores_terceros', 'Proveedores y terceros', 'gestionar un proveedor como tercero', 3, ['proveedor tercero', 'crear proveedor', 'registrar proveedor'], 'clientes'),
    ],
  },
  {
    id: 'productos', title: 'Productos y servicios', count: 40, intents: [
      intent('crear_producto', 'Crear producto', 'crear un producto o servicio', 5, ['crear producto', 'agregar producto', 'nuevo producto'], 'productos'),
      intent('buscar_producto', 'Buscar producto', 'buscar un producto por código', 5, ['buscar producto', 'consultar producto', 'producto por codigo'], 'productos'),
      intent('iva_producto', 'IVA del producto', 'configurar el IVA de un producto', 5, ['iva producto', 'impuesto del producto', 'tarifa iva'], 'productos'),
      intent('codigo_interno', 'Código interno', 'asignar un código interno al producto', 5, ['codigo interno', 'referencia interna'], 'productos'),
      intent('codigo_dian', 'Código DIAN', 'asignar el código DIAN al producto', 5, ['codigo dian', 'codigo estandar dian'], 'productos'),
      intent('unidad_medida', 'Unidad de medida', 'configurar la unidad de medida de un producto', 5, ['unidad de medida', 'unidad producto'], 'productos'),
      intent('precio_producto', 'Precio del producto', 'cambiar el precio de un producto', 5, ['precio producto', 'precio de venta', 'cambiar precio'], 'productos'),
      intent('descuento_producto', 'Descuento del producto', 'aplicar un descuento a un producto', 5, ['descuento producto', 'descuento'], 'productos'),
    ],
  },
  {
    id: 'inventario', title: 'Inventarios y bodegas', count: 50, intents: [
      intent('consultar_stock', 'Consultar existencias', 'consultar el stock de un producto', 6, ['stock', 'existencia', 'disponible', 'unidades'], 'inventario', { kind: 'stock' }),
      intent('kardex', 'Kardex', 'consultar el kardex de un producto', 6, ['kardex', 'movimientos de inventario'], 'inventario'),
      intent('entrada_inventario', 'Entrada de inventario', 'registrar una entrada a inventario', 6, ['entrada inventario', 'entradas inventario', 'ingresar inventario'], 'inventario'),
      intent('salida_inventario', 'Salida de inventario', 'registrar una salida de inventario', 6, ['salida inventario', 'salidas inventario', 'retirar inventario'], 'inventario'),
      intent('ajuste_inventario', 'Ajuste de inventario', 'hacer un ajuste de inventario', 6, ['ajuste inventario', 'ajustar stock'], 'inventario'),
      intent('traslado_inventario', 'Traslado entre bodegas', 'trasladar productos entre bodegas', 6, ['traslado bodega', 'trasladar inventario', 'transferir productos'], 'inventario'),
      intent('stock_minimo', 'Inventario bajo mínimo', 'revisar productos por debajo del stock mínimo', 7, ['stock minimo', 'inventario bajo', 'bajo minimo'], 'inventario'),
      intent('bodegas', 'Bodegas', 'gestionar las bodegas de la empresa', 7, ['bodega', 'bodegas'], 'inventario'),
    ],
  },
  {
    id: 'compras', title: 'Compras', count: 35, intents: [
      intent('registrar_compra', 'Registrar compra', 'registrar una compra', 5, ['registrar compra', 'crear compra', 'ingresar compra'], 'compras'),
      intent('factura_proveedor', 'Factura de proveedor', 'registrar una factura de proveedor', 5, ['factura proveedor', 'factura de compra'], 'compras'),
      intent('documento_soporte_compra', 'Documento soporte de compra', 'crear un documento soporte para una compra', 5, ['documento soporte compra', 'soporte proveedor'], 'compras'),
      intent('inventario_compra', 'Inventario por compra', 'actualizar inventario con una compra', 5, ['inventario por compra', 'compra actualiza inventario'], 'compras'),
      intent('iva_descontable', 'IVA descontable', 'consultar el IVA descontable de una compra', 5, ['iva descontable', 'iva compra'], 'reportes'),
      intent('cuentas_por_pagar', 'Cuentas por pagar', 'consultar las cuentas por pagar a proveedores', 5, ['cuentas por pagar', 'cuenta por pagar', 'saldo proveedor'], 'reportes'),
      intent('proveedor_compra', 'Proveedor de compra', 'seleccionar el proveedor de una compra', 5, ['proveedor compra', 'tercero proveedor'], 'compras'),
    ],
  },
  {
    id: 'reportes', title: 'Reportes', count: 50, intents: [
      intent('ventas_hoy', 'Ventas de hoy', 'consultar las ventas de hoy', 5, ['ventas hoy', 'ventas de hoy'], 'reportes'),
      intent('ventas_mes', 'Ventas del mes', 'consultar las ventas del mes', 5, ['ventas mes', 'ventas del mes'], 'reportes'),
      intent('reporte_compras', 'Reporte de compras', 'consultar el reporte de compras', 5, ['reporte compras', 'compras del mes'], 'reportes'),
      intent('reporte_iva', 'Reporte de IVA', 'consultar el reporte de IVA', 5, ['reporte iva', 'iva generado'], 'reportes'),
      intent('reporte_ica', 'Reporte de ICA', 'consultar el reporte de ICA', 5, ['reporte ica', 'impuesto ica'], 'reportes'),
      intent('reporte_retefuente', 'Reporte de retefuente', 'consultar el reporte de retefuente', 5, ['retefuente', 'retencion en la fuente'], 'reportes'),
      intent('top_clientes', 'Top clientes', 'consultar los clientes con más compras', 5, ['top clientes', 'mejores clientes', 'clientes que mas compran'], 'reportes'),
      intent('top_productos', 'Top productos', 'consultar los productos más vendidos', 5, ['top productos', 'productos mas vendidos'], 'reportes'),
      intent('exportar_excel', 'Exportar a Excel', 'exportar un reporte a Excel', 5, ['exportar excel', 'descargar excel', 'excel'], 'reportes'),
      intent('exportar_pdf', 'Exportar a PDF', 'exportar un reporte a PDF', 5, ['exportar pdf', 'descargar reporte pdf', 'pdf'], 'reportes'),
    ],
  },
  {
    id: 'nomina', title: 'Nómina electrónica', count: 45, intents: [
      intent('crear_empleado', 'Crear empleado', 'crear un empleado', 6, ['crear empleado', 'registrar empleado', 'nuevo empleado'], 'nomina'),
      intent('liquidar_nomina', 'Liquidar nómina', 'liquidar la nómina de un período', 6, ['liquidar nomina', 'liquidacion nomina'], 'nomina'),
      intent('vacaciones', 'Vacaciones', 'gestionar las vacaciones de un empleado', 6, ['vacaciones', 'liquidar vacaciones'], 'nomina'),
      intent('prima', 'Prima', 'calcular la prima de servicios', 6, ['prima de servicios', 'prima'], 'nomina'),
      intent('cesantias', 'Cesantías', 'calcular las cesantías de un empleado', 7, ['cesantias', 'intereses cesantias'], 'nomina'),
      intent('xml_nomina', 'XML de nómina', 'consultar el XML de nómina electrónica', 7, ['xml nomina', 'archivo nomina xml'], 'nomina'),
      intent('nomina_dian', 'Nómina ante la DIAN', 'consultar el estado de nómina ante la DIAN', 7, ['dian nomina', 'nomina dian', 'transmitir nomina'], 'nomina'),
    ],
  },
  {
    id: 'contabilidad', title: 'Contabilidad', count: 50, intents: [
      intent('puc', 'PUC', 'consultar el Plan Único de Cuentas', 6, ['puc', 'plan unico de cuentas'], 'contabilidad'),
      intent('balance', 'Balance', 'consultar el balance general', 6, ['balance general', 'balance'], 'contabilidad'),
      intent('libro_diario', 'Libro diario', 'consultar el libro diario', 6, ['libro diario'], 'contabilidad'),
      intent('libro_mayor', 'Libro mayor', 'consultar el libro mayor', 6, ['libro mayor'], 'contabilidad'),
      intent('estado_resultados', 'Estado de resultados', 'consultar el estado de resultados', 6, ['estado de resultados', 'perdidas y ganancias'], 'contabilidad'),
      intent('asientos', 'Asientos contables', 'registrar asientos contables', 6, ['asiento contable', 'asientos contables'], 'contabilidad'),
      intent('retenciones_contables', 'Retenciones contables', 'consultar retenciones contables', 7, ['retenciones contables', 'contabilizar retenciones'], 'contabilidad'),
      intent('niif', 'NIIF', 'consultar información sobre NIIF', 7, ['niif', 'normas niif'], 'contabilidad'),
    ],
  },
  {
    id: 'dian', title: 'DIAN', count: 25, intents: [
      intent('xml_rechazado', 'XML rechazado', 'revisar un XML rechazado por la DIAN', 4, ['xml rechazado', 'rechazo xml'], 'facturas'),
      intent('xml_aceptado', 'XML aceptado', 'verificar un XML aceptado por la DIAN', 4, ['xml aceptado', 'aceptacion xml'], 'facturas'),
      intent('cufe_dian', 'CUFE', 'consultar el CUFE ante la DIAN', 4, ['cufe dian', 'cufe'], 'facturas'),
      intent('resolucion_dian', 'Resoluciones DIAN', 'consultar las resoluciones de facturación', 4, ['resolucion dian', 'resoluciones facturacion', 'numeracion autorizada'], 'configuracion'),
      intent('vigencia_dian', 'Vigencia DIAN', 'consultar la vigencia de una resolución DIAN', 4, ['vigencia resolucion', 'vigencia dian'], 'configuracion'),
      intent('firma_digital', 'Firma digital', 'configurar el certificado y la firma digital', 5, ['firma digital', 'certificado digital', 'certificado dian'], 'configuracion'),
    ],
  },
  {
    id: 'seguridad', title: 'Configuración y seguridad', count: 25, intents: [
      intent('usuarios', 'Usuarios', 'gestionar los usuarios de la empresa', 5, ['usuarios', 'crear usuario', 'gestionar usuarios'], 'configuracion'),
      intent('roles', 'Roles', 'configurar los roles de usuario', 4, ['roles usuario', 'rol de usuario'], 'configuracion'),
      intent('permisos', 'Permisos', 'consultar los permisos del sistema', 4, ['permisos', 'permisos del sistema'], 'configuracion'),
      intent('empresas', 'Empresas', 'administrar las empresas del sistema', 4, ['empresa sistema', 'administrar empresa', 'multiempresa'], 'configuracion'),
      intent('sucursales', 'Sucursales', 'gestionar sucursales de la empresa', 4, ['sucursales', 'sucursal'], 'configuracion'),
      intent('certificado', 'Certificado digital', 'gestionar el certificado digital', 4, ['certificado digital', 'certificado'], 'configuracion'),
    ],
  },
  {
    id: 'backups', title: 'Backups', count: 20, intents: [
      intent('crear_backup', 'Crear backup', 'crear un backup de la empresa', 4, ['crear backup', 'crear respaldo', 'hacer copia de seguridad'], 'backups'),
      intent('restaurar_backup', 'Restaurar backup', 'restaurar un backup', 4, ['restaurar backup', 'restaurar respaldo'], 'backups'),
      intent('ultimo_backup', 'Último backup', 'consultar cuándo se realizó el último backup', 4, ['ultimo backup', 'ultimo respaldo'], 'backups'),
      intent('historial_backup', 'Historial de backups', 'consultar el historial de backups', 4, ['historial backup', 'historial respaldos'], 'backups'),
      intent('integridad_backup', 'Integridad del backup', 'verificar la integridad de un backup', 4, ['integridad backup', 'validar backup'], 'backups'),
    ],
  },
  {
    id: 'soporte', title: 'Ayuda y soporte', count: 30, intents: [
      intent('error_facturacion', 'Error al facturar', 'resolver un error al facturar', 5, ['error al facturar', 'error factura', 'no puedo facturar'], 'facturacion'),
      intent('error_inventario', 'Error de inventario', 'resolver un error de inventario', 5, ['error inventario', 'stock incorrecto'], 'inventario'),
      intent('error_xml', 'Error XML', 'resolver un error de XML', 5, ['error xml', 'xml invalido'], 'facturas'),
      intent('error_nomina', 'Error de nómina', 'resolver un error de nómina', 5, ['error nomina', 'problema nomina'], 'nomina'),
      intent('contacto_soporte', 'Contacto de soporte', 'contactar al soporte de AMC', 5, ['contacto soporte', 'telefono soporte', 'ayuda humana'], null),
      intent('manuales', 'Manuales AMC', 'consultar los manuales de AMC', 5, ['manual amc', 'manuales', 'documentacion del sistema'], null),
    ],
  },
]);

const intents = Object.freeze(domains.flatMap((domain) => domain.intents.map((item) => Object.freeze({ ...item, domainId: domain.id, domainTitle: domain.title }))));
const trainingExamples = Object.freeze(intents.flatMap((item) => item.examples.map((example) => Object.freeze({ text: example, intentId: item.id, domainId: item.domainId }))));

function getCorpusStats() {
  return {
    total: trainingExamples.length,
    unique: new Set(trainingExamples.map((item) => item.text)).size,
    domains: domains.map((domain) => ({ id: domain.id, expected: domain.count, actual: domain.intents.reduce((sum, item) => sum + item.examples.length, 0), intents: domain.intents.length })),
  };
}

module.exports = { modules, domains, intents, trainingExamples, getCorpusStats };
