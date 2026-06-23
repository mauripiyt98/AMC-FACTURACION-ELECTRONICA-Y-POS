'use strict';

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const ROUNDS = Number(process.env.BCRYPT_ROUNDS) || 12;

/**
 * Genera un hash bcrypt de una contraseña en texto plano.
 */
async function hashPassword(plainText) {
  return bcrypt.hash(plainText, ROUNDS);
}

/**
 * Compara una contraseña en texto plano con su hash almacenado.
 */
async function comparePassword(plainText, hash) {
  return bcrypt.compare(plainText, hash);
}

/**
 * Genera un UUID v4 único (usado como JTI en JWT y como IDs).
 */
function generateJti() {
  return uuidv4();
}

/**
 * Normaliza texto para comparaciones: minúsculas, sin tildes, sin espacios extra.
 */
function normalizeText(str) {
  return String(str || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

module.exports = { hashPassword, comparePassword, generateJti, normalizeText };
