'use strict';

class CalendarioEvento {
  static async findRange(client, empresaId, { desde, hasta }) {
    const { rows } = await client.query(
      `SELECT * FROM calendario_eventos
       WHERE empresa_id = $1 AND fecha_inicio <= $3 AND COALESCE(fecha_fin, fecha_inicio) >= $2
       ORDER BY fecha_inicio ASC, hora_inicio ASC NULLS FIRST, creado_en ASC`,
      [empresaId, desde, hasta]
    );
    return rows;
  }

  static async upcoming(client, empresaId, limit) {
    const { rows } = await client.query(
      `SELECT * FROM calendario_eventos
       WHERE empresa_id = $1 AND estado = 'PENDIENTE' AND fecha_inicio >= CURRENT_DATE
       ORDER BY fecha_inicio ASC, hora_inicio ASC NULLS FIRST, creado_en ASC LIMIT $2`,
      [empresaId, limit]
    );
    return rows;
  }

  static async findById(client, empresaId, id) {
    const { rows } = await client.query('SELECT * FROM calendario_eventos WHERE id = $1 AND empresa_id = $2', [id, empresaId]);
    return rows[0] || null;
  }

  static async create(client, empresaId, data, usuarioId) {
    const { rows } = await client.query(
      `INSERT INTO calendario_eventos (empresa_id, titulo, descripcion, fecha_inicio, hora_inicio, fecha_fin, hora_fin, todo_el_dia, categoria, color, estado, recordatorio_dias, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [empresaId, data.titulo, data.descripcion, data.fecha_inicio, data.hora_inicio, data.fecha_fin, data.hora_fin, data.todo_el_dia, data.categoria, data.color, data.estado, data.recordatorio_dias, usuarioId]
    );
    return rows[0];
  }

  static async update(client, empresaId, id, data) {
    const { rows } = await client.query(
      `UPDATE calendario_eventos SET titulo=$3, descripcion=$4, fecha_inicio=$5, hora_inicio=$6, fecha_fin=$7, hora_fin=$8, todo_el_dia=$9, categoria=$10, color=$11, estado=$12, recordatorio_dias=$13, actualizado_en=NOW()
       WHERE id=$1 AND empresa_id=$2 RETURNING *`,
      [id, empresaId, data.titulo, data.descripcion, data.fecha_inicio, data.hora_inicio, data.fecha_fin, data.hora_fin, data.todo_el_dia, data.categoria, data.color, data.estado, data.recordatorio_dias]
    );
    return rows[0] || null;
  }

  static async remove(client, empresaId, id) {
    const { rowCount } = await client.query('DELETE FROM calendario_eventos WHERE id=$1 AND empresa_id=$2', [id, empresaId]);
    return rowCount > 0;
  }
}

module.exports = CalendarioEvento;
