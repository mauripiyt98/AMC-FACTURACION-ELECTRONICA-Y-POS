# Logos de empresas en VPS

Los logos de los tenants se guardan como PNG normalizado en el volumen definido
por `UPLOADS_DIR`, no en `assets/` ni en el checkout del proyecto. La base de
datos conserva la ruta pública relativa en `empresas.logo_url`.

En producción configure, por ejemplo:

```env
NODE_ENV=production
UPLOADS_DIR=/var/lib/amc/uploads
MEDIA_PUBLIC_PATH=/media
CORS_ORIGIN=https://facturacion.ejemplo.com
```

El usuario que ejecuta Node debe poder crear y escribir
`/var/lib/amc/uploads/logos`. Esa ruta debe estar en el respaldo del servidor.
El backend expone los archivos como `/media/logos/<uuid-empresa>.png`; si Nginx
sirve frontend y API desde el mismo dominio, no hace falta configurar URL alguna
en el navegador: el frontend usa automáticamente `/api`.

Para un frontend en un dominio separado, defina antes de los scripts de la
aplicación `window.AMC_API_BASE_URL = 'https://api.ejemplo.com/api'` y agregue
el dominio del frontend a `CORS_ORIGIN`. Así las facturas pueden incorporar el
logo remoto al generar su PDF.
