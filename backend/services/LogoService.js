'use strict';

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');
const { AppError } = require('../utils/errors');

const MAX_SIDE = 512;
const uploadsRoot = path.resolve(process.env.UPLOADS_DIR || path.join(__dirname, '..', 'data', 'uploads'));
const logosRoot = path.join(uploadsRoot, 'logos');
const publicPath = ('/' + (process.env.MEDIA_PUBLIC_PATH || '/media')).replace(/\/+/g, '/').replace(/\/$/, '');

function invalidImage(message) {
  const error = new AppError(message, 400, 'INVALID_LOGO');
  return error;
}

function logoFileName(empresaId) {
  // empresaId es un UUID emitido por PostgreSQL; se conserva esta validación para
  // que nunca pueda convertirse en una ruta proporcionada por el cliente.
  if (!/^[0-9a-f-]{36}$/i.test(String(empresaId))) throw invalidImage('Empresa inválida para almacenar el logo');
  return `${empresaId}.png`;
}

class LogoService {
  static get uploadsRoot() { return uploadsRoot; }
  static get publicPath() { return publicPath; }

  static async normalizar(buffer) {
    let metadata;
    try {
      metadata = await sharp(buffer, { animated: false, failOn: 'error' }).metadata();
    } catch {
      throw invalidImage('El archivo no es una imagen PNG, JPG o GIF válida');
    }

    if (!['png', 'jpeg', 'gif'].includes(metadata.format)) {
      throw invalidImage('Solo se permiten imágenes PNG, JPG o GIF');
    }
    if (!metadata.width || !metadata.height || metadata.width > 12000 || metadata.height > 12000) {
      throw invalidImage('La imagen tiene dimensiones no permitidas');
    }

    // Todo logo se convierte a PNG, corrige orientación EXIF y limita su tamaño.
    return sharp(buffer, { animated: false, failOn: 'error' })
      .rotate()
      .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();
  }

  static async guardar(empresaId, buffer) {
    const normalized = await this.normalizar(buffer);
    await fs.mkdir(logosRoot, { recursive: true });

    const name = logoFileName(empresaId);
    const destination = path.join(logosRoot, name);
    const temporary = path.join(logosRoot, `.${name}.${crypto.randomUUID()}.tmp`);
    await fs.writeFile(temporary, normalized, { flag: 'wx', mode: 0o640 });
    try {
      // rename es atómico en el mismo volumen: los lectores ven el logo anterior
      // o el nuevo, nunca un archivo parcialmente escrito.
      await fs.rename(temporary, destination);
    } finally {
      await fs.rm(temporary, { force: true }).catch(() => {});
    }
    return `${publicPath}/logos/${name}`;
  }

  static async eliminar(empresaId) {
    const destination = path.join(logosRoot, logoFileName(empresaId));
    await fs.rm(destination, { force: true });
  }
}

module.exports = LogoService;
