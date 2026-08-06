# contracts

especificaciones agente-readable de las features pendientes. cada contrato declara:
scope, capa donde vive el código, inputs (env, deps, datos), outputs (schema, endpoints),
criterios de aceptación verificables y non-goals explícitos.

## cómo se usa un contrato

1. al empezar, abre el archivo y léelo entero antes de tocar código.
2. ejecuta los pasos de "implementación" sin reordenar capas.
3. al terminar, confirma cada bullet de "criterios de aceptación" con una comprobación
   concreta (curl, query sql, log). no marcar completado sin verificación.
4. si un criterio era ambiguo, actualiza el contrato en el mismo cambio.
5. al cerrar, mueve el archivo a `contracts/done/` con la fecha prefijada:
   `done/2026-08-06-01-scraper-port.md`.

## reglas de oro

- un contrato = un cambio. no fusionar dos contratos.
- los contratos respetan la jerarquía de capas de `CLAUDE.md`. los wrappers http/mcp
  son delgados.
- los pollers nunca capturan errores internamente: el runner aplica backoff.
- los criterios de aceptación deben ser objetivamente verificables. nada de
  "se ve bien" ni "funciona".
- v2 (`~/dev/fantasy-zig`) es la especificación funcional: portar leyendo su código.

## índice

| # | contrato | estado |
|---|---|---|
| 01 | scraper port (browser + parsers html/json) | ⏳ fase 1 |
| 02 | pollers reales (feed, market, clauses, balance, standings) | ⏳ fase 1 |
| 03 | backfill desde ledger.json / clauses.json de v2 | ⏳ fase 1 |
| 04 | servicio de ledger sobre snapshots | ⏳ fase 2 |
| 05 | servicio de cláusulas + detección de cambios | ⏳ fase 2 |
| 06 | superficie mcp | ⏳ fase 2 |
| 07 | dashboard de inteligencia | ⏳ fase 3 |
| 08 | paridad v1 (tarjeta de jugador, filtros, visor de rivales) | ⏳ fase 4 |
| 09 | acciones de escritura en ui (dry-run → confirmar) | ⏳ fase 5 |
| 10 | push (caídas de cláusula, expiración de escudo, ofertas) | ⏳ fase 5 |
| 11 | shell capacitor (android/ios) | ⏳ fase 5 |
