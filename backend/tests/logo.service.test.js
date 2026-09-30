'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const LogoService = require('../services/LogoService');

test('normaliza un PNG auténtico a PNG de máximo 512 píxeles', async () => {
  const source = await sharp({
    create: { width: 900, height: 600, channels: 4, background: '#0b46eb' },
  }).png().toBuffer();

  const normalized = await LogoService.normalizar(source);
  const metadata = await sharp(normalized).metadata();
  assert.equal(metadata.format, 'png');
  assert.ok(metadata.width <= 512);
  assert.ok(metadata.height <= 512);
});

test('rechaza contenido que no sea una imagen válida aunque se presente como archivo', async () => {
  await assert.rejects(
    () => LogoService.normalizar(Buffer.from('esto no es una imagen')),
    { code: 'INVALID_LOGO' }
  );
});
