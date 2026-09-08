'use strict';

const router = require('express').Router();
const { authMiddleware, requireRole } = require('../middleware/auth');
const { tenantMiddleware } = require('../middleware/tenant');

router.use(authMiddleware, tenantMiddleware, requireRole('ADMIN', 'SUPERADMIN'));

// Consulta de solo lectura para investigar cambios o preparar una recuperación
// selectiva. Los datos históricos no se exponen a operadores.
router.get('/', async (req, res, next) => {
  try {
    const allowedTables = new Set([
      'terceros', 'productos', 'facturas', 'lineas_factura',
      'cotizaciones', 'lineas_cotizacion', 'nominas_electronicas',
      'inventario_movimientos',
    ]);
    const table = String(req.query.tabla || '').trim();
    if (table && !allowedTables.has(table)) {
      return res.status(400).json({ success: false, message: 'Tabla de auditoría no permitida.' });
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    const params = [req.empresaId];
    let where = 'WHERE empresa_id = $1';
    if (table) { params.push(table); where += ` AND tabla = $${params.length}`; }
    if (req.query.registroId) { params.push(String(req.query.registroId)); where += ` AND registro_id = $${params.length}::uuid`; }
    params.push(limit, offset);
    const { rows } = await req.dbClient.query(
      `SELECT id, ocurrido_en, actor_usuario_id, actor_rol, tabla, operacion,
              registro_id, datos_anteriores, datos_nuevos, transaccion_id
       FROM auditoria_eventos ${where}
       ORDER BY ocurrido_en DESC, id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ success: true, eventos: rows, pagination: { limit, offset, hasMore: rows.length === limit } });
  } catch (error) { next(error); }
});

module.exports = router;
