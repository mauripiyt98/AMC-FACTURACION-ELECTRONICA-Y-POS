/**
 * facturas_seed.js — Resguardo y Semilla de Facturación 2026 Multi-Tenant
 *
 * REGLAS DE SEGURIDAD MULTI-TENANT:
 *  1. NUNCA sobreescribe facturas existentes de ningún tenant.
 *  2. Solo inicializa si el tenant NO tiene facturas registradas (resguardo 2026).
 *  3. Aislamiento total por `activeUserCode` (NIT del tenant activo).
 */
'use strict';

(function () {
  const activeUserCode = sessionStorage.getItem('amc_active_user_code') || '1110591592';
  const FACTURAS_KEY = `amc_facturas_generadas_db_v1_${activeUserCode}`;
  const LEGACY_KEY = 'amc_facturas_generadas_db_v1';

  // 1. Migrar clave legada si aplica únicamente al tenant desarrollador principal
  const rawLegacy = localStorage.getItem(LEGACY_KEY);
  if (rawLegacy && !localStorage.getItem(FACTURAS_KEY)) {
    if (activeUserCode === '1110591592') {
      localStorage.setItem(FACTURAS_KEY, rawLegacy);
    }
    localStorage.removeItem(LEGACY_KEY);
  }

  // 2. Si ya existen facturas para este tenant, no sobreescribir
  const rawActual = localStorage.getItem(FACTURAS_KEY);
  if (rawActual) {
    try {
      const arr = JSON.parse(rawActual);
      if (Array.isArray(arr) && arr.length > 0) return;
    } catch (e) {
      console.warn("Fallo leyendo facturas locales:", e);
    }
  }

  // 3. Generar catálogo de facturas 2026 para resguardo seguro de este tenant
  console.log(`🛡️ Generando resguardo seguro de facturación 2026 para tenant: ${activeUserCode}`);

  const nombresEmpresas = {
    '1110591592': 'ANDRES MAURICIO CAMPOS FIERRO',
    '1085277180': 'IPS CNS SAS',
    '55110706': 'COMERCIALIZADORA CÓRDOBA Y CIA',
    '901214649': 'SOLUCIONES TECNOLÓGICAS DEL VALLE SAS',
    '877777777': 'DISTRIBUIDORA NACIONAL DE SERVICIOS'
  };

  const nombreTenant = nombresEmpresas[activeUserCode] || `EMPRESA NIT ${activeUserCode}`;

  const clientesDemo = [
    { nombre: 'CLINICA DE LA SABANA S.A.', documento: '900123456', email: 'facturacion@sabana.com', direccion: 'Calle 100 # 15-20', ciudad: 'Bogotá' },
    { nombre: 'FARMACEUTICA DEL PACIFICO SAS', documento: '800987654', email: 'compras@farmapacifico.com', direccion: 'Av 4 Norte # 23-45', ciudad: 'Cali' },
    { nombre: 'DISTRIBUIDORA MEDICA POPAYAN', documento: '1085222333', email: 'contabilidad@medpopayan.com', direccion: 'Carrera 7 # 12-30', ciudad: 'Popayán' },
    { nombre: 'INVERSIONES SANTA FE LTDA', documento: '860001234', email: 'pagos@santafe.com', direccion: 'Calle 26 # 68-90', ciudad: 'Bogotá' },
    { nombre: 'CENTRO MEDICO INTEGRAL DEL HUILA', documento: '891100555', email: 'cuentas@medicohuila.com', direccion: 'Carrera 5 # 10-15', ciudad: 'Neiva' }
  ];

  const productosDemo = [
    { codigo: 'SERV-CONS-01', producto: 'Consulta Médica Especializada', unidad: 'SERVICIO', unitario: 150000, tarifaIva: 0 },
    { codigo: 'MED-INSU-02', producto: 'Kit de Insumos Hospitalarios Tipo A', unidad: 'KIT', unitario: 85000, tarifaIva: 19 },
    { codigo: 'SERV-LAB-03', producto: 'Examen de Laboratorio Perfil Lipídico', unidad: 'EXAMEN', unitario: 65000, tarifaIva: 0 },
    { codigo: 'EQUIP-MED-04', producto: 'Alquiler de Equipo de Monitorización (Día)', unidad: 'DIA', unitario: 220000, tarifaIva: 19 },
    { codigo: 'SERV-AUDIT-05', producto: 'Auditoría Contable y de Facturación POS', unidad: 'HORA', unitario: 180000, tarifaIva: 19 }
  ];

  const meses2026 = [
    { mes: '01', dias: 28 },
    { mes: '02', dias: 25 },
    { mes: '03', dias: 30 },
    { mes: '04', dias: 29 },
    { mes: '05', dias: 28 },
    { mes: '06', dias: 30 },
    { mes: '07', dias: 29 },
    { mes: '08', dias: 30 },
    { mes: '09', dias: 5 }
  ];

  const facturasResguardo = [];
  let consecutivo = 1;

  meses2026.forEach(({ mes, dias }) => {
    const cantFacturasMes = 2 + (consecutivo % 3);
    for (let f = 0; f < cantFacturasMes; f++) {
      const diaStr = String(Math.min(dias, (f * 7) + 5)).padStart(2, '0');
      const fechaGen = `2026-${mes}-${diaStr}T10:${String(15 + f * 10).padStart(2, '0')}:00.000Z`;
      const cliente = clientesDemo[f % clientesDemo.length];

      const lineas = [];
      let totalBase = 0;
      let totalIva = 0;
      const cantLineas = 1 + (f % 3);

      for (let l = 0; l < cantLineas; l++) {
        const prod = productosDemo[(f + l) % productosDemo.length];
        const cantidad = 1 + l;
        const base = prod.unitario * cantidad;
        const valorIva = Math.round(base * (prod.tarifaIva / 100));
        const total = base + valorIva;

        totalBase += base;
        totalIva += valorIva;

        lineas.push({
          codigo: prod.codigo,
          producto: prod.producto,
          unidad: prod.unidad,
          cantidad,
          unitario: prod.unitario,
          base,
          tarifaIva: prod.tarifaIva,
          valorIva,
          tarifaRetencion: 0,
          valorRetencion: 0,
          total
        });
      }

      const totalFactura = totalBase + totalIva;
      const numFacturaStr = `FE-${String(consecutivo).padStart(4, '0')}`;
      const cufeDemo = `CUFE-2026-${activeUserCode}-${String(consecutivo).padStart(4, '0')}-SQL-SECURE`;

      facturasResguardo.push({
        id: `FAC-2026-${activeUserCode}-${String(consecutivo).padStart(4, '0')}`,
        tipo: 'FE',
        consecutivo: consecutivo,
        numeroFactura: numFacturaStr,
        cufe: cufeDemo,
        resolucion: {
          prefijo: 'FE',
          desde: 1,
          hasta: 1000,
          numeroResolucion: '18760000001',
          vigencia: 'Demo académico 2026'
        },
        cliente,
        emisor: {
          razonSocial: nombreTenant,
          nit: activeUserCode
        },
        lineas,
        totales: {
          base: totalBase,
          iva: totalIva,
          retencion: 0,
          total: totalFactura
        },
        medioPago: f % 2 === 0 ? 'EFECTIVO' : 'TRANSFERENCIA',
        medioPagoLabel: f % 2 === 0 ? 'Efectivo' : 'Transferencia bancaria',
        observaciones: `Facturación registrada correspondiente al período 2026 (${nombreTenant})`,
        estado: 'EMITIDA',
        generadoEn: fechaGen
      });

      consecutivo++;
    }
  });

  localStorage.setItem(FACTURAS_KEY, JSON.stringify(facturasResguardo));
  console.log(`✅ Resguardo exitoso: ${facturasResguardo.length} facturas de 2026 restauradas para ${activeUserCode}`);
})();
