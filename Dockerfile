# Empacotamento alternativo do MESMO processo único (ver docs/plano/fundamentos/03-arquitetura.md §3.13).
# Build: docker build -t vinimon .   Migração (antes de subir a imagem final): ver docs/operacao.md.
#
# Rede com proxy que re-cifra o TLS: passe o bundle de CA públicas como secret, sem desligar a verificação:
#   docker build --secret id=ca_proxy,src=/caminho/ca-bundle.crt -t vinimon .
# Sem o secret, o mount é ignorado (required=false) e o build usa só as CAs da imagem.

# Imagem base fixada por digest (índice multi-arquitetura de node:24-bookworm-slim).
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205

FROM ${NODE_IMAGE} AS base

# pnpm 12.14.0 é instalado com npm, e não com corepack: o corepack não consegue ativar essa
# versão neste ambiente, porque o pacote não traz bin/pnpm.cjs.

FROM base AS build
ENV NODE_EXTRA_CA_CERTS=/run/secrets/ca_proxy
RUN --mount=type=secret,id=ca_proxy,required=false npm install -g pnpm@12.14.0
WORKDIR /app
COPY . .
RUN --mount=type=secret,id=ca_proxy,required=false pnpm install --frozen-lockfile
RUN --mount=type=secret,id=ca_proxy,required=false pnpm build

# Dependências de produção do pacote @vinimon/api (sem o CLI do prisma, que é devDependency).
FROM build AS prod
RUN --mount=type=secret,id=ca_proxy,required=false pnpm deploy --filter @vinimon/api --prod /out

# Migrações: roda com DATABASE_URL do papel vinimon_migrator. Não é a imagem final.
FROM build AS migrar
CMD ["pnpm", "-F", "@vinimon/api", "db:deploy"]

# Imagem final: sem código-fonte, sem devDependencies e sem o CLI do prisma.
FROM base AS final
ENV NODE_ENV=production
ENV WEB_DIST_DIR=/app/web/dist
WORKDIR /app/api
COPY --from=prod /out/package.json /app/api/package.json
COPY --from=prod /out/node_modules /app/api/node_modules
COPY --from=build /app/apps/api/dist /app/api/dist
COPY --from=build /app/apps/api/prisma /app/api/prisma
COPY --from=build /app/apps/web/dist /app/web/dist
RUN mkdir -p /data/anexos && chown node:node /data/anexos
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/saude').then(r=>process.exit(r.ok?0:1))"
CMD ["node", "--enable-source-maps", "dist/server.mjs"]
