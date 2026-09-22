'use strict';

const { consultarStockPorCodigo } = require('./tools/inventory.tool');

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function extraerCodigoInventario(mensaje) {
  const texto = normalizar(mensaje).trim();
  const coincidencia = texto.match(/(?:codigo|cod\.?|referencia)\s*(?:del?\s*)?(?:producto\s*)?[:#-]?\s*["'“”]?([a-z0-9][a-z0-9._/-]{0,63})/i)
    || texto.match(/producto\s+([a-z0-9][a-z0-9._/-]{0,63})/i);
  return coincidencia ? coincidencia[1] : null;
}

class MauroAgent {
  static async consultar({ mensaje, client, empresaId }) {
    const texto = normalizar(mensaje);
    const esInventario = /stock|existencia|inventario|disponible|unidades/.test(texto);
    const codigo = extraerCodigoInventario(mensaje);

    if (esInventario && codigo) {
      const producto = await consultarStockPorCodigo({ client, empresaId, codigo });
      if (!producto) {
        return {
          intencion: 'CONSULTAR_STOCK',
          tipo: 'not_found',
          mensaje: `No encontré un producto activo con el código ${codigo} en tu empresa.`,
        };
      }
      return {
        intencion: 'CONSULTAR_STOCK',
        tipo: 'inventory_stock',
        mensaje: `Encontré ${producto.nombre}.`,
        data: producto,
      };
    }

    return {
      intencion: 'AYUDA',
      tipo: 'help',
      mensaje: 'Puedo consultar el inventario por código. Por ejemplo: ¿Cuánto stock tiene el producto código 012?',
    };
  }
}

module.exports = MauroAgent;
