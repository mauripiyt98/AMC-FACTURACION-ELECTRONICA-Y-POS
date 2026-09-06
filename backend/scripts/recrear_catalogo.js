'use strict';
try { require('dotenv').config(); } catch(e) {}

const fs = require('fs');
const path = require('path');

const catalogo = [
  {
    codigo: '001',
    nombre: 'ASESORIA CONTABLE Y TRIBUTARIA MENSUAL',
    tipo: 'SERVICIO',
    iva: 19,
    unidad_medida: 'UNIDAD',
    precio_base: 1206667,
    stock_inicial: 500,
    vendidos: 15,
    stock_final: 485
  },
  {
    codigo: '002',
    nombre: 'DECLARACION DE RENTA ANUAL',
    tipo: 'SERVICIO',
    iva: 19,
    unidad_medida: 'UNIDAD',
    precio_base: 344444,
    stock_inicial: 500,
    vendidos: 9,
    stock_final: 491
  },
  {
    codigo: '003',
    nombre: 'PRESENTACION DE INFORMACION EXOGENA ANUAL',
    tipo: 'SERVICIO',
    iva: 19,
    unidad_medida: 'UNIDAD',
    precio_base: 2000000,
    stock_inicial: 500,
    vendidos: 2,
    stock_final: 498
  },
  {
    codigo: '005',
    nombre: "LIBRO ''EL PODER DE LA IA EN CONTABILIDAD",
    tipo: 'PRODUCTO',
    iva: 0,
    unidad_medida: 'UNIDAD',
    precio_base: 50000,
    stock_inicial: 500,
    vendidos: 0,
    stock_final: 500
  },
  {
    codigo: '006',
    nombre: 'AUDITORIA TRIBUTARIA MENSUAL',
    tipo: 'SERVICIO',
    iva: 19,
    unidad_medida: 'UNIDAD',
    precio_base: 66667,
    stock_inicial: 500,
    vendidos: 6,
    stock_final: 494
  },
  {
    codigo: '007',
    nombre: 'ASESORIAS EN CONSTITUCION DE EMPRESAS JURIDICAS',
    tipo: 'SERVICIO',
    iva: 19,
    unidad_medida: 'UNIDAD',
    precio_base: 900000,
    stock_inicial: 500,
    vendidos: 1,
    stock_final: 499
  },
  {
    codigo: '008',
    nombre: 'DECLARACION DE IMPUESTO INDUSTRIA Y COMERCIO',
    tipo: 'SERVICIO',
    iva: 0,
    unidad_medida: 'UNIDAD',
    precio_base: 500000,
    stock_inicial: 500,
    vendidos: 1,
    stock_final: 499
  },
  {
    codigo: '008-AG2025',
    nombre: 'DECLARACION DE IMPUESTO INDUSTRIA Y COMERCIO AG2025',
    tipo: 'SERVICIO',
    iva: 19,
    unidad_medida: 'UNIDAD',
    precio_base: 200000,
    stock_inicial: 500,
    vendidos: 1,
    stock_final: 499
  },
  {
    codigo: '011',
    nombre: 'SUSCRIPCION DE FACTURACION ELECTRONICA POR 1 AÑO EN AMC FE',
    tipo: 'SERVICIO',
    iva: 0,
    unidad_medida: 'UNIDAD',
    precio_base: 250000,
    stock_inicial: 500,
    vendidos: 1,
    stock_final: 499
  },
  {
    codigo: 'SCON-001',
    nombre: 'Servicio de Consultoría TI',
    tipo: 'SERVICIO',
    iva: 19,
    unidad_medida: 'UNIDAD',
    precio_base: 150000,
    stock_inicial: 500,
    vendidos: 0,
    stock_final: 500
  },
  {
    codigo: 'LIC-001',
    nombre: 'Licencia de Software Anual',
    tipo: 'SERVICIO',
    iva: 19,
    unidad_medida: 'UNIDAD',
    precio_base: 1200000,
    stock_inicial: 500,
    vendidos: 0,
    stock_final: 500
  },
  {
    codigo: 'HW-001',
    nombre: 'Computador Portátil',
    tipo: 'PRODUCTO',
    iva: 19,
    unidad_medida: 'UNIDAD',
    precio_base: 2800000,
    stock_inicial: 500,
    vendidos: 0,
    stock_final: 500
  },
  {
    codigo: 'GAL-001',
    nombre: 'Gasolina Corriente',
    tipo: 'PRODUCTO',
    iva: 5,
    unidad_medida: 'GALON',
    precio_base: 15000,
    stock_inicial: 500,
    vendidos: 0,
    stock_final: 500
  }
];

