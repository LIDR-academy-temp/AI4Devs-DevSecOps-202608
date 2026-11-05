# Objetivo de nivel de servicio: API de tareas

Sale de lo que la instrumentación ya guarda: cada petición deja un tramo (span) con `http.route`, `http.response.status_code` y su duración.

## Indicador (SLI)

Entre las peticiones a las rutas de `/api/v1/tasks`:

- **Denominador:** número de peticiones.
- **Numerador:** número de esas peticiones contestadas con un código **menor de 500** y en **menos de 500 ms**.
- **SLI = numerador / denominador.** Una petición que falla (≥ 500) o tarda 500 ms o más cuenta como mala; un 4xx rápido cuenta como buena (es un error de quien llama, no del servicio).

## Objetivo (SLO)

**SLI ≥ 99 %**, medido sobre una **ventana móvil de 28 días**.

## Presupuesto de error

Es lo que el objetivo deja fallar: 1 % de las peticiones de la ventana.

| | Valor |
|---|---|
| Peticiones en la ventana (**supuesto**) | 20.000 |
| Presupuesto = 1 % × 20.000 | **200 peticiones malas** en 28 días |

> El volumen de 20.000 es un supuesto: se sustituye por el real de la ventana y el presupuesto se recalcula igual (1 % del total).

## Alerta (una sola)

**Síntoma:** «las tareas están fallando o tardando por encima de lo que el objetivo permite, y a este ritmo se agota el presupuesto antes de cerrar la ventana.»

- **Ritmo de gasto** = (peticiones malas / peticiones) en las últimas 6 h, dividido entre 0,01 (la fracción mala que el SLO tolera). Un ritmo de 1 agota el presupuesto justo al cerrar los 28 días.
- **Se avisa cuando el ritmo es mayor que 1.** Las 6 h son una elección inicial, a ajustar con el volumen real: con poco tráfico una ventana corta se dispara por unas pocas peticiones.

**Qué contar sobre los tramos**, en la ventana de 6 h y filtrando por `http.route` de `/api/v1/tasks`:

1. Total = tramos de petición que cumplen ese filtro.
2. Malas = de esos, los que tienen `http.response.status_code` ≥ 500 **o** duración ≥ 500 ms.
3. Ritmo = (malas ÷ total) ÷ 0,01.

## Qué NO cubre

Todo lo que no sea `/api/v1/tasks`: en particular el registro (`/api/v1/auth/signup`), el inicio de sesión (`/api/v1/auth/login`) y el resto de `/api/v1/account/*`. Un fallo ahí no gasta este presupuesto. Si importan, merecen su propio objetivo con su propio presupuesto.
