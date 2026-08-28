FROM node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203 AS build

WORKDIR /workspace/apps/api
COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci --ignore-scripts
COPY apps/api/nest-cli.json apps/api/tsconfig.json apps/api/tsconfig.build.json ./
COPY apps/api/src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:774b7d020b24214835769e24c3544835526cd0288f0b094eae48e8b2c2429a79

WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=65532:65532 /workspace/apps/api/dist ./dist/src
COPY --from=build --chown=65532:65532 /workspace/apps/api/node_modules ./node_modules
COPY --chown=65532:65532 supabase/migrations ./supabase/migrations
COPY --chown=65532:65532 supabase/migration-checksums.sha256 ./supabase/migration-checksums.sha256
USER 65532:65532
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=2s --start-period=10s --retries=3 \
  CMD ["/nodejs/bin/node", "dist/src/platform/health/container-healthcheck.js"]
CMD ["dist/src/main.js"]