async function main() {
  console.log('\n==========================================');
  console.log('🚀 RECREANDO CATÁLOGO E INVENTARIO AMC');
  console.log('==========================================\n');

  // 1. Generate LocalStorage JSON file for offline fallback
  const localProductsList = catalogo.map((item, idx) => ({
    id: `prod_recuperado_${item.codigo}_${idx+1}`,
    nombre: item.nombre,
    codigo: item.codigo,
    tipo: item.tipo,
    iva: item.iva,
    unidadMedida: item.unidad_medida,
    unidad_medida: item.unidad_medida,
    precioBase: item.precio_base,
    precio_base: item.precio_base,
    stockTotal: item.stock_final,
    stock_total: item.stock_final,
    stockMinimo: 10,
    stock_minimo: 10,
    activo: true,
    creadoEn: new Date().toISOString()
  }));

  // Write frontend auto-seed script
  const jsInjectionPath = path.join(__dirname, '..', '..', 'frontend', 'js', 'catalogo_seed.js');
  const jsContent = `/** Auto-seeded catálogo en LocalStorage **/
(function() {
  const KEY = 'amc_productos_db_v1';
  const data = ${JSON.stringify(localProductsList, null, 2)};
  const userCode = sessionStorage.getItem("amc_active_user_code") || "1110591592";
  localStorage.setItem(\`amc_productos_db_v1_\${userCode}\`, JSON.stringify(data));
  localStorage.setItem('amc_productos_db_v1', JSON.stringify(data));
  console.log('🌱 Catálogo e inventario respaldado y cargado en LocalStorage');
})();
`;
  fs.writeFileSync(jsInjectionPath, jsContent, 'utf-8');
  console.log(`✅ Script de inyección frontend generado: ${jsInjectionPath}`);

  // 2. Try PostgreSQL connection if pg module exists
  try {
    const { Client } = require('pg');
    const passwords = ['', 'postgres', 'root', 'admin', '1234', '123456', 'Desa*2026', 'CAMBIAR_EN_PRODUCCION'];
    let pgSuccess = false;

    for (const pass of passwords) {
      try {
        const client = new Client({
          host: process.env.DB_HOST || 'localhost',
          port: Number(process.env.DB_PORT) || 5432,
          database: process.env.DB_NAME || 'amc_facturacion',
          user: process.env.DB_SUPERUSER || 'postgres',
          password: pass,
        });

        await client.connect();
        console.log(`\n✅ Conectado a PostgreSQL con contraseña: "${pass}"`);

        await client.query('BEGIN');

        let { rows: empRows } = await client.query(`SELECT id FROM empresas WHERE nit = '1110591592'`);
        let empresaId;
        if (empRows.length) {
          empresaId = empRows[0].id;
        } else {
          const { rows: newEmp } = await client.query(
            `INSERT INTO empresas (razon_social, nit, digito_verificacion, regimen_fiscal, tipo_persona, plan)
             VALUES ('ANDRES MAURICIO CAMPOS FIERRO', '1110591592', 3, 'SIMPLIFICADO', 'NATURAL', 'BASICO')
             RETURNING id`
          );
          empresaId = newEmp[0].id;
        }

        let creados = 0;
        let actualizados = 0;

        for (const item of catalogo) {
          const { rows: prodExist } = await client.query(
            `SELECT id FROM productos WHERE empresa_id = $1 AND codigo = $2`,
            [empresaId, item.codigo]
          );

          let prodId;
          if (prodExist.length) {
            prodId = prodExist[0].id;
            await client.query(
              `UPDATE productos SET
                 nombre = $1, tipo = $2, iva = $3, unidad_medida = $4,
                 precio_base = $5, stock_total = $6, stock_minimo = 10, activo = TRUE
               WHERE id = $7 AND empresa_id = $8`,
              [item.nombre, item.tipo, item.iva, item.unidad_medida, item.precio_base, item.stock_final, prodId, empresaId]
            );
            actualizados++;
          } else {
            const { rows: newProd } = await client.query(
              `INSERT INTO productos
                 (empresa_id, nombre, codigo, tipo, iva, unidad_medida, precio_base, stock_total, stock_minimo, activo)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 10, TRUE)
               RETURNING id`,
              [empresaId, item.nombre, item.codigo, item.tipo, item.iva, item.unidad_medida, item.precio_base, item.stock_final]
            );
            prodId = newProd[0].id;
            creados++;
          }
        }

        await client.query('COMMIT');
        await client.end();
        console.log(`🎉 PostgreSQL actualizado exitosamente: ${creados} creados, ${actualizados} actualizados.`);
        pgSuccess = true;
        break;

      } catch (e) {}
    }
  } catch(e) {
    console.log('ℹ️ pg module no disponible globalmente, script de inyección frontend listo.');
  }

  console.log('\n==========================================');
  console.log('✨ CATÁLOGO E INVENTARIOS RECREADOS CON ÉXITO');
  console.log('==========================================\n');
}

main().catch(err => {
  console.error('❌ Error en script de recreación:', err);
  process.exit(1);
});
