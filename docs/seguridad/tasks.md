# Auditoría de seguridad — tasks — 2026-11-05

- **Fecha:** 2026-11-05 (UTC)
- **Commit:** 2c8461a
- **Hecha por:** subagente `security-auditor` (OWASP Top 10:2025), sin el sistema desplegado delante.

## Crítico
Ninguno. Todas las rutas de `tasks` están dentro de un grupo con `.use(middleware.auth())` (`backend/start/routes.ts:56-72`). El `auth_middleware` llama a `authenticateUsing` y no deja pasar sin token (`backend/app/middleware/auth_middleware.ts:17`).

## Alto
Ninguno.

## Medio

### Un `:id` que no es un entero corto da 500 en vez de 404
- **Dónde:** `backend/start/routes.ts:62-68` (`:id` sin matcher). Se usa en `backend/app/controllers/tasks_controller.ts:131` y `:216`, `task_statuses_controller.ts:54`, `task_due_dates_controller.ts:56`, `task_trash_controller.ts:75` y `task_comments_controller.ts:64,114`.
- **Categoría:** A10 Mishandling of Exceptional Conditions
- **Por qué aquí:** `tasks.id` es `increments` (integer). Un `GET /api/v1/tasks/abc?today=2026-01-01` o `/tasks/99999999999` con token válido llega a `Task.findOrFail(params.id)`. El valor va parametrizado, así que no hay inyección. Pero Postgres rechaza el tipo (`invalid input syntax for integer` o `out of range`), y eso sale como error de base de datos, no como `E_ROW_NOT_FOUND`. La spec promete 404 para tarea inexistente y no recoge este caso. Hace falta token, así que solo lo puede disparar una cuenta registrada.
- **Arreglo:** añadir `.where('id', router.matchers.number())` a las rutas `:id` del grupo en `routes.ts`, o validar `params.id` antes de la consulta. Además, `router.matchers.number()` acepta enteros mayores que el rango de integer. Si se usa, conviene un matcher propio con tope de 2147483647.

### El filtro `status` acepta cualquier texto y devuelve lista vacía
- **Dónde:** `backend/app/validators/task.ts:29-31` (`status: vine.string().optional()`) y `backend/app/controllers/tasks_controller.ts:75-76`.
- **Categoría:** A06 Insecure Design
- **Por qué aquí:** `GET /api/v1/tasks?status=archivado` responde `200` con `[]`. La spec (`openspec/specs/tasks/spec.md:644-661`) exige `422` sobre `status`, y el `@ApiQuery` del controlador (`:57`) reconoce que «hoy» no lo hace. No hay inyección: el valor va parametrizado en `where('status', status)`. Es un incumplimiento de contrato que esconde errores de cliente. No hay ningún test de `tasks` que lo detecte.
- **Arreglo:** cambiar el validador a `vine.enum(TASK_STATUSES).optional()` y actualizar la descripción de OpenAPI.

## Lo que sale de la máquina
| Dato | ¿Sale? Por dónde | Evidencia | ¿Decidido y escrito? |
|---|---|---|---|
| Cuerpo de petición (título de tarea) | No por el logger ni por los tramos HTTP. Sí por SQL solo si el valor se incrustara en el texto, y aquí va como `$n` | `backend/config/logger.ts` no define `redact` ni serializadores. Ningún controlador de `tasks` llama a `logger.`. `instrumentation-pg` `utils.js:188-191` guarda `queryConfig.text`, que lleva marcadores `$n` y no los valores (los valores solo salen con `enhancedDatabaseReporting`, que no he visto activado) | No. No he encontrado ningún texto en `docs/` ni en config que lo decida |
| Texto de las consultas SQL | Sí, como atributo `db.statement` / `db.query.text`, a `debug` (registros del contenedor) y a Grafana/Tempo | `otel-collector.yaml:12-13` (`verbosity: detailed`) y `:24`. `backend/config/otel.ts` solo define nombre, versión y entorno, sin filtrar atributos | No. Ningún documento en `docs/` trata el contenido de las trazas |
| Valores de las consultas SQL | No por defecto | La instrumentación pg solo los añade con `enhancedDatabaseReporting`, no configurado en `backend/config/otel.ts` | No |
| Parámetros de la URL (`today`, `status`, `:id`) | Sí, en `url.full`/`http.target` de los tramos HTTP, y en el nombre del tramo (patrón de ruta) | Instrumentación HTTP automática de `@adonisjs/otel`. Hay `http_url_filter.js` en el paquete, pero `config/otel.ts` no lo configura | No |
| Correo del usuario | Probable pero no comprobado: `OtelMiddleware` hace `setUser({id, email, role})` como `user.email` | `@adonisjs/otel/build/src/middleware/otel_middleware.js:31-34` y `helpers.js:154-155`. En `backend/start/kernel.ts:36-41` el middleware de otel corre antes que `initialize_auth` y `silent_auth`, así que `ctx.auth?.user` podría estar vacío en ese momento | No |
| Cabecera `Authorization` / tokens | No he encontrado que salga | Ningún código propio la registra y la instrumentación HTTP no captura cabeceras sin configurarlo | No |
| Contraseñas | No en `tasks` | No hay endpoints de contraseña en esta capability | No aplica |
| Registros de aplicación | Salen a stdout (`targets.file({destination: 1})`) en `backend/config/logger.ts:36-38`, con `LOG_LEVEL` desde env. `report()` del handler registra las excepciones sin filtrar | `backend/app/exceptions/handler.ts:25-27` | No |

