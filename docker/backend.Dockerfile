FROM node:24.16.0-bookworm-slim@sha256:2c87ef9bd3c6a3bd4b472b4bec2ce9d16354b0c574f736c476489d09f560a203 AS build

WORKDIR /workspace/apps/api
COPY apps/api/package.json apps/api/package-lock.json ./
COPY packages/transaction-parser /workspace/packages/transaction-parser
RUN npm ci --ignore-scripts
COPY apps/api/nest-cli.json apps/api/tsconfig.json apps/api/tsconfig.build.json ./
COPY apps/api/src ./src
RUN npm run build && npm prune --omit=dev --ignore-scripts --no-audit --no-fund

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:774b7d020b24214835769e24c3544835526cd0288f0b094eae48e8b2c2429a79 AS runtime-base

# ponytail: remove this pinned overlay when Distroless ships the OpenSSL and glibc security fixes.
FROM build AS runtime-security
COPY --from=runtime-base /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
RUN printf 'deb https://security.debian.org/debian-security trixie-security main\ndeb https://deb.debian.org/debian trixie main\n' > /tmp/security.list \
  && apt-get -o Dir::Etc::sourcelist=/tmp/security.list -o Dir::Etc::sourceparts=- update \
  && cd /tmp \
  && apt-get -o Dir::Etc::sourcelist=/tmp/security.list -o Dir::Etc::sourceparts=- download libssl3t64=3.5.7-1~deb13u3 openssl-provider-legacy=3.5.7-1~deb13u3 libc6=2.41-12+deb13u4 \
  && mkdir -p /patched/var/lib/dpkg/status.d \
  && for package in ./*.deb; do \
       dpkg-deb --extract "$package" /patched; \
       name="$(dpkg-deb --field "$package" Package)"; \
       dpkg-deb --field "$package" > "/patched/var/lib/dpkg/status.d/$name"; \
       printf 'Status: install ok installed\n' >> "/patched/var/lib/dpkg/status.d/$name"; \
       dpkg-deb --ctrl-tarfile "$package" | tar -xOf - ./md5sums > "/patched/var/lib/dpkg/status.d/$name.md5sums"; \
     done

FROM runtime-base

COPY --from=runtime-security /patched/ /
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=65532:65532 /workspace/apps/api/dist ./dist/src
COPY --from=build --chown=65532:65532 /workspace/apps/api/node_modules ./node_modules
COPY --from=build --chown=65532:65532 /workspace/packages/transaction-parser /packages/transaction-parser
COPY --chown=65532:65532 apps/mobile/assets/fonts/NotoSansArabicUI-Regular.ttf ./assets/fonts/NotoSansArabicUI-Regular.ttf
COPY --chown=65532:65532 supabase/migrations ./supabase/migrations
COPY --chown=65532:65532 supabase/migration-checksums.sha256 ./supabase/migration-checksums.sha256
USER 65532:65532
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=2s --start-period=10s --retries=3 \
  CMD ["/nodejs/bin/node", "dist/src/platform/health/container-healthcheck.js"]
CMD ["dist/src/main.js"]
