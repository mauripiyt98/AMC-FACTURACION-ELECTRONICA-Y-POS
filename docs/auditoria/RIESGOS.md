# Riesgos y decisiones pendientes

**Corte:** 25 de septiembre de 2026. Severidad orientativa basada en código; debe contrastarse con configuración y datos reales antes de cambiar producción.

## Prioridad alta

### R1 — Login y revocación pueden colisionar con RLS

`backend/db/migrations/002_rls_policies.sql` activa y fuerza RLS para `usuarios` y `sesiones_jwt`. Las políticas exigen `empresa_id = current_empresa_id()`. Sin embargo, `UsuarioService.login()` consulta `usuarios` y crea la sesión a través de `pool.query()` antes de que exista un contexto tenant; `authMiddleware` también busca el `jti` en `sesiones_jwt` con la consulta global. El pool usa `DB_USER` o `amc_app` por defecto. Si se ejecuta con ese rol y las políticas descritas, estas operaciones sin contexto no satisfacen la política. **Probar con la configuración real antes de afirmar el comportamiento en producción.**

**Acción:** diseñar un acceso de autenticación mínimo y aislado (rol/procedimiento con privilegios estrictos o contexto tenant seguro); añadir pruebas de login, `/me`, revocación y aislamiento antes de refactorizar.

### R2 — Secretos de ejemplo deben fallar de forma segura

El backend define un valor JWT de reserva en código y la migración de RLS contiene una contraseña de rol de aplicación de placeholder. La aplicación no debería iniciar en producción si quedan valores de ejemplo, ni el rol DB debería conservar credenciales conocidas.

**Acción:** validación de arranque que rechace defaults, rotación de credenciales y almacenamiento externo seguro. No se inspeccionó `.env`.

### R3 — Verificación TLS PostgreSQL desactivada en producción

`backend/db/pool.js` y el runner de migraciones configuran `rejectUnauthorized: false` cuando `NODE_ENV=production`. Esto cifra el transporte, pero no valida la identidad del certificado del servidor.

**Acción:** usar CA/certificado configurado y validación estricta, o documentar la excepción del proveedor y su compensación.

## Prioridad media

### R4 — Capas incompletas

Las rutas contienen handlers y dos consultas SQL directas; `UsuarioService` y `EmpresaService` también consultan PostgreSQL directamente. Los modelos son la principal capa SQL, pero no hay repositorios uniformes. El cambio debe ser incremental para preservar transacciones, contratos y rutas.

### R5 — Falta una red automatizada de regresión

No existe `backend/tests/`, pese a que `package.json` anuncia un comando `test`. No se encontró suite de integración frontend/API ni pipeline CI. En un ERP con facturación, nómina e inventario, mover carpetas sin pruebas eleva el riesgo de pérdida o corrupción de datos.

### R6 — Backups no cubren los objetivos solicitados

El backup existente es completo a nivel de base de datos; no hay exportación/restauración aislada por empresa o módulo, cifrado aplicado desde el script ni scheduler implementado en el repositorio. La documentación recomienda BitLocker o almacenamiento externo cifrado y programación operativa. Un restore drill está previsto mediante script, pero no se ejecutó en esta auditoría.

### R7 — Integración DIAN/XML todavía demostrativa

Las rutinas de CUFE están identificadas en código como demostrativas; el CUDE de nómina se calcula mediante SHA-256 sobre una cadena propia, lo cual no acredita cumplimiento del algoritmo oficial. No se encontraron builder UBL, firmado digital, validación XML ni adaptador de proveedor tecnológico en backend. El nombre “electrónica” del módulo no acredita transmisión/aceptación real por DIAN.

### R8 — Validación y autorización no son uniformes

Existe un middleware común de validación y autorización por roles `ADMIN`, `SUPERADMIN` y `OPERADOR`; hay módulos que no lo aplican de forma consistente a todos los cuerpos/operaciones. No se encontró motor de permisos granulares por módulo ni middleware general de sanitización HTML.

### R9 — Migraciones no son atómicas de forma uniforme

El runner ejecuta cada archivo SQL y registra su resultado, pero no envuelve automáticamente cada migración en una transacción. La migración 008 sí contiene transacción explícita; las demás no son uniformes. Una falla a mitad de archivo puede dejar cambios parciales que deben revisarse antes de reintentar.

### R10 — Documentación de entrada desactualizada

El `README.md` raíz solo describe un liquidador de nómina; no explica cómo iniciar frontend/API, configurar base de datos, ejecutar migraciones ni qué módulos funcionan con PostgreSQL.

## Límites de esta auditoría

- Sin conexión a PostgreSQL: no se verificó qué migraciones corrieron, tablas reales, rol efectivo, políticas instaladas, índices, conteos ni rendimiento.
- Sin pruebas ejecutadas: `backend/tests/` no aparece en el repositorio.
- No se leyeron archivos `.env` ni secretos.
- No se certifican dependencias circulares, código muerto ni duplicidad exacta con herramientas estáticas especializadas.
- La auditoría no cambió código de negocio, datos ni esquema.
