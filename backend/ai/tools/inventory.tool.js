'use strict';

const Producto = require('../../models/Producto');

/**
 * Herramienta de inventario para Mauro.
 * Nunca recibe ni ejecuta SQL del usuario: solo consulta por código mediante
 * el modelo existente, que aplica empresa_id explícitamente.
 */
async function consultarStockPorCodigo({ client, empresaId, codigo }) {
  const codigoNormalizado = String(codigo || '').trim();
  if (!codigoNormalizado || codigoNormalizado.length > 64) return null;

  const producto = await Producto.findByCodigo(client, empresaId, codigoNormalizado);
  if (!producto) return null;

  const stock = Number(producto.stock_total || 0);
  const stockMinimo = Number(producto.stock_minimo || 0);
  return {
    id: producto.id,
    codigo: producto.codigo,
    nombre: producto.nombre,
    unidadMedida: producto.unidad_medida || 'UNIDAD',
    stock,
    stockMinimo,
    estado: stock <= 0 ? 'AGOTADO' : stock <= stockMinimo ? 'BAJO' : 'DISPONIBLE',
  };
}

module.exports = { consultarStockPorCodigo };
