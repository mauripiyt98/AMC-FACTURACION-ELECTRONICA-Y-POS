# Módulos existentes

**Corte:** 25 de septiembre de 2026. Catálogo derivado de las 32 páginas HTML, routers, servicios, modelos y migraciones del repositorio; que exista una pantalla no implica que tenga API PostgreSQL.

## Frontend

| Módulo visible | Archivos/páginas representativos | API/backend encontrado |
| --- | --- | --- |
| Inicio, indicadores y navegación | `frontend/index.html`, `frontend/js/app.js`, `frontend/js/app-footer.js` | Widgets consultan API cuando está disponible; parte del comportamiento conserva modo local. |
| Login y perfil/usuarios | `frontend/login.html`, `frontend/usuario/` | `/api/auth`, `/api/usuarios`, `/api/empresas/me`. |
| Terceros/clientes | `frontend/terceros/` | `/api/terceros`. |
| Productos y servicios | `frontend/productos/` | `/api/productos`; incluye movimientos de inventario. |
| Inventario/Kardex | `frontend/inventarios/` | No hay router independiente de inventario; movimientos están relacionados con productos. |
| Facturas y previsualización | `frontend/factura.html`, `frontend/prefactura.html`, `frontend/facturas-generadas/` | `/api/facturas`; también hay lógica local/demo. |
| POS | `frontend/pos/` | No se encontró router `/api/pos`; revisar persistencia y conciliación con facturas. |
| Cotizaciones | `frontend/cotizaciones/` | `/api/cotizaciones`. |
| Compras | `frontend/compras/` | No se encontró router, servicio ni tablas PostgreSQL de compras en el backend. |
| Reportes | `frontend/reportes/` | `/api/reportes` (ventas por cliente/producto y comparativo). |
| Nómina y empleados | `frontend/nomina-electronica/` | `/api/nominas`, `/api/empleados`; los documentos DIAN reales no se acreditan. |
| Calendario | `frontend/calendario.html`, `frontend/calendario/` | `/api/calendario`; migración 009. |
| Mauro IA | `frontend/components/chatbot/` | `/api/mauro/consultar`; tool backend para consulta de stock. |
| Migrador | `frontend/migrador.html`, `frontend/js/migrador.js` | Scripts de migración de datos en `backend/scripts/`; revisar operación antes de automatizar. |
| Contabilidad | Sección/entrada visible en dashboard | No se encontró carpeta frontend dedicada, router, servicio, modelo ni tablas de contabilidad general. |

## Backend por capa presente

- **Routes (13):** auth, empresas, terceros, productos, facturas, usuarios, nóminas, empleados, reportes, cotizaciones, auditoría, Mauro y calendario.
- **Services (9):** usuarios, empresa, terceros, productos, facturas, nómina electrónica, empleados, cotizaciones y calendario.
- **Models (9):** usuario, empresa, tercero, producto, factura, nómina electrónica, empleado, cotización y evento de calendario.
- **Middleware (4):** autenticación/roles, tenant, validación de body y manejo de errores.
- **AI:** agente determinista y una herramienta de inventario.
- **Database:** pool PostgreSQL, runner y migraciones 001–009.
- **Backups:** scripts completos de backup y simulacro de restauración en PowerShell.

No se encontraron carpetas específicas de Controllers, Repositories, Providers, Jobs/Scheduler o Tests en `backend/`.

## Brechas de cobertura

Las pantallas de compras, POS y contabilidad no tienen una ruta backend homónima identificable. Antes de migrar la UI o cambiar contratos, se debe determinar qué datos viven actualmente en navegador y definir su migración no destructiva a PostgreSQL.
