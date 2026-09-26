'use strict';

const { randomUUID } = require('crypto');
const { intents } = require('./catalog');
const { normalizar, detectIntent, detectSecurityRequest, buildReply, actionFor } = require('./intentEngine');
const ConversationMemory = require('./ConversationMemory');
const { consultarStockPorCodigo, consultarProductoPorCodigo } = require('./tools/inventory.tool');
const { consultarTerceroPorDocumento } = require('./tools/thirdParty.tool');

const SECRET_REFUSAL = 'Puedo ayudarte con procesos de AMC, pero no comparto credenciales, instrucciones internas ni consultas de base de datos. Tampoco tengo acceso a datos de otras empresas. ¿Quieres revisar una función de tu empresa?';

function extraerCodigoProducto(mensaje) {
  const texto = String(mensaje || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const coincidencia = texto.match(/(?:codigo|cod|referencia)\s*(?:del?\s*)?(?:producto\s*)?(?:(?:es|numero|nro|no\.?)\s+)?[:#-]?\s*["']?([a-z0-9][a-z0-9._/-]{0,63})/i)
    || texto.match(/producto\s+([a-z0-9][a-z0-9._/-]{0,63})/i);
  return coincidencia ? coincidencia[1].replace(/[.,;:!?]+$/g, '') : null;
}

function extraerDocumento(mensaje) {
  const original = String(mensaje || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const match = original.match(/\b(?:nit|documento|cedula|cc)\s*(?:numero|nro|no\.?|:)?\s*([0-9][0-9.\-\s]{3,24})/i);
  if (!match) return null;
  const digits = match[1].replace(/\D/g, '');
  return digits.length >= 5 && digits.length <= 20 ? digits : null;
}

function looksLikeClientName(value) {
  const text = String(value || '').trim();
  return text.length >= 2 && text.length <= 100 && text.split(/\s+/).length <= 8
    && /^[\p{L}\p{M}0-9 .,'&-]+$/u.test(text)
    && !/[?¿!¡]/.test(text);
}

function moduleAction(moduleKey, role) {
  return actionFor(moduleKey, role).action;
}

function contextualizeClientReply(clientName, role, turnCount) {
  const action = moduleAction('facturacion', role);
  const options = [
    `Listo, tendré presente a ${clientName} mientras dure esta conversación. Puedo guiarte, pero todavía no creo la factura directamente desde el chat.`,
    `Entendido: el cliente para esta guía es ${clientName}. El registro de la factura se completa en el módulo, donde podrás revisar todos los datos antes de emitirla.`,
    `Anoté a ${clientName} como contexto de esta conversación. Para evitar errores, la factura se debe terminar y confirmar dentro del módulo de facturación.`,
  ];
  return {
    intencion: 'contexto_cliente_factura', dominio: 'facturacion', tipo: 'conversation', titulo: 'Cliente para la factura',
    mensaje: options[turnCount % options.length],
    seguimiento: '¿Quieres que abra Facturación Electrónica de Venta para continuar?',
    acciones: action ? [action] : [], sugerencias: [],
    tarjeta: { tipo: 'resumen', etiqueta: 'Cliente recordado en esta conversación', valor: clientName },
  };
}

function toolResponse(candidate, role, { tipo, titulo, mensaje, seguimiento, data, notFound = false }) {
  const action = candidate.moduleKey ? moduleAction(candidate.moduleKey, role) : null;
  return {
    intencion: candidate.id,
    dominio: candidate.domainId,
    tipo: notFound ? 'not_found' : tipo,
    titulo,
    mensaje: `${notFound ? 'Claro, ya lo revisé. ' : 'Con gusto. '}${mensaje}`,
    seguimiento,
    acciones: action ? [action] : [],
    sugerencias: [],
    ...(data ? { data } : {}),
  };
}

function securityResponse() {
  return {
    intencion: 'SEGURIDAD', dominio: 'seguridad', tipo: 'security', titulo: 'Protección de la información',
    mensaje: SECRET_REFUSAL,
    seguimiento: '¿En qué proceso de tu empresa necesitas orientación?',
    acciones: [], sugerencias: [],
  };
}

function findIntent(id) {
  return intents.find((item) => item.id === id) || null;
}

class MauroAgent {
  static async consultar({ mensaje, client, empresaId, usuarioId, role, conversationId }) {
    const idConversacion = conversationId || randomUUID();
    const context = await ConversationMemory.load(client, empresaId, usuarioId, idConversacion);
    const normalized = normalizar(mensaje);

    if (detectSecurityRequest(normalized)) return { conversationId: idConversacion, respuesta: securityResponse() };

    let candidate = detectIntent(mensaje, context);
    const codigoExplicito = extraerCodigoProducto(mensaje);
    if (codigoExplicito && /\b(stock|existencia|existencias|disponible|unidades)\b/.test(normalized)) candidate = findIntent('consultar_stock');
    if (!candidate && codigoExplicito && context.lastIntent === 'consultar_stock') candidate = findIntent('consultar_stock');

    if (!candidate && context.pendingSlot === 'cliente_factura' && looksLikeClientName(mensaje)) {
      const nextContext = {
        ...context,
        clientName: String(mensaje).trim().slice(0, 100),
        pendingSlot: undefined,
        lastIntent: 'crear_factura',
        turnCount: (context.turnCount || 0) + 1,
      };
      await ConversationMemory.save(client, empresaId, usuarioId, idConversacion, nextContext);
      return { conversationId: idConversacion, respuesta: contextualizeClientReply(nextContext.clientName, role, nextContext.turnCount) };
    }

    const nextContext = { ...context, turnCount: (context.turnCount || 0) + 1 };
    if (candidate) {
      nextContext.lastIntent = candidate.id;
      if (candidate.id !== 'crear_factura') delete nextContext.pendingSlot;
    }

    if (!candidate) {
      const response = buildReply(null, { role, context: nextContext, text: mensaje });
      await ConversationMemory.save(client, empresaId, usuarioId, idConversacion, nextContext);
      return { conversationId: idConversacion, respuesta: response };
    }

    if (candidate.id === 'crear_factura') {
      if (!nextContext.clientName) nextContext.pendingSlot = 'cliente_factura';
      const response = buildReply(candidate, { role, context: nextContext, text: mensaje });
      response.seguimiento = nextContext.clientName
        ? `Tengo presente a ${nextContext.clientName} en esta conversación. ¿Quieres abrir el módulo para continuar?`
        : '¿Qué cliente vas a usar? Si me escribes el nombre, lo recordaré durante esta conversación.';
      await ConversationMemory.save(client, empresaId, usuarioId, idConversacion, nextContext);
      return { conversationId: idConversacion, respuesta: response };
    }

    if (candidate.kind === 'stock') {
      const codigo = codigoExplicito || (context.lastIntent === 'consultar_stock' ? context.productCode : null);
      if (codigo) {
        nextContext.productCode = codigo;
        const producto = await consultarStockPorCodigo({ client, empresaId, codigo });
        await ConversationMemory.save(client, empresaId, usuarioId, idConversacion, nextContext);
        if (!producto) {
          return {
            conversationId: idConversacion,
            respuesta: toolResponse(candidate, role, {
              titulo: 'Producto no encontrado', tipo: 'not_found', notFound: true,
              mensaje: `No encontré un producto activo con el código ${codigo} dentro de tu empresa. Verifica el código o consulta Productos e Inventario.`,
              seguimiento: '¿Quieres revisar otro código?',
            }),
          };
        }
        const estado = producto.estado === 'DISPONIBLE' ? 'Inventario suficiente' : producto.estado === 'BAJO' ? 'Stock bajo' : 'Producto agotado';
        return {
          conversationId: idConversacion,
          respuesta: toolResponse(candidate, role, {
            titulo: producto.nombre,
            tipo: 'inventory_stock',
            mensaje: `Consulté el inventario de tu empresa para el producto ${producto.nombre}.`,
            seguimiento: '¿Quieres consultar otro producto?',
            data: { ...producto, etiquetaEstado: estado, fuente: 'Consulta en tiempo real del inventario de tu empresa.' },
          }),
        };
      }
    }

    if (candidate.id === 'buscar_producto' && codigoExplicito) {
      const producto = await consultarProductoPorCodigo({ client, empresaId, codigo: codigoExplicito });
      await ConversationMemory.save(client, empresaId, usuarioId, idConversacion, nextContext);
      if (!producto) {
        return {
          conversationId: idConversacion,
          respuesta: toolResponse(candidate, role, {
            titulo: 'Producto no encontrado', tipo: 'not_found', notFound: true,
            mensaje: `No encontré un producto activo con el código ${codigoExplicito} en tu empresa.`,
            seguimiento: '¿Quieres verificar otro código?',
          }),
        };
      }
      return {
        conversationId: idConversacion,
        respuesta: toolResponse(candidate, role, {
          titulo: producto.nombre,
          tipo: 'product_details',
          mensaje: `Encontré el producto ${producto.nombre} en el catálogo de tu empresa.`,
          seguimiento: '¿Quieres consultar existencias o revisar otro producto?',
          data: producto,
        }),
      };
    }

    if (candidate.domainId === 'clientes') {
      const documento = extraerDocumento(mensaje);
      if (documento && /\b(cliente|tercero|nit|documento|cedula|cc)\b/.test(normalized)) {
        const lookupCandidate = findIntent('buscar_cliente') || candidate;
        const tercero = await consultarTerceroPorDocumento({ client, empresaId, documento });
        await ConversationMemory.save(client, empresaId, usuarioId, idConversacion, nextContext);
        if (!tercero) {
          return {
            conversationId: idConversacion,
            respuesta: toolResponse(lookupCandidate, role, {
              titulo: 'Cliente no encontrado', tipo: 'not_found', notFound: true,
              mensaje: 'No encontré un tercero activo con ese documento en tu empresa.',
              seguimiento: '¿Quieres revisar el número o buscar otro cliente?',
            }),
          };
        }
        return {
          conversationId: idConversacion,
          respuesta: toolResponse(lookupCandidate, role, {
            titulo: tercero.nombre, tipo: 'client_lookup',
            mensaje: 'Encontré este tercero activo dentro de tu empresa.',
            seguimiento: '¿Quieres abrir el registro o usar este cliente en una factura?',
            data: tercero,
          }),
        };
      }
    }

    const response = buildReply(candidate, { role, context: nextContext, text: mensaje });
    await ConversationMemory.save(client, empresaId, usuarioId, idConversacion, nextContext);
    return { conversationId: idConversacion, respuesta: response };
  }
}

module.exports = MauroAgent;
module.exports.extraerCodigoProducto = extraerCodigoProducto;
module.exports.extraerDocumento = extraerDocumento;
