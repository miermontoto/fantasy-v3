# CLAUDE.md

companion de fantasy marca (fantasy.marca.com): scrapea la liga, mantiene la
contabilidad de los rivales, sigue las cláusulas y expone un dashboard.

mismo patrón que `~/dev/sis` y `~/dev/duckhunt`: monorepo pnpm, api hono que sirve
una spa de sveltekit, sqlite con drizzle, `platform/` como submódulo.

v3 es una reescritura. la historia previa:
- **v1** `~/dev/fantasy` (rails): tenía el dashboard, pero scrapeaba en cada request
  y no persistía nada. de ahí se recupera el diseño de la tarjeta de jugador.
- **v2** `~/dev/fantasy-zig` (zig): construyó toda la inteligencia (ledger, cláusulas,
  escritura) pero sobre ficheros json sobrescritos y un timer de systemd. es la
  **especificación funcional** de v3: portar leyendo su código, no de memoria.

## comandos

```bash
pnpm dev              # api (3000) + web (5173) en paralelo
pnpm build            # web → static → api
pnpm db:generate --name=<slug>   # nueva migración tras tocar schema.ts
pnpm db:migrate
pnpm version:bump     # versión <yy>w<ww><letra> en packages/api/src/constants.ts
```

deploy: `ssh fa "cd ~/dev/fantasy-v3 && docker compose up --build -d"`. puerto host **3006**
(sis 3004, duckhunt 3005).

## arquitectura

```
packages/api/src/
  db/          schema.ts + connection.ts + migrations/. no conoce hono ni servicios
  scraper/     cliente http (curl) + parsers html/json de fantasy.marca.com
  queries/     lecturas/escrituras tipadas sobre drizzle. sin saber de transporte
  services/    orquestan queries: ledger, clauses, ratings, pollers
  routes/      envoltorios finos: validar → llamar query → devolver
  mcp/         hermano de routes: mismas queries, otra superficie (fase 2)
```

flujo de dependencias, sin excepciones:

```
db ←── queries ←── services ←── routes
                            ←── mcp
                            ←── services/pollers
```

`app.ts` compone: `createPlatformApp()` → rutas → `mountSpa(app)` **el último**.
`index.ts`: `loadAppEnv()` → `getDb()` → `startAll()` pollers → `startApiServer()`.

## dominio: lo que v2 aprendió (no re-descubrir)

### autenticación
- la cookie `refresh-token` es un jwt de larguísima duración; los `X-Auth` por
  comunidad rotan y mueren en el cambio de temporada.
- **toda página html embebe un objeto `_FG_cfg`** con el `auth` vigente,
  `id_community`, temporada, saldos por comunidad y feature flags. renovar el
  X-Auth = pedir `/feed` con la cookie y extraerlo de ahí.
- cloudflare bloquea user-agents cortos: mandar siempre `USER_AGENT` completo.
- ⚠️ cloudflare **hace fingerprinting del handshake tls**, no solo de las cabeceras.
  curl 8.x pasa; el curl 7.88 de debian bookworm y el `fetch` nativo de node dan
  403 aunque manden exactamente las mismas cabeceras. de ahí que la imagen sea
  `node:24-trixie-slim` (curl 8.14) y que el scraper invoque curl en vez de fetch.

### endpoints ajax
la web registra `sws['clave'] = {post: 'nombre'}` → `POST /ajax/sw/{clave}` con
cuerpo `post={nombre}` y cabecera X-Auth. verificados:
`sw/players`, `sw/market`, `sw/gameweek`, `sw/balance`, `sw/offers-received`,
`sw/offers-sent`, `sw/competition`, `sw/notifications`, `sw/subs`, `sw/store`.
además `ajax/balance` (saldo propio rápido) y `ajax/player-community-info`
(contexto de un jugador: dueño, cláusula, mercado, puja propia).

**`sw/users-balances` existe y daría los saldos reales de TODOS los mánagers**,
pero devuelve 401 porque la liga tiene `show_balances: 0`. si el admin lo activa,
el ledger deja de ser estimación.

escritura (payloads copiados de los formularios `twig-bid`/`twig-sale`; la web
construye la url como `ajax/` + el `data-ajax` del botón):
- `ajax/bid` — `offeree_id` (0 = libre, si no id del dueño), `id_market`, `id_player`,
  `action` (bid|update|remove), `bid`
- `ajax/sale` — `id_player`, `action` (sale|remove), `price` (no admite < valor)
- `ajax/clause-set` — `id_player`, `percentage` (50 = 1.5x)

### economía de cláusulas (verificado 26/27)
- cláusula = suelo × multiplicador; el suelo sigue al valor a diario, **el
  multiplicador es lo que el dueño controla**. por defecto 1.5x, máximo 4.0x.
- subir cuesta **cash** (no créditos): cada escalón de +0.5 cuesta
  `base × nº_escalón`, con `base = 20% del valor` en el momento de subir.
- bajar reembolsa el **50%** de lo invertido.
- suelo mínimo de cláusula: **1.0M** (infla el ratio de los jugadores baratos).
- los escudos cuestan créditos. tras un reset hay un escudo global (~12 días).
- ⚠️ el campo `shield` del **listado miente**; solo `clause.shield` del detalle vale.

