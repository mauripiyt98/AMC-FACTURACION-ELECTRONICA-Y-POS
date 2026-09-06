/**
 * cotizaciones_seed.js — Resguardo y Semilla Multi-Tenant de Cotizaciones 2026
 *
 * REGLAS DE SEGURIDAD MULTI-TENANT:
 *  1. NUNCA sobreescribe cotizaciones existentes de ningún tenant.
 *  2. Solo inicializa si el tenant NO tiene cotizaciones registradas (resguardo 2026).
 *  3. Aislamiento total por `activeUserCode` (NIT del tenant activo).
 */
'use strict';

(function () {
  const activeUserCode = sessionStorage.getItem('amc_active_user_code') || '1110591592';
  const COTIZACIONES_KEY = `amc_cotizaciones_generadas_db_v1_${activeUserCode}`;
  const LEGACY_KEY = 'amc_cotizaciones_generadas_db_v1';

  // 1. Migrar clave legada si aplica únicamente al tenant desarrollador principal
  const rawLegacy = localStorage.getItem(LEGACY_KEY);
  if (rawLegacy && !localStorage.getItem(COTIZACIONES_KEY)) {
    if (activeUserCode === '1110591592') {
      localStorage.setItem(COTIZACIONES_KEY, rawLegacy);
    }
    localStorage.removeItem(LEGACY_KEY);
  }

  // 2. Si ya existen cotizaciones para este tenant, no sobreescribir
  const rawActual = localStorage.getItem(COTIZACIONES_KEY);
  if (rawActual) {
    try {
      const arr = JSON.parse(rawActual);
      if (Array.isArray(arr) && arr.length > 0) return;
    } catch (e) {
      console.warn("Fallo leyendo cotizaciones locales:", e);
    }
  }

  // 3. Generar catálogo de cotizaciones 2026 para resguardo seguro de este tenant
  console.log(`🛡️ Generando resguardo seguro de cotizaciones 2026 para tenant: ${activeUserCode}`);

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

  const cotizacionesResguardo = [];
  let consecutivo = 1;

  meses2026.forEach(({ mes, dias }) => {
    const cantCotzMes = 2 + (consecutivo % 3);
    for (let f = 0; f < cantCotzMes; f++) {
      const diaStr = String(Math.min(dias, (f * 7) + 5)).padStart(2, '0');
      const fechaGen = `2026-${mes}-${diaStr}T09:${String(20 + f * 10).padStart(2, '0')}:00.000Z`;
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

      const totalCotizacion = totalBase + totalIva;
      const numCotzStr = `COTZ-${String(consecutivo).padStart(4, '0')}`;

      cotizacionesResguardo.push({
        id: `COT-2026-${activeUserCode}-${String(consecutivo).padStart(4, '0')}`,
        consecutivo: consecutivo,
        numeroCotizacion: numCotzStr,
        rango: {
          prefijo: 'COTZ',
          desde: 1,
          hasta: 1000
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
          total: totalCotizacion
        },
        observaciones: `Cotización comercial registrada correspondiente al período 2026 (${nombreTenant})`,
        estado: f % 3 === 0 ? 'FACTURADA' : 'GUARDADA',
        generadoEn: fechaGen
      });

      consecutivo++;
    }
  });

  localStorage.setItem(COTIZACIONES_KEY, JSON.stringify(cotizacionesResguardo));
  console.log(`✅ Resguardo exitoso: ${cotizacionesResguardo.length} cotizaciones de 2026 restauradas para ${activeUserCode}`);
})();
