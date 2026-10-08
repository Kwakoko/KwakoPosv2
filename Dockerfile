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

# Reconstruct the release manifest inside the build from immutable Cloud Build substitutions.
# The generated root manifest is intentionally excluded from the upload context because it must not be committed.
RUN node -e "const fs=require('fs'); const version=process.argv[1]; const gitSha=process.argv[2]; if(!version||!/^\\d+\\.\\d+\\.\\d+$/.test(version)||!/^[0-9a-f]{40}$/.test(gitSha)){throw new Error('RELEASE_MANIFEST_BUILD_INPUT_INVALID')} fs.writeFileSync('/app/release-manifest.json',JSON.stringify({version,tag:'v'+version,gitSha,environment:'production-certification',releaseChannel:'production',releasedAt:new Date().toISOString(),containerDigest:null,cloudRunRevision:null,certification:'PENDING',compatibility:{databaseSchemaVersion:4,syncProtocolVersion:2,pwaSchemaVersion:7,minSupportedClientVersion:'2.0.0',recommendedClientVersion:version}},null,2))" "$RELEASE_VERSION" "$RELEASE_GIT_SHA"

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

# Launch the single canonical API server implementation. Authentication and
# production hardening are registered directly in server.ts.
CMD ["node", "apps/api/dist/apps/api/src/server.js"]
