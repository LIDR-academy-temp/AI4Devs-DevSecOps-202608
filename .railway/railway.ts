/**
 * FlowSync en Railway: la base de datos (`db`, con su volumen) y la API (`api`).
 *
 * Lo que NO vive en este archivo:
 *
 * - La API no se despliega hasta que pasa el pipeline de `main` (*Wait for CI*).
 *   Eso es un ajuste del servicio `api` en la plataforma (Settings → Wait for
 *   CI), no una línea de aquí: hay que activarlo a mano una vez creado el
 *   servicio.
 * - Los valores de `preserve()`: aquí solo se dice que la variable existe y que
 *   su valor se conserva en la plataforma. Hay que darlos de alta en Railway
 *   ANTES del primer arranque, o la API no pasa la validación de
 *   `start/env.ts` y la base no se inicializa. Cómo, en `.railway/README.md`.
 */
import { defineRailway, github, image, preserve, project, service, volume } from 'railway/iac'

/**
 * El repositorio desde el que se construye la API. Quien despliegue desde su
 * fork cambia solo esta línea.
 */
const REPOSITORIO = 'LIDR-academy-temp/AI4Devs-DevSecOps-202608'

export default defineRailway(() => {
  const datos = volume('db-data')

  /**
   * La misma imagen que `compose.yaml` en local, no la plantilla de Postgres de
   * Railway, que viene en otra versión mayor: así producción y desarrollo
   * corren el mismo PostgreSQL 17 con las mismas extensiones.
   */
  const db = service('db', {
    source: image('pgvector/pgvector:pg17'),
    volumeMounts: { '/var/lib/postgresql/data': datos },
    env: {
      POSTGRES_USER: 'flowsync',
      POSTGRES_DB: 'flowsync',
      POSTGRES_PASSWORD: preserve(),
      // Una subcarpeta del volumen y no su raíz: un volumen recién creado
      // puede traer `lost+found`, y PostgreSQL no inicializa un directorio
      // que no está vacío.
      PGDATA: '/var/lib/postgresql/data/pgdata',
    },
  })

  const api = service('api', {
    // Railway encuentra `backend/Dockerfile` en el directorio raíz.
    source: github(REPOSITORIO, { branch: 'main', rootDirectory: 'backend' }),
    // `/health` comprueba la base; `/` solo diría que el proceso responde.
    healthcheck: '/health',
    // Corre entre la construcción y el arranque; si falla, el despliegue se
    // detiene y la versión nueva no arranca. `--force` porque en producción
    // Lucid pide confirmación y aquí no hay nadie para darla.
    preDeploy: 'node ace migration:run --force',
    env: {
      // También para el `preDeploy`: con `production`, `migration:run` no
      // intenta regenerar `database/schema.ts`, que en la imagen es de solo
      // lectura.
      NODE_ENV: 'production',
      PORT: '3333',
      HOST: '0.0.0.0',
      LOG_LEVEL: 'info',
      SESSION_DRIVER: 'cookie',
      DB_HOST: db.env.RAILWAY_PRIVATE_DOMAIN,
      DB_PORT: '5432',
      // Referencias a las de `db`, no copias: si cambian allí, cambian aquí.
      DB_USER: db.env.POSTGRES_USER,
      DB_DATABASE: db.env.POSTGRES_DB,
      DB_PASSWORD: db.env.POSTGRES_PASSWORD,
      APP_URL: preserve(),
      APP_KEY: preserve(),
    },
  })

  return project('flowsync', {
    resources: [db, datos, api],
  })
})
