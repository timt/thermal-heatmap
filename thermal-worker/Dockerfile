FROM node:22-alpine
WORKDIR /app

# Install worker deps. tsx stays at runtime because Prisma 7's generated
# client uses extensionless ESM imports + import.meta, which neither plain
# `node` nor a tsc-compiled bundle can handle.
COPY thermal-worker/package.json thermal-worker/package-lock.json* ./
RUN npm install --no-audit --no-fund

# Shared Prisma schema, then generate the worker client. The schema's
# output path is relative to itself (../thermal-worker/generated/prisma),
# so inside Docker it lands at /app/thermal-worker/generated/. Move it to
# /app/generated/ so src/db.ts's import ("../generated/prisma/client.ts")
# resolves.
COPY prisma ./prisma
RUN npx prisma generate --schema=./prisma/schema.prisma \
    && mv thermal-worker/generated generated

# App source
COPY thermal-worker/src ./src
COPY thermal-worker/tsconfig.json ./tsconfig.json

# Typecheck at build time so a broken push fails the deploy
RUN npx tsc --noEmit

ENV NODE_ENV=production
EXPOSE 8080
CMD ["npx", "tsx", "src/index.ts"]
