# Dependencias y runtime

**Corte:** 25 de septiembre de 2026. Inventario estático de manifiestos y configuración visible; no se inspeccionaron secretos ni se descargaron paquetes.

## Backend (`backend/package.json`)

Requisito declarado: Node.js `>=18`. El manifiesto declara nueve dependencias de producción y `nodemon` como dependencia de desarrollo.

| Paquete | Uso visible |
| --- | --- |
| `express` | API HTTP y routers. |
| `pg` | Pool PostgreSQL, clientes por transacción y migraciones. |
| `jsonwebtoken` | Emisión y verificación de JWT. |
| `bcryptjs` | Hash/verificación de contraseñas. |
| `helmet` | Cabeceras HTTP de seguridad. |
| `cors` | Política de orígenes de API. |
| `express-rate-limit` | Límites globales y de autenticación. |
| `dotenv` | Configuración local desde entorno. |
| `uuid` | Identificadores UUID. |
| `nodemon` (dev) | Reinicio del servidor durante desarrollo. |

Scripts declarados: `start`, `dev`, `migrate`, `seed` y `test`. `test` apunta a `backend/tests/`, que no existe en el árbol inspeccionado.

## Frontend

No se encontró `package.json` ni gestor de paquetes para el frontend. La interfaz es HTML/CSS/JavaScript directo y consume la API mediante `frontend/js/api-client.js` y código específico de cada módulo. Parte del modo local usa `localStorage`/`sessionStorage`.

## Runtime e infraestructura

- PostgreSQL es requerido por el backend; configuración vía `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` y variables de migración.
- La API escucha en `PORT` (predeterminado 3000); no sirve estáticamente `frontend/`.
- La generación de backups requiere `pg_dump.exe` y `pg_restore.exe` disponibles mediante `PG_BIN_DIR`.
- No se encontró archivo de lock (`package-lock.json`, `yarn.lock` o `pnpm-lock.yaml`) en el repositorio. Los rangos semver no fijan una instalación reproducible.
- No se encontró configuración visible de linter, formateador, CI, Docker, PM2 o Nginx.
- No se hizo `npm install`, `npm audit`, análisis de licencias ni comprobación de versiones instaladas; este documento solo refleja el manifiesto.

## Dependencias internas

`server.js` monta los routers. Los routers llaman servicios; los servicios mezclan orquestación con acceso directo a pool en algunos módulos y llaman a modelos en otros. Los modelos usan el cliente PostgreSQL entregado por el request tenant. `MauroAgent` invoca una tool de inventario que consulta el modelo de productos. Scripts de backup/migración corren fuera del ciclo HTTP.

No se ejecutó un analizador de ciclos de módulos; la ausencia de ciclos no se certifica.
