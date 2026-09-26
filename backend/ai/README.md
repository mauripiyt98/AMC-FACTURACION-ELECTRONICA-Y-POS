# Mauro IA

## Flujo

`routes/mauro.routes.js` autentica la petición y aporta el contexto de empresa/usuario. `MauroAgent.js` carga la memoria acotada, aplica las reglas de seguridad, resuelve la intención, ejecuta únicamente herramientas registradas y construye la respuesta. `intentEngine.js` mantiene clasificación y plantillas; `catalog.js` contiene rutas internas verificadas y el corpus conversacional de 550 ejemplos en 14 dominios.

El chat envía `POST /api/mauro/consultar` con `{ "mensaje": "...", "conversationId": "UUID" }`. La respuesta incluye intención, dominio, texto, seguimiento y acciones por `moduleKey`. El navegador vuelve a resolver cada acción contra su propia lista permitida; no navega a una URL arbitraria entregada por el mensaje.

## Memoria y privacidad

La memoria SQL contiene solo intención anterior, cliente mencionado durante la sesión, código de producto y contador de turnos. No persiste el historial libre del chat. Las filas se limitan simultáneamente por `empresa_id` y `usuario_id`, con RLS, y vencen lógicamente después de 30 días. Si la migración todavía no está aplicada, se usa temporalmente memoria local del proceso, con expiración y límite de capacidad.

Para habilitar memoria persistente, aplicar la migración aditiva `010_mauro_memoria.sql` desde el entorno de backend configurado: `npm run migrate`.

## Herramientas y alcance actual

- Inventario: consulta de existencias por código con `empresa_id` explícito.
- Productos: ficha de producto por código con `empresa_id` explícito.
- Terceros: búsqueda exacta por NIT/documento, limitada a registros activos de la empresa autenticada.
- Navegación: solo rutas AMC existentes; configuración exige ADMIN/SUPERADMIN.
- Contabilidad y backups: reconocidos por el catálogo, pero sin pantalla o herramienta activa; Mauro lo informa y no crea enlaces rotos.

Mauro no ejecuta altas, anulaciones, SQL recibido del usuario ni transmisiones DIAN desde el chat. La capa conversacional es determinística y local; no requiere ni transmite datos a un proveedor de modelos externo. Para agregar una integración generativa futura, debe configurarse explícitamente un proveedor, credenciales fuera del repositorio y permisos/herramientas revisados por servidor.

## Pruebas

Desde `backend`, ejecutar `npm test` en un entorno Node con npm disponible. Las pruebas de `tests/mauro.test.js` verifican el corpus, enrutamiento, seguridad, permisos, aislamiento de herramientas y memoria de contexto.