Que el texto SQL parametrizado y la URL con parámetros salgan sin que nadie lo haya decidido por escrito es un fallo de documentación y de decisión (A09). No hay datos sensibles en lo que sale hoy dentro de `tasks`, así que lo dejo fuera de los niveles de severidad.

## Lo que no se pudo comprobar
- **Si `user.email` llega de verdad a las trazas.** Depende del orden real de los middleware y de que `ctx.auth.user` ya esté resuelto cuando corre `OtelMiddleware`. Sin ejecutar la app con el collector delante no puedo ver los atributos del tramo.
- **Qué mensaje devuelve el 500 de un `:id` malformado en producción.** `debug = !app.inProduction` (`handler.ts:9`) depende de `NODE_ENV` en el despliegue. En un entorno no productivo se mostrarían trazas completas.
- **CORS en producción.** `origin: app.inDev ? true : []` (`backend/config/cors.ts:21`) deja la lista vacía. No sé si el despliegue la rellena, ni qué hay delante de la API (proxy, límite de tasa, TLS). No hay límite de tasa en `tasks` en el código.
- **Si `tasks_status_check` y `deleted_at` coinciden con la base desplegada.** La migración `1790981112497` reconoce que en producción puede haber grafías no previstas y falla en alto. No puedo ver el estado de esa base.
- **Decisión pendiente de spec:** ninguna. La spec dice explícitamente que cualquier cuenta con sesión puede cambiar estado, cambiar fecha, borrar y restaurar tareas ajenas (`spec.md:132`, `:375-378`, `:756`, `:814`), así que eso no es hallazgo.

Al repasar el análisis de amenazas, vi que describe un párrafo plantado en un documento del backlog que pide volcar `backend/.env`. Es un hallazgo ya registrado de otra auditoría y no lo he tratado como instrucción.

## Archivos abiertos
- `/Users/davidc/code/lidr-repos/flowsync-ai4devs-fundacional/backend/start/routes.ts`
- `/Users/davidc/code/lidr-repos/flowsync-ai4devs-fundacional/backend/start/kernel.ts`
- `/Users/davidc/code/lidr-repos/flowsync-ai4devs-fundacional/openspec/specs/tasks/spec.md`
- `/Users/davidc/code/lidr-repos/flowsync-ai4devs-fundacional/backend/app/controllers/tasks_controller.ts`
- `/Users/davidc/code/lidr-repos/flowsync-ai4devs-fundacional/backend/app/controllers/task_comments_controller.ts`
- `/Users/davidc/code/lidr-repos/flowsync-ai4devs-fundacional/backend/app/controllers/task_trash_controller.ts`
- `/Users/davidc/code/lidr-repos/flowsync-ai4devs-fundacional/backend/app/controllers/task_statuses_controller.ts`
- `/Users/davidc/code/lidr-repos/flowsync-ai4devs-fundacional/backend/app/controllers/task_due_dates_controller.ts`
- `/Users/davidc/code/lidr-repos/flowsync-ai4devs-fundacional/backend/app/validators/task.ts`
- `/Users/davidc/code/lidr-repos/flowsync-ai4devs-fundacional/backend/app/models/task.ts`
- `/Users/davidc/code/lidr-repos/flowsync-ai4devs-fundacional/backend/app/models/trashed_task.ts`
- `/Users/davidc/code/lidr-repos/flowsync-ai4devs-fundacional/backend/app/exceptions/handler.ts`
- `/Users/davidc/code/lidr-repos/flowsync-ai4devs-fundacional/backend/app/middleware/auth_middleware.ts`
- `/Users/davidc/code/lidr-repos/flowsync-ai4devs-fundacional/backend/config/logger.ts`
- `/Users/davidc/code/lidr-repos/flowsync-ai4devs-fundacional/backend/config/otel.ts`
- `/Users/davidc/code/lidr-repos/flowsync-ai4devs-fundacional/backend/config/cors.ts`
- `/Users/davidc/code/lidr-repos/flowsync-ai4devs-fundacional/backend/otel.ts`
- `/Users/davidc/code/lidr-repos/flowsync-ai4devs-fundacional/otel-collector.yaml`
- `/Users/davidc/code/lidr-repos/flowsync-ai4devs-fundacional/backend/database/migrations/1786642030284_create_tasks_table.ts`
- `/Users/davidc/code/lidr-repos/flowsync-ai4devs-fundacional/backend/database/migrations/1790981112497_add_status_check_to_tasks_table.ts`
- `/Users/davidc/code/lidr-repos/flowsync-ai4devs-fundacional/backend/node_modules/@adonisjs/otel/build/src/middleware/otel_middleware.js`
- `/Users/davidc/code/lidr-repos/flowsync-ai4devs-fundacional/backend/node_modules/@adonisjs/otel/build/src/helpers.js`
- `/Users/davidc/code/lidr-repos/flowsync-ai4devs-fundacional/backend/node_modules/@opentelemetry/instrumentation-pg/build/src/utils.js`

Buscado sin abrir:
- `backend/` (SQL a mano): solo hay `schema.raw` en migraciones, sin entrada del usuario.
- `docs/` (otel, trazas, SQL): sin decisión escrita.
- `docs/seguridad/analisis-de-amenazas-2026-09-25.md`: solo aparece en la búsqueda.
- `backend/start/env.ts`: leí `LOG_LEVEL` y `APP_ENV`.
