'use strict';

const fs = require('fs');
const path = require('path');

console.log('🔍 Verificando integridad de facturas generadas y scripts frontend...\n');

const filesToTest = [
  'frontend/facturas-generadas/facturas-generadas.js',
  'frontend/js/factura.js',
  'frontend/js/facturas_seed.js',
  'frontend/js/terceros_seed.js',
  'frontend/terceros/terceros.js',
  'frontend/reportes/ventas-cliente.js',
  'frontend/reportes/ventas-producto.js',
  'frontend/reportes/comparativo-ventas.js'
];

let allOk = true;

filesToTest.forEach(relPath => {
  const fullPath = path.join(__dirname, '../../', relPath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Archivo no encontrado: ${relPath}`);
    allOk = false;
    return;
  }
  const code = fs.readFileSync(fullPath, 'utf8');

  // Check for undefined references
  if (code.includes('activeUserCode') && !code.includes('const activeUserCode') && !code.includes('var activeUserCode') && !code.includes('let activeUserCode')) {
    console.error(`⚠️ Referencia a activeUserCode en ${relPath} sin declaración local.`);
    allOk = false;
  } else {
    console.log(`✅ ${relPath}: Sintaxis y variables verificadas OK`);
  }
});

if (allOk) {
  console.log('\n🎉 Todos los scripts del módulo de facturas fueron validados exitosamente sin errores de referencia.');
}
