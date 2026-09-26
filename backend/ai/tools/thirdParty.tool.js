'use strict';

const Tercero = require('../../models/Tercero');

function soloDigitos(value) {
  return String(value || '').replace(/\D/g, '');
}

/** Búsqueda exacta de terceros activos, restringida siempre a la empresa actual. */
async function consultarTerceroPorDocumento({ client, empresaId, documento }) {
  const digits = soloDigitos(documento);
  if (digits.length < 5 || digits.length > 20) return null;

  const tercero = await Tercero.findByDocumentoNormalizado(client, empresaId, digits);
  if (!tercero) return null;

  return {
    id: tercero.id,
    nombre: tercero.nombre,
    documento: tercero.documento,
    tipoDocumento: tercero.tipo_documento,
    correo: tercero.email || null,
    telefono: tercero.telefono || null,
    ciudad: tercero.ciudad || null,
  };
}

module.exports = { consultarTerceroPorDocumento };
