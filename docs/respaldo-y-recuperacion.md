# Respaldo y recuperación de AMC

## Objetivo

Proteger terceros, facturas, productos e inventario, cotizaciones y nóminas sin depender de copias del navegador ni de exportaciones manuales.

## Controles incorporados

- La migración `008_resiliencia_y_auditoria.sql` es aditiva: no elimina registros existentes.
- Las operaciones sobre datos críticos quedan registradas en `auditoria_eventos` con valores anteriores y posteriores.
- Los administradores pueden consultar el historial filtrado mediante `GET /api/auditoria?tabla=productos&registroId=<uuid>`.
- El rol de aplicación pierde permisos de borrado físico sobre las tablas críticas.
- Facturas e inventario se guardan como una sola transacción: si el kardex falla, la factura también se revierte.
- Las relaciones entre cabeceras y líneas se protegen para nuevas escrituras. La validación histórica se hace después de revisar `diagnostico_lineas_huerfanas`.

## Configuración segura

Configure estas variables en el servicio o en el Programador de tareas de Windows, nunca en el repositorio:

```text
PGHOST=localhost
PGPORT=5432
PGDATABASE=amc_facturacion
PGUSER=<usuario-de-backup-con-permisos-de-lectura>
PGPASSWORD=<secreto-en-un-administrador-de-secretos>
AMC_BACKUP_DIR=D:\AMC-Backups
PG_BIN_DIR=C:\Program Files\PostgreSQL\18\bin
```

El directorio de backup debe estar cifrado por BitLocker o almacenarse en un repositorio remoto cifrado. No debe ser una carpeta dentro del proyecto ni el único disco del servidor.

## Rutina 3-2-1

1. Ejecutar `backend/scripts/backup-postgres.ps1` cada noche.
2. Conservar el backup local cifrado durante 30 días.
3. Replicar los backups a un almacenamiento externo cifrado e independiente.
4. Mantener 12 copias mensuales y 7 anuales fuera del servidor.
5. Ejecutar una restauración de simulacro mensual con `restore-drill-postgres.ps1` sobre una base `amc_restore_drill_<fecha>`.

## Verificación previa de integridad histórica

Antes de convertir las claves foráneas nuevas a estado validado, ejecutar:

```sql
SELECT * FROM diagnostico_lineas_huerfanas;
ALTER TABLE lineas_factura VALIDATE CONSTRAINT lineas_factura_cabecera_fk;
ALTER TABLE lineas_cotizacion VALIDATE CONSTRAINT lineas_cotizacion_cabecera_fk;
```

Si la primera consulta devuelve filas, no borrar nada. Corrija o recupere la cabecera correspondiente antes de validar.

## Recuperación ante borrado masivo

1. Detener escrituras en la aplicación.
2. Identificar la transacción y registros afectados en `auditoria_eventos`.
3. Restaurar el backup más reciente en una base de simulacro.
4. Comparar conteos y reconstruir únicamente los registros perdidos, conservando las operaciones posteriores válidas.
5. Si el incidente supera el RPO diario, restaurar mediante PITR/WAL cuando esté configurado en el servidor PostgreSQL.

## Requisito pendiente de infraestructura

PITR requiere configurar `archive_mode`, `archive_command` y retención de WAL en el servidor PostgreSQL. Es una decisión de infraestructura y no debe aplicarse desde el código de la aplicación.
