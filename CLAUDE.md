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
  services/    orquestan queries: ledger, clauses, activity, ratings, pollers
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
- ⚠️⚠️ **`cláusula / valor` NO es el multiplicador**. el suelo es
  `max(precio_pagado, valor_actual)`, así que ese ratio se mueve solo con el
  mercado. deducir subidas de cláusula de él imputaba gasto inventado: a
  Mourinheiro le cargaba 8.5M teniendo sus 14 jugadores en el 1.5 por defecto.
  el multiplicador real y el precio pagado solo los da `player-community-info`,
  que es lo que recoge el poller `clause-detail` (1 petición por jugador, 12h).
- el poller de cláusulas guarda snapshot de la **liga entera**, no solo de lo que
  tiene dueño: los ~328 agentes libres son la otra mitad del mercado. el diff de
  eventos sigue mirando solo a los que tienen dueño (un libre no tiene cláusula
  que subir), y `latestOwnedSnapshots` sigue filtrando, porque valor de plantilla,
  baseline y objetivos de cláusula se inflarían contando libres.
- ⚠️ en un `clause_change` de tipo `released`, `ownerId` es el dueño que **pierde**
  al jugador, no el que lo gana (`prevOwnerId` va vacío). sin invertirlo, el feed
  pinta «mercado → X» y una baja se lee como un fichaje.
- ⚠️ los `clause_change` de tipo `clause_up` guardados hasta ahora traen
  `oldClause = 0` (los 16 que hay): el diff los emite así cuando el snapshot
  previo no tenía cláusula, y son en su mayoría **falsos positivos** de la
  primera pasada, no subidas reales. la ui no pinta el salto si la cláusula
  anterior es 0, porque «0.00M → 4.76M» se lee como que no tenía cláusula.
  el filtro del poller sigue pendiente de endurecer.
- el saldo inicial **se reconstruye exacto**, no se estima: `saldo_inicial =
  200M − valor de la plantilla el día del reset`. la plantilla de ese día sale de
  deshacer sobre la actual todos los traspasos posteriores (el feed es completo), y
  se valora con `values_chart` del detalle, que trae **366 valores diarios** por
  jugador. `POST /api/baseline/recompute` (dry-run; `?apply=true` para escribir).
  contrastado con los dos saldos reales conocidos: **delta de 0 €** en ambos.
- las anclas (`POST /api/anchors`) siguen existiendo como red de seguridad, pero
  **ya no hacen falta**: con el baseline reconstruido los dos saldos verificables
  salen exactos sin ninguna ancla puesta.
- un mánager puede **regalar** un jugador a otro (precio 0). el juego **no publica
  tarjeta** en el feed, así que es el único movimiento de plantilla que no se
  descubre solo: hay que anotarlo con `POST /api/transfers/gift`
  (`kind = 'gift'`, `source = 'manual'`). no mueve dinero, pero sí el baseline —
  sin él el jugador se le atribuye en el reset a quien lo tiene HOY en vez de a
  quien lo regaló, y **los saldos iniciales de los dos salen mal**.
  caso real: Infanmafia cedió a Jonathan Asp Jensen (71343) a Mourinheiro el 1 ago.
- `purchase_price = 0` es la huella de un regalo. si no hay traspaso que lo
  explique, el jugador se deja **fuera** de la plantilla del reset (no se le puede
  atribuir a nadie) y `shortRosters` lo delata: en el reset todos reciben la misma
  cantidad de jugadores (15 en 26/27), así que quedarse corto significa que falta
  uno por atribuir y ese saldo inicial sale ALTO.

### contabilidad
- `max_bid = max(0, cash + 25% × valor_de_plantilla)`. el 25% es la deuda
  permitida; la deuda **sí** resta, pero el resultado se acota en 0 porque no
  existe la capacidad de compra negativa. la "deuda máxima" que muestra el mercado
  es la capacidad **restante**, que además descuenta las pujas comprometidas
  (`remaining_now`): techo 10.56M − 1.33M comprometido = 9.23M observado.
- el presupuesto **sí es uniforme** (200M), pero el **saldo inicial NO**: cada uno
  arranca con `200M − valor de la plantilla que le tocó`. el historial lo parte en
  "Saldo inicial" + "Ajuste de balance por reinicio de liga"; el ajuste no es un
  bonus, es el juego cuadrando el baseline a la valoración del día del reset. hay
  que **sumar los dos**: por separado ninguno cuadra.
- el feed **NO se pierde por scroll**: `POST /ajax/feed` lo pagina hasta el
  principio (`end=false&loading=false&offset=N&cardsPerPage=20`, el objeto
  `_FG_data.feed` que serializa jquery) y responde `status:"end"` al acabar. una
  temporada entera son ~12 páginas. `POST /api/sync/feed/backfill` recorre todo.
  contrastado contra el historial de balance propio: los 22 movimientos de compra
  y venta aparecen en el feed, sin faltar ni sobrar ninguno.
- el feed **no se corta en el reset de liga**: arrastra la cola de la temporada
  anterior, cuyos traspasos no cuentan. el instante del reset se saca del último
  movimiento `Bonificación` del balance propio (`getResetAt`) y lo anterior se
  marca `baseline = true`.
