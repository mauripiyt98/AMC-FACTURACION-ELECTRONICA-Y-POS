# Backups actuales

**Corte:** 25 de septiembre de 2026. Revisión de scripts y documentación; no se generó ni restauró un backup durante la auditoría.

## Implementación encontrada

`backend/scripts/backup-postgres.ps1`:

- Ejecuta `pg_dump` de **toda la base** en formato PostgreSQL custom con compresión.
- Exige destino externo configurado en `AMC_BACKUP_DIR` y parámetros de PostgreSQL por entorno.
- Escribe primero un archivo parcial; solo lo renombra al validar que `pg_restore --list` pueda leerlo.
- Genera manifiesto JSON con base, fecha, tamaño, retención y SHA-256.
- Elimina archivos `.backup` vencidos y manifiestos correspondientes según `RetentionDays` (30 días por defecto).
- No cifra el artefacto desde el script ni separa por empresa o módulo.

`backend/scripts/restore-drill-postgres.ps1`:

- Exige una base de destino cuyo nombre comience por `amc_restore_drill_` y bloquea el nombre configurado como base principal.
- Valida el formato y ejecuta restauración con `pg_restore` en una base nueva de simulacro.
- No borra la base de simulacro; deja la revisión final de tablas y conteos al operador.

`docs/respaldo-y-recuperacion.md` recomienda ejecución diaria, copias 3-2-1, cifrado BitLocker/almacenamiento remoto, retención mensual/anual y simulacro mensual. Esos horarios, réplica externa, cifrado, monitorización y retención extendida son tareas operativas, no servicios automáticos visibles en el código.

## Brechas respecto al objetivo Enterprise

- Sin backup independiente/restauración selectiva de módulo o empresa.
- Sin cifrado AES a nivel de aplicación/script; la protección depende de cifrado de volumen o repositorio externo.
- No se observó scheduler, job worker, alertamiento ni catálogo central de ejecuciones.
- El manifiesto contiene hash SHA-256, pero no firma ni repositorio inmutable.
- No se constató PITR/WAL; la documentación lo declara requisito de infraestructura pendiente.
- Sin prueba reproducible que valide cardinalidades, consistencia referencial y tiempo de recuperación tras restore.

## Recomendación segura

Mantener el backup completo como red de protección. Antes de añadir copias segmentadas, definir consistencia transaccional, dependencias entre cabeceras/detalles, archivos/XML y datos de usuario; diseñar exportación tenant con pruebas de aislamiento y restauración, no con filtros SQL improvisados. Cifrado y claves deben residir fuera del repositorio. Medir RPO/RTO con simulacros antes de afirmar capacidad de recuperación.
