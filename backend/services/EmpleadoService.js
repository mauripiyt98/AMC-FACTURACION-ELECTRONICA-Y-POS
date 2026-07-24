'use strict';

const Empleado = require('../models/Empleado');
const { NotFoundError, ValidationError } = require('../utils/errors');
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class EmpleadoService {
  static async listar(client, empresaId, opts) {
    return Empleado.findAll(client, empresaId, opts);
  }

  static async obtener(client, empresaId, id) {
    if (!UUID_REGEX.test(id)) throw new NotFoundError('Empleado');
    const empleado = await Empleado.findById(client, empresaId, id);
    if (!empleado) throw new NotFoundError('Empleado');
    return empleado;
  }

  static async crear(client, empresaId, body) {
    return Empleado.create(client, empresaId, this.validarYNormalizar(body));
  }

  static async actualizar(client, empresaId, id, body) {
    if (!UUID_REGEX.test(id)) throw new NotFoundError('Empleado');
    const empleado = await Empleado.update(client, empresaId, id, this.validarYNormalizar(body));
    if (!empleado) throw new NotFoundError('Empleado');
    return empleado;
  }

  static validarYNormalizar(body) {
    const required = ['nombre', 'documento', 'email', 'telefono', 'ciudad', 'direccion', 'cuenta',
      'fechaInicioContrato', 'tipoContrato', 'salario', 'numeroContrato', 'cargo', 'tipoCotizante',
      'fondoSalud', 'fondoPension', 'cajaCompensacion', 'arl', 'nivelRiesgoArl'];
    if (required.some((key) => !String(body[key] == null ? '' : body[key]).trim())) {
      throw new ValidationError('Todos los campos del empleado son obligatorios');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) throw new ValidationError('Correo electrónico no válido');
    if (!['FIJO', 'INDEFINIDO'].includes(body.tipoContrato)) throw new ValidationError('Tipo de contrato no válido');
    if (!['DEPENDIENTE', 'INDEPENDIENTE'].includes(body.tipoCotizante)) throw new ValidationError('Tipo de cotizante no válido');
    const salario = Number(body.salario);
    if (!Number.isFinite(salario) || salario <= 0) throw new ValidationError('Valor de salario no válido');

    return {
      nombre: body.nombre.trim(),
      documento: body.documento.trim(),
      email: body.email.trim(),
      telefono: body.telefono.trim(),
      ciudad: body.ciudad.trim(),
      direccion: body.direccion.trim(),
      cuenta_bancaria: body.cuenta.trim(),
      fecha_inicio_contrato: body.fechaInicioContrato,
      tipo_contrato: body.tipoContrato,
      salario: Math.round(salario),
      numero_contrato: body.numeroContrato.trim(),
      cargo: body.cargo.trim(),
      tipo_cotizante: body.tipoCotizante,
      fondo_salud: body.fondoSalud.trim(),
      fondo_pension: body.fondoPension.trim(),
      caja_compensacion: body.cajaCompensacion.trim(),
      arl: body.arl.trim(),
      nivel_riesgo_arl: body.nivelRiesgoArl.trim(),
    };
  }
}

module.exports = EmpleadoService;
