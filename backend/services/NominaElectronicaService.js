'use strict';

const crypto = require('crypto');
const NominaElectronica = require('../models/NominaElectronica');
const { ValidationError } = require('../utils/errors');

const SMMLV = 1750905;
const AUXILIO_TRANSPORTE = 249095;
const TOPE_AUXILIO = 3501810;

class NominaElectronicaService {
  static async listar(client, empresaId, opts) {
    return NominaElectronica.findAll(client, empresaId, opts);
  }

  static async crear(client, empresaId, body, usuarioId) {
    const empleado = body.empleado || {};
    const campos = ['nombre', 'documento', 'cargo', 'cuenta'];
    if (campos.some((campo) => !String(empleado[campo] || '').trim())) {
      throw new ValidationError('Nombre, documento, cargo y cuenta bancaria del empleado son requeridos');
    }

    const salario = Number(body.salario) || 0;
    const bonificaciones = Number(body.bonificaciones) || 0;
    if (salario <= 0 || bonificaciones < 0) {
      throw new ValidationError('El salario debe ser mayor a cero y las bonificaciones no pueden ser negativas');
    }

    const base = salario + bonificaciones;
    const auxilio_transporte = base <= TOPE_AUXILIO ? AUXILIO_TRANSPORTE : 0;
    const deduccion_salud = redondear(base * 0.04);
    const deduccion_pension = redondear(base * 0.04);
    const deduccion_fsp = redondear(base * porcentajeFsp(base));
    const neto_pagar = redondear(salario + bonificaciones + auxilio_transporte - deduccion_salud - deduccion_pension - deduccion_fsp);
    const consecutivo = await NominaElectronica.nextConsecutivo(client, empresaId);
    const numero_nomina = `NE${String(consecutivo).padStart(3, '0')}`;
    const cude = crypto.createHash('sha256')
      .update(`${empresaId}|${numero_nomina}|${empleado.documento}|${neto_pagar}|${Date.now()}|${crypto.randomUUID()}`)
      .digest('hex').toUpperCase();

    return NominaElectronica.create(client, empresaId, {
      consecutivo, numero_nomina, cude,
      empleado_nombre: empleado.nombre.trim(), empleado_documento: empleado.documento.trim(),
      empleado_cargo: empleado.cargo.trim(), empleado_cuenta: empleado.cuenta.trim(),
      salario: redondear(salario), bonificaciones: redondear(bonificaciones), auxilio_transporte,
      deduccion_salud, deduccion_pension, deduccion_fsp, neto_pagar,
    }, usuarioId);
  }
}

function porcentajeFsp(base) {
  const smmlv = base / SMMLV;
  if (smmlv >= 4 && smmlv < 16) return 0.01;
  if (smmlv >= 16 && smmlv < 17) return 0.012;
  if (smmlv >= 17 && smmlv < 18) return 0.014;
  if (smmlv >= 18 && smmlv < 19) return 0.016;
  if (smmlv >= 19 && smmlv < 20) return 0.018;
  return smmlv >= 20 ? 0.02 : 0;
}

// El liquidador trabaja en pesos colombianos sin centavos; se conserva el
// mismo redondeo del formulario para que el documento y la base coincidan.
function redondear(valor) { return Math.round(Number(valor) || 0); }

module.exports = NominaElectronicaService;
