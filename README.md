# fantasy

companion de [fantasy marca](https://fantasy.marca.com): contabilidad de rivales,
seguimiento de cláusulas e inteligencia de mercado.

reescritura (v3) sobre el stack compartido `platform`: api hono + spa sveltekit +
sqlite, un solo proceso.

```bash
git clone --recurse-submodules <repo>
pnpm install
cp .env.example .env    # añadir FANTASY_REFRESH_TOKEN
pnpm dev
```

ver `CLAUDE.md` para la arquitectura y el conocimiento de dominio acumulado.
