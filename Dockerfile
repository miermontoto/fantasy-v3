FROM node:24-trixie-slim AS build
RUN npm install -g pnpm@10
WORKDIR /app

# dependencias de compilación para better-sqlite3
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# el scraper invoca curl como subproceso (igual que v2). la base es trixie por
# su curl 8.x: cloudflare hace fingerprinting del handshake tls y rechaza tanto
# el curl 7.88 de bookworm como el fetch nativo de node (ambos dan 403).
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# instalar dependencias (platform/ = submodule con los paquetes @platform/* en fuente ts)
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
COPY packages/shared/package.json packages/shared/
COPY platform/ platform/
RUN pnpm install --frozen-lockfile

# copiar código fuente
COPY . .

# build frontend → static → api
RUN pnpm --filter @fantasy/web build \
    && mkdir -p packages/api/static \
    && cp -r packages/web/build/. packages/api/static/ \
    && pnpm --filter @fantasy/api build

# --- producción ---
FROM node:24-trixie-slim AS production
WORKDIR /app/packages/api

RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# copiar estructura necesaria (sin build tools)
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/packages/api/node_modules node_modules
COPY --from=build /app/packages/api/dist dist
COPY --from=build /app/packages/api/static static

RUN mkdir -p /app/data

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/api/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
