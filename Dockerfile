FROM node:20-bookworm-slim AS build

WORKDIR /app

ARG RELEASE_GIT_SHA
ARG RELEASE_VERSION
LABEL org.opencontainers.image.revision="$RELEASE_GIT_SHA"
LABEL org.opencontainers.image.version="$RELEASE_VERSION"
LABEL org.opencontainers.image.source="https://github.com/Kwakoko/KwakoPosv2"

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
COPY tests ./tests
COPY src ./src
COPY .env.example ./

RUN npm install --include=dev

RUN mkdir -p /usr/local/bin && \
    ln -sf /app/node_modules/.bin/tsc /usr/local/bin/tsc && \
    ln -sf /app/node_modules/.bin/tsx /usr/local/bin/tsx

RUN npm run db:generate
RUN npm run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

ARG RELEASE_GIT_SHA
ARG RELEASE_VERSION
LABEL org.opencontainers.image.revision="$RELEASE_GIT_SHA"
LABEL org.opencontainers.image.version="$RELEASE_VERSION"
LABEL org.opencontainers.image.source="https://github.com/Kwakoko/KwakoPosv2"

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

COPY --from=build /app/package.json /app/package-lock.json /app/tsconfig.base.json /app/tsconfig.json ./
COPY --from=build /app/apps ./apps
COPY --from=build /app/packages ./packages
COPY --from=build /app/node_modules ./node_modules

EXPOSE 8080

CMD ["sh", "-c", "if [ -f apps/api/dist/server.js ]; then node apps/api/dist/server.js; elif [ -f apps/api/dist/src/server.js ]; then node apps/api/dist/src/server.js; else node apps/api/dist/apps/api/src/server.js; fi"]
