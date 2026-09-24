'use strict';

const CalendarioEvento = require('../models/CalendarioEvento');
const { NotFoundError, ValidationError } = require('../utils/errors');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CATEGORIAS = ['IMPUESTO', 'NOMINA', 'COBRO', 'REUNION', 'TAREA', 'GENERAL'];
const ESTADOS = ['PENDIENTE', 'COMPLETADO', 'CANCELADO'];

class CalendarioService {
  static listar(client, empresaId, { desde, hasta }) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde || '') || !/^\d{4}-\d{2}-\d{2}$/.test(hasta || '')) throw new ValidationError('Rango de fechas inválido');
    return CalendarioEvento.findRange(client, empresaId, { desde, hasta });
  }
  static proximos(client, empresaId, limit) { return CalendarioEvento.upcoming(client, empresaId, Math.min(Math.max(Number(limit) || 3, 1), 10)); }
  static async crear(client, empresaId, body, userId) { return CalendarioEvento.create(client, empresaId, this.normalizar(body), userId); }
  static async actualizar(client, empresaId, id, body) { this.validarId(id); const event = await CalendarioEvento.update(client, empresaId, id, this.normalizar(body)); if (!event) throw new NotFoundError('Evento'); return event; }
  static async eliminar(client, empresaId, id) { this.validarId(id); if (!await CalendarioEvento.remove(client, empresaId, id)) throw new NotFoundError('Evento'); }
  static validarId(id) { if (!UUID.test(id)) throw new NotFoundError('Evento'); }
  static normalizar(body) {
    const titulo = String(body.titulo || '').trim();
    const fecha = String(body.fecha_inicio || '');
    if (titulo.length < 3 || titulo.length > 160) throw new ValidationError('El título debe tener entre 3 y 160 caracteres');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new ValidationError('La fecha de inicio es obligatoria');
    const fechaFin = body.fecha_fin ? String(body.fecha_fin) : null;
    if (fechaFin && (!/^\d{4}-\d{2}-\d{2}$/.test(fechaFin) || fechaFin < fecha)) throw new ValidationError('La fecha final no es válida');
    const categoria = String(body.categoria || 'GENERAL').toUpperCase();
    const estado = String(body.estado || 'PENDIENTE').toUpperCase();
    if (!CATEGORIAS.includes(categoria) || !ESTADOS.includes(estado)) throw new ValidationError('Categoría o estado inválido');
    const color = /^#[0-9a-f]{6}$/i.test(body.color || '') ? body.color : '#0b46eb';
    const reminder = body.recordatorio_dias === '' || body.recordatorio_dias == null ? null : Number(body.recordatorio_dias);
    if (reminder != null && (!Number.isInteger(reminder) || reminder < 0 || reminder > 365)) throw new ValidationError('El recordatorio debe estar entre 0 y 365 días');
    return { titulo, descripcion: String(body.descripcion || '').trim() || null, fecha_inicio: fecha, hora_inicio: body.todo_el_dia ? null : (body.hora_inicio || null), fecha_fin: fechaFin, hora_fin: body.todo_el_dia ? null : (body.hora_fin || null), todo_el_dia: Boolean(body.todo_el_dia), categoria, color, estado, recordatorio_dias: reminder };
  }
}
module.exports = CalendarioService;
