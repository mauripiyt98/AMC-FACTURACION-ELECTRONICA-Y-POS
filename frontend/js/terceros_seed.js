/**
 * terceros_seed.js — Resguardo y Semilla Multi-Tenant de Clientes (Terceros)
 *
 * REGLAS DE SEGURIDAD MULTI-TENANT:
 *  1. NUNCA sobreescribe clientes existentes de ningún tenant.
 *  2. Solo inicializa/fusiona si faltan clientes en el catálogo local (`amc_terceros_db_v1_<userCode>`).
 *  3. Extrae automáticamente cualquier cliente facturado previamente en la cuenta.
 */
'use strict';

(function () {
  const activeUserCode = sessionStorage.getItem('amc_active_user_code') || '1110591592';
  const TERCEROS_KEY = `amc_terceros_db_v1_${activeUserCode}`;
  const FACTURAS_KEY = `amc_facturas_generadas_db_v1_${activeUserCode}`;
  const LEGACY_KEY = 'amc_terceros_db_v1';

  // 1. Migrar clave legada global si aplica únicamente al usuario principal desarrollador
  const rawLegacy = localStorage.getItem(LEGACY_KEY);
  if (rawLegacy && !localStorage.getItem(TERCEROS_KEY)) {
    if (activeUserCode === '1110591592') {
      localStorage.setItem(TERCEROS_KEY, rawLegacy);
    }
    localStorage.removeItem(LEGACY_KEY);
  }

  // Catálogos recuperados por tenant
  const CATALOGOS_BASE = {
    '1110591592': [
      { id: 'TER-1110591592-001', nombre: 'CLINICA DE LA SABANA S.A.', documento: '900123456', tipo_documento: 'NIT', email: 'facturacion@sabana.com', telefono: '6013004050', direccion: 'Calle 100 # 15-20', ciudad: 'Bogotá' },
      { id: 'TER-1110591592-002', nombre: 'FARMACEUTICA DEL PACIFICO SAS', documento: '800987654', tipo_documento: 'NIT', email: 'compras@farmapacifico.com', telefono: '6026601122', direccion: 'Av 4 Norte # 23-45', ciudad: 'Cali' },
      { id: 'TER-1110591592-003', nombre: 'DISTRIBUIDORA MEDICA POPAYAN', documento: '1085222333', tipo_documento: 'NIT', email: 'contabilidad@medpopayan.com', telefono: '6028234455', direccion: 'Carrera 7 # 12-30', ciudad: 'Popayán' },
      { id: 'TER-1110591592-004', nombre: 'INVERSIONES SANTA FE LTDA', documento: '860001234', tipo_documento: 'NIT', email: 'pagos@santafe.com', telefono: '6015558899', direccion: 'Calle 26 # 68-90', ciudad: 'Bogotá' },
      { id: 'TER-1110591592-005', nombre: 'CENTRO MEDICO INTEGRAL DEL HUILA', documento: '891100555', tipo_documento: 'NIT', email: 'cuentas@medicohuila.com', telefono: '6088712233', direccion: 'Carrera 5 # 10-15', ciudad: 'Neiva' },
      { id: 'TER-1110591592-006', nombre: 'CARLOS ALBERTO GÓMEZ ROJAS', documento: '79844512', tipo_documento: 'CC', email: 'carlos.gomez@gmail.com', telefono: '3104558877', direccion: 'Calle 45 # 12-08', ciudad: 'Bogotá' },
      { id: 'TER-1110591592-007', nombre: 'MARÍA FERNANDA VALENCIA RÍOS', documento: '52411890', tipo_documento: 'CC', email: 'mfvalencia@hotmail.com', telefono: '3157891234', direccion: 'Carrera 15 # 88-40', ciudad: 'Bogotá' }
    ],
    '1085277180': [
      { id: 'TER-1085277180-001', nombre: 'IPS SALUD INTEGRAL DE NARIÑO S.A.S.', documento: '901455888', tipo_documento: 'NIT', email: 'gerencia@saludnarino.com', telefono: '6027239900', direccion: 'Calle 18 # 24-30', ciudad: 'Pasto' },
      { id: 'TER-1085277180-002', nombre: 'FUNDACIÓN MEDICA DEL SUR', documento: '810005444', tipo_documento: 'NIT', email: 'administracion@fundacionsur.org', telefono: '6027311223', direccion: 'Carrera 27 # 14-50', ciudad: 'Pasto' },
      { id: 'TER-1085277180-003', nombre: 'CENTRO RADIOLÓGICO Y DIAGNÓSTICO IPS', documento: '900777123', tipo_documento: 'NIT', email: 'facturacion@radiologiaips.com', telefono: '6027204567', direccion: 'Calle 20 # 29-15', ciudad: 'Pasto' },
      { id: 'TER-1085277180-004', nombre: 'CLINICA ESPECIALIZADA LOS ANDES', documento: '800456123', tipo_documento: 'NIT', email: 'contabilidad@losandesips.com', telefono: '6027339876', direccion: 'Carrera 30 # 18-05', ciudad: 'Pasto' },
      { id: 'TER-1085277180-005', nombre: 'JORGE ENRIQUE BENAVIDES ORTIZ', documento: '12988455', tipo_documento: 'CC', email: 'jorge.benavides@gmail.com', telefono: '3124567890', direccion: 'Calle 12 # 22-44', ciudad: 'Pasto' }
    ],
    '55110706': [
      { id: 'TER-55110706-001', nombre: 'DISTRIBUIDORA DE ALIMENTOS Y ABARROTES CÓRDOBA', documento: '800111222', tipo_documento: 'NIT', email: 'compras@alimentoscordoba.com', telefono: '6047821100', direccion: 'Calle 40 # 5-12', ciudad: 'Montería' },
      { id: 'TER-55110706-002', nombre: 'SUPERMERCADO Y SERVICIOS EL SINÚ LTDA', documento: '891000333', tipo_documento: 'NIT', email: 'facturas@elsinu.com', telefono: '6047814455', direccion: 'Carrera 3 # 28-50', ciudad: 'Montería' },
      { id: 'TER-55110706-003', nombre: 'COMERCIALIZADORA DEL CARIBE S.A.S.', documento: '901222444', tipo_documento: 'NIT', email: 'admin@comercializadoracaribe.com', telefono: '6053509988', direccion: 'Via 40 # 73-290', ciudad: 'Barranquilla' },
      { id: 'TER-55110706-004', nombre: 'LUIS FERNANDO PÉREZ MORALES', documento: '15044890', tipo_documento: 'CC', email: 'luis.perez@yahoo.es', telefono: '3189001122', direccion: 'Calle 24 # 8-30', ciudad: 'Montería' }
    ],
    '901214649': [
      { id: 'TER-901214649-001', nombre: 'TECNOLOGÍA Y SISTEMAS EMPRESARIALES SAS', documento: '900888999', tipo_documento: 'NIT', email: 'sistemas@tecnosistemas.com', telefono: '6025541122', direccion: 'Calle 5 # 38-25', ciudad: 'Cali' },
      { id: 'TER-901214649-002', nombre: 'SOLUCIONES DIGITALES DEL PACÍFICO', documento: '901333555', tipo_documento: 'NIT', email: 'contacto@sdpacifico.com', telefono: '6026658899', direccion: 'Av 6N # 18-30', ciudad: 'Cali' },
      { id: 'TER-901214649-003', nombre: 'CONSULTORÍA IT Y SOFTWARE COLOMBIA', documento: '830555666', tipo_documento: 'NIT', email: 'finanzas@itconsultoria.co', telefono: '6017445566', direccion: 'Carrera 11 # 93-50', ciudad: 'Bogotá' },
      { id: 'TER-901214649-004', nombre: 'ANDREA CAROLINA MENDOZA CASTRO', documento: '1144089900', tipo_documento: 'CC', email: 'andrea.mendoza@outlook.com', telefono: '3168904455', direccion: 'Calle 14N # 9-40', ciudad: 'Cali' }
    ],
    '877777777': [
      { id: 'TER-877777777-001', nombre: 'DISTRIBUIDORA NACIONAL DE INSUMOS GENERALES', documento: '800555777', tipo_documento: 'NIT', email: 'ventas@distribuidoranacional.com', telefono: '6014008899', direccion: 'Calle 13 # 42-10', ciudad: 'Bogotá' },
      { id: 'TER-877777777-002', nombre: 'LOGÍSTICA Y TRANSPORTES DE COLOMBIA SAS', documento: '900999000', tipo_documento: 'NIT', email: 'operaciones@logisticacolombia.com', telefono: '6015001122', direccion: 'Autopista Sur # 65-20', ciudad: 'Bogotá' },
      { id: 'TER-877777777-003', nombre: 'ALFREDO RUIZ SÁNCHEZ', documento: '19455890', tipo_documento: 'CC', email: 'alfredo.ruiz@gmail.com', telefono: '3112223344', direccion: 'Carrera 50 # 80-15', ciudad: 'Bogotá' }
    ]
  };

  // Cargar clientes existentes
  let clientesExistentes = [];
  try {
    const raw = localStorage.getItem(TERCEROS_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) clientesExistentes = arr;
    }
  } catch (e) {
    clientesExistentes = [];
  }

  const mapaDocumentos = new Map();
  clientesExistentes.forEach(c => {
    if (c && c.documento) {
      mapaDocumentos.set(String(c.documento).trim().toLowerCase(), c);
    }
  });

  // 2. Extraer clientes desde las facturas emitidas por el tenant
  try {
    const rawFacturas = localStorage.getItem(FACTURAS_KEY);
    if (rawFacturas) {
      const facturas = JSON.parse(rawFacturas);
      if (Array.isArray(facturas)) {
        facturas.forEach(f => {
          const cli = f.cliente || f.tercero;
          if (cli && cli.documento && cli.nombre) {
            const docKey = String(cli.documento).trim().toLowerCase();
            if (!mapaDocumentos.has(docKey)) {
              const nuevoTercero = {
                id: `TER-FACT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6)}`,
                nombre: String(cli.nombre).trim(),
                documento: String(cli.documento).trim(),
                tipo_documento: cli.tipo_documento || 'CC',
                email: cli.email || '',
                telefono: cli.telefono || '',
                direccion: cli.direccion || '',
                ciudad: cli.ciudad || ''
              };
              mapaDocumentos.set(docKey, nuevoTercero);
            }
          }
        });
      }
    }
  } catch (errFact) {
    console.warn("Fallo extrayendo terceros desde facturas:", errFact);
  }

  // 3. Fusionar con el catálogo base de este tenant
  const baseTenant = CATALOGOS_BASE[activeUserCode] || CATALOGOS_BASE['1110591592'];
  baseTenant.forEach(cliBase => {
    const docKey = String(cliBase.documento).trim().toLowerCase();
    if (!mapaDocumentos.has(docKey)) {
      mapaDocumentos.set(docKey, cliBase);
    }
  });

  // Guardar catálogo consolidado
  const clientesFinales = Array.from(mapaDocumentos.values()).sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  localStorage.setItem(TERCEROS_KEY, JSON.stringify(clientesFinales));
  console.log(`✅ Catálogo de clientes (terceros) resguardado: ${clientesFinales.length} clientes para tenant ${activeUserCode}`);
})();
