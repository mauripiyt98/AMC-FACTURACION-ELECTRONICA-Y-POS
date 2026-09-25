# Inventario de API

**Base:** `http://localhost:3000/api` (puerto configurable).  
**Corte:** 25 de septiembre de 2026. Conteo estático: 53 métodos HTTP declarados en 13 routers; no se ejecutaron contra servidor.

La mayoría de grupos de negocio aplica `authMiddleware` y `tenantMiddleware` al router. Las excepciones de acceso público/global y los roles adicionales se indican en cada sección. `SUPERADMIN` puede operar listado/creación global de empresas.

## Autenticación — 3

| Método | Ruta | Acceso |
| --- | --- | --- |
| POST | `/auth/login` | Público; validación de credenciales. |
| POST | `/auth/logout` | JWT; revoca el `jti`. |
| GET | `/auth/me` | JWT. |

## Empresas — 4

| Método | Ruta | Acceso |
| --- | --- | --- |
| GET | `/empresas/me` | JWT + tenant. |
| PATCH | `/empresas/me` | JWT + tenant + ADMIN/SUPERADMIN. |
| POST | `/empresas` | JWT + SUPERADMIN. |
| GET | `/empresas` | JWT + SUPERADMIN. |

## Terceros — 6; todas las rutas requieren JWT + tenant

`GET /terceros`, `GET /terceros/:id`, `POST /terceros`, `PUT /terceros/:id`, `PATCH /terceros/:id`, `DELETE /terceros/:id`. Escrituras restringidas a ADMIN/SUPERADMIN. El DELETE es lógico en el servicio.

## Productos — 8; todas las rutas requieren JWT + tenant

`GET /productos`, `GET /productos/:id`, `POST /productos`, `PUT /productos/:id`, `PATCH /productos/:id`, `PATCH /productos/:id/stock`, `GET /productos/:id/movimientos`, `DELETE /productos/:id`. Escrituras administrativas restringidas a ADMIN/SUPERADMIN.

## Facturas — 5; todas las rutas requieren JWT + tenant

`GET /facturas`, `GET /facturas/stats`, `GET /facturas/:id`, `POST /facturas`, `PATCH /facturas/:id/estado`. Cambio de estado: ADMIN/SUPERADMIN.

## Cotizaciones — 6; todas las rutas requieren JWT + tenant

`GET /cotizaciones`, `GET /cotizaciones/stats`, `GET /cotizaciones/:id`, `POST /cotizaciones`, `POST /cotizaciones/:id/convertir`, `PATCH /cotizaciones/:id/estado`. Conversión y cambio de estado: ADMIN/SUPERADMIN.

## Usuarios — 5; todas las rutas requieren JWT + tenant + ADMIN/SUPERADMIN

`GET /usuarios`, `GET /usuarios/:id`, `POST /usuarios`, `PATCH /usuarios/:id`, `DELETE /usuarios/:id`.

## Nómina — 2; JWT + tenant

`GET /nominas`; `POST /nominas` requiere además ADMIN/SUPERADMIN.

## Empleados — 4; JWT + tenant

`GET /empleados`, `POST /empleados`, `GET /empleados/:id`, `PUT /empleados/:id`. No se observó `requireRole` explícito en este router.

## Reportes — 3; JWT + tenant

`GET /reportes/ventas-por-cliente`, `GET /reportes/ventas-por-producto`, `GET /reportes/ventas-comparativas`.

## Auditoría — 1; JWT + tenant + ADMIN/SUPERADMIN

`GET /auditoria`.

## Mauro — 1; JWT + tenant

`POST /mauro/consultar`.

## Calendario — 5; JWT + tenant

`GET /calendario`, `GET /calendario/proximos`, `POST /calendario`, `PUT /calendario/:id`, `DELETE /calendario/:id`.

## Observaciones

- Las rutas son a la vez router y handler/controlador; no existe documentación OpenAPI detectada.
- `auditoria.routes.js` y `usuarios.routes.js` ejecutan SQL en el handler.
- No todos los handlers aplican el validador compartido; revisar cuerpos, UUID, paginación y roles endpoint por endpoint.
- No hay endpoints de compras, POS, contabilidad, exportación XML o backups en el mapa actual.