### contabilidad
- `max_bid = max(0, cash + 25% × valor_de_plantilla)`. el 25% es la deuda
  permitida; la deuda **sí** resta, pero el resultado se acota en 0 porque no
  existe la capacidad de compra negativa. la "deuda máxima" que muestra el mercado
  es la capacidad **restante**, que además descuenta las pujas comprometidas
  (`remaining_now`): techo 10.56M − 1.33M comprometido = 9.23M observado.
- el presupuesto inicial **sí es uniforme** (200M): **no hay bonus por referidos**.
  el historial lo parte en "Saldo inicial" + "Ajuste por reinicio", pero la suma es
  igual para todos. el error del baseline viene de capturarlo después del reset,
  con los valores de plantilla ya movidos.
- los eventos del feed **hacen scroll y desaparecen**: en v2 se perdieron dos
  traspasos sincronizando 1×/día. de ahí que el poller del feed sea el crítico
  (15 min) y que exista reconciliación por `transfer.price` del detalle.
- los renombres de equipo parten la identidad: las tarjetas del feed usan el
  nombre ACTUAL y la clasificación el original → tabla `manager_alias`.

## cómo: cambiar el schema

1. editar `packages/api/src/db/schema.ts`
2. `pnpm db:generate --name=<slug>`
3. revisar el sql generado (sqlite recrea tablas: validarlo aislado)
4. comprobar el `when` en `meta/_journal.json`: el migrador aplica por `when`
5. las migraciones se aplican solas al arrancar, dentro de `getDb()`
6. **nunca editar una migración ya commiteada**

## cómo: añadir un poller

registrar un `Poller` en `services/pollers/` y darlo de alta en `index.ts`.
**un poller nunca captura sus propios errores**: si los traga, el runner no puede
aplicar backoff y un fallo permanente se vuelve un bucle silencioso. `DISABLE_POLLING=1`
los apaga para trabajar en local contra un snapshot.

❌ `setInterval` suelto. usa el `poller-runner`.

## estilo

- comentarios en **español minúscula**, identificadores en inglés. la primera
  línea de cada fichero declara su propósito.
- prohibidos por nombre: `utils.ts`, `helpers.ts`, `common.ts`.
- sin números ni strings mágicos: todo `as const` en `constants.ts`.
- sin `catch {}` vacío, sin `throw 'string'`, sin `@ts-ignore`, sin `any` nuevo.
- funcional para datos (`map/filter/reduce`); clases solo con estado real.
- un fichero, una responsabilidad; el nombre del fichero es su export principal.
- css: **nunca hex inline**, siempre `var(--token)` de `lib/styles/tokens.css`.
- commits: convencionales, en español minúscula. en este repo **se commitea**
  durante el turno (invierte la regla global).

## datos sensibles

`data/`, `ledger.json` y `clauses.json` contienen nombres reales de los rivales y
su actividad económica, y el repo es público: **nunca commitearlos**.

## mcp

`pnpm mcp:stdio` levanta el transport stdio (el que consume claude code); el http
va montado en `/mcp` y habla json-rpc. para registrarlo:

```bash
claude mcp add fantasy -- pnpm --dir ~/dev/fantasy-v3 mcp:stdio
```

tools: `fantasy_ledger`, `fantasy_steal_targets`, `fantasy_clause_changes`,
`fantasy_transfers`, `fantasy_player`, `fantasy_manager_history`, `fantasy_sync`.

el transport http va protegido por un authorization server oauth 2.1 propio
(`routes/oauth-mcp.ts` + `queries/mcp-oauth.ts`), con registro dinámico: el
cliente descubre todo solo y no hace falta configurar credenciales.

- `/.well-known/oauth-protected-resource` (rfc 9728) → a qué AS ir
- `/.well-known/oauth-authorization-server` (rfc 8414) → dónde están sus endpoints
- `/api/oauth/mcp/register` (rfc 7591) → alta dinámica del cliente
- `/api/oauth/mcp/authorize` → consentimiento, reutiliza la sesión del dashboard
- `/api/oauth/mcp/token` → code + refresh rotativo

propiedades verificadas: PKCE S256 obligatorio, codes de un solo uso con ttl de
60s, tokens guardados solo como sha256, binding de audiencia (un token para otro
recurso no vale) y detección de replay que revoca la cadena entera del cliente.

## estado

- ✅ fase 0: scaffolding (submódulo, workspace, docker, schema, poller-runner, health)
- ✅ fase 1: scraper portado, pollers feed/clauses/standings, backfill de v2
- ✅ fase 2: api de inteligencia + mcp (7 tools, stdio + http en /mcp)
- ✅ fase 3: dashboard de inteligencia (liga, cláusulas, actividad, ficha con gráfico)
- ✅ fase 4: paridad con v1 (tarjeta de jugador, filtros, visor de plantillas)
- ⏳ fase 5: acciones de escritura en ui, push, capacitor

mientras la fase 1 no esté probada, **v2 sigue sincronizando**: perder eventos del
feed a mitad de temporada es irrecuperable.
