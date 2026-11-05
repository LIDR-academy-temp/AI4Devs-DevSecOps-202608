---
name: auditoria-seguridad
description: Audita la seguridad de una capability de FlowSync (auth, tasks, comments…) contra el OWASP Top 10 con el subagente security-auditor y guarda su informe, fechado y sin tocar, en docs/seguridad/<capability>.md. No arregla nada. Usar cuando se pida auditar la seguridad de una capability o /auditoria-seguridad.
---
# Auditoría de seguridad de una capability

Es un procedimiento fijo: lanza al auditor, guarda lo que devuelve y para. **No arregla nada.** El informe es una lista para decidir, no código para aceptar: ni se edita código de la aplicación ni se abre un cambio a partir de él dentro de esta skill.

No se confunde con `analisis-de-amenazas`. Esa skill mira **todo el sistema** (producto y harness) contra el OWASP Top 10 **para aplicaciones con modelos de lenguaje**. Esta mira **el código de una capability** contra el OWASP Top 10 de aplicaciones web.

## 1. La capability

- Tiene que venir en la petición. Si no viene, pregunta cuál y no sigas.
- Tiene que existir en `openspec/specs/<capability>/` o en `docs/capabilities/<capability>/`. Si no existe en ninguno de los dos, dilo con la lista de las que hay y para.

## 2. Lanza el subagente

Lanza `security-auditor` con un encargo de una línea: «Audita la capability `<capability>`.» No le pases tus sospechas ni lo que ya creas saber: el informe tiene que salir de lo que él lea.

## 3. Guarda el informe tal cual

- Fecha: `date -u +%F`. Commit: `git rev-parse --short HEAD`.
- Ruta: `docs/seguridad/<capability>.md`. Si ya existe, se sobrescribe; la versión anterior queda en el historial de git.
- Contenido: esta cabecera y, debajo, el informe del subagente **sin cambiar una palabra** (ni resumir, ni reordenar, ni quitar hallazgos que te parezcan flojos):

```markdown
# Auditoría de seguridad — <capability> — AAAA-MM-DD

- **Fecha:** AAAA-MM-DD (UTC)
- **Commit:** <hash corto>
- **Hecha por:** subagente `security-auditor` (OWASP Top 10:2025), sin el sistema desplegado delante.

<informe del subagente, literal>
```

Si no estás de acuerdo con algo del informe, lo dices en tu respuesta, no en el archivo.

## 4. Qué entregar

La ruta del archivo y el recuento por prioridad (crítico / alto / medio), en dos líneas. Nada más: ni propuestas de arreglo propias ni cambios en el código.