- categorías del feed: `transfer` (mueve dinero), `player_transfer` (traspaso REAL
  de laliga, **no** cuenta), `change_name`, `join`, `admin`, `market_unified`
  (snapshot del mercado con pujas: sin explotar todavía).
- los renombres de equipo ya **no** se mantienen a mano: las tarjetas `change_name`
  traen `previous_name`/`new_name` y alimentan solas `manager_alias`. hay que
  aplicarlas en orden cronológico ascendente; el feed se recorre al revés y si no
  el nombre que acaba ganando es el más antiguo.
- el json del feed trae `id_uc_from`/`id_uc_to` **numéricos**, así que la
  contabilidad no depende de casar nombres de equipo. es la razón de usarlo en vez
  de las tarjetas html.
- cualquier lógica temporal usa `occurredAt`, **no** `seenAt`: desde que hay
  backfill se registran eventos de hace días, y filtrar por «cuándo lo vimos»
  los colaba después de un ancla y los contaba dos veces.

## cómo: cambiar el schema

1. editar `packages/api/src/db/schema.ts`
2. `pnpm db:generate --name=<slug>`
3. revisar el sql generado (sqlite recrea tablas: validarlo aislado)
4. comprobar el `when` en `meta/_journal.json`: el migrador aplica por `when`
5. las migraciones se aplican solas al arrancar, dentro de `getDb()`
6. **nunca editar una migración ya commiteada**

## cómo: escribir muchas filas

**nunca un `insert().values(fila).run()` por vuelta de bucle**: drizzle prepara un
statement nuevo cada vez. cuando el poller de cláusulas pasó a barrer la liga
entera (~511 jugadores) eso eran >1000 statements por pasada, y finalizarlos
reventaba el binding nativo de better-sqlite3 **dentro del contenedor** con
`RemoveEnvironmentCleanupHook: Assertion (env) != nullptr` (en el host con tsx no
pasaba: solo crasheaba el build empaquetado). se agrupa con `chunked(rows, 50)` y
`values(chunk)`; 50 mantiene las variables por sentencia (19 columnas × 50 = 950)
por debajo del límite de sqlite. si añades una tabla ancha, revisa ese margen.

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

### diseño web (sistema de sis/duckhunt + identidad v1)

- tokens **canónicos** como los siblings (`--bg`, `--bg-card`, `--accent`,
  `--sp-1..6`...) más familias de dominio interpolables: `var(--pos-{1..4})`
  (posiciones) y `var(--heat-{bucket})` (calor de racha v1). el bloque `--ui-*`
  del final temiza `@platform/ui`.
- `app.css` trae reset, defaults de elemento (button/input/checkbox custom) y
  primitivas globales: `.data-table`, `.stats-grid`/`.stat-card`, `.card`,
  `.muted/.error/.note/.empty`. las páginas **no** redefinen nada de eso.
- el motivo skew de v1 vive en `lib/components/Chip.svelte` (color por
  `style:--c` con un token, variantes solid/tint/glass); `PositionTag`, `Trend`,
  `ManagerTag`, `PlayerCard` y `ManagerCard` componen sobre él.
- **dos entidades, dos tarjetas con la misma anatomía**: `PlayerCard` y
  `ManagerCard` comparten raíl izquierdo, centro con nombre y cifras, y dato
  fuerte a la derecha. una vista nueva compone estas tarjetas, no inventa una
  tercera forma de listar. `EventCard` envuelve a `PlayerCard` con la cabecera
  de quién/cuánto, y `RosterView` es el visor de plantillas que usan tanto
  `/managers` (liga entera) como `/managers/[id]`.
- una referencia a un mánager es SIEMPRE `ManagerTag`, nunca texto suelto: así
  cualquier nombre enlaza a su plantilla desde cualquier vista.
- shell: sidebar fija estilo sis en `routes/(app)/+layout.svelte` (colapso en
  `lib/state/sidebar.svelte.ts`); en ≤768px pasa a tabbar inferior. `/login`
  queda fuera del grupo `(app)` y por tanto sin shell.
- estado ui: runas a nivel de módulo en `lib/state/*.svelte.ts` con getters,
  nada de `svelte/store`.
- `lib/api.ts` usa `createHttp` de `@platform/ui/http` (OfflineError ≠ 401; el
  401 redirige a /login salvo estando ya allí).

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
- ✅ fase 3: dashboard de inteligencia (liga, actividad, ficha con gráfico)
- ✅ fase 4: paridad con v1 (tarjeta de jugador, filtros, visor de plantillas)
- ✅ fase 4.1: rediseño uniforme. tres secciones (liga / plantillas / actividad).
  la página de cláusulas **se eliminó**: su trabajo lo hace `/managers` con el
  visor en modo «toda la liga» (orden por cláusula + filtro «solo robables»).
  `/api/clauses` sigue viva **solo** para el mcp, no la consume la web.
- ⏳ fase 5: acciones de escritura en ui, push, capacitor

v2 ya **no** sincroniza (timer systemd desactivado). tampoco importa: el feed se
pagina hasta el principio, así que ningún hueco es irrecuperable.
