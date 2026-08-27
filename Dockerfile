FROM node:20-bookworm-slim AS build

WORKDIR /app

# Prisma requires OpenSSL in the build/runtime images.
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


# Keep devDependencies in the builder so TypeScript, tsx and Prisma tooling are available.
RUN npm install --include=dev

# Make TypeScript available globally for workspace packages
# Link tsc to a location in PATH so workspace scripts can find it
RUN mkdir -p /usr/local/bin && \
    ln -sf /app/node_modules/.bin/tsc /usr/local/bin/tsc && \
    ln -sf /app/node_modules/.bin/tsx /usr/local/bin/tsx

RUN npm run db:generate
RUN npm run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

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

CMD ["node", "apps/api/dist/server.js"]
