'use strict';
require('dotenv').config();

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const rateLimit  = require('express-rate-limit');

const { errorHandler, notFound } = require('./middleware/errorHandler');

// ── Rutas ────────────────────────────────────────────────
const authRoutes     = require('./routes/auth.routes');
const empresasRoutes = require('./routes/empresas.routes');
const tercerosRoutes = require('./routes/terceros.routes');
const productosRoutes = require('./routes/productos.routes');
const facturasRoutes  = require('./routes/facturas.routes');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Seguridad HTTP headers ───────────────────────────────
app.use(helmet());

// ── CORS ─────────────────────────────────────────────────
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin(origin, callback) {
    // Permitir requests sin origin (Postman, curl, etc.) en desarrollo
    if (!origin || process.env.NODE_ENV === 'development') return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origen no permitido — ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Empresa-ID'],
}));

// ── Body parsing ─────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// ── Rate limiting global ──────────────────────────────────
const globalLimiter = rateLimit({
  windowMs : Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max      : Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders  : false,
  message: { error: 'Demasiadas solicitudes. Intente de nuevo más tarde.' },
});
app.use('/api/', globalLimiter);

// ── Rate limiting más estricto en auth ───────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max     : Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  message : { error: 'Demasiados intentos de autenticación. Espere 15 minutos.' },
});
app.use('/api/auth/', authLimiter);

// ── Health check ─────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '1.0.0' });
});

// ── Rutas de la aplicación ───────────────────────────────
app.use('/api/auth',      authRoutes);
app.use('/api/empresas',  empresasRoutes);
app.use('/api/terceros',  tercerosRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/facturas',  facturasRoutes);

// ── Manejo de rutas no encontradas y errores ─────────────
app.use(notFound);
app.use(errorHandler);

// ── Iniciar servidor ─────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 AMC Backend — Multi-Tenant`);
  console.log(`   Entorno : ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Puerto  : ${PORT}`);
  console.log(`   API     : http://localhost:${PORT}/api\n`);
});

module.exports = app; // Para tests
