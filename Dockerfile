# Agent Sean. Bind is 0.0.0.0 *inside* the container only so -p works.
# docker-compose publishes 127.0.0.1:7777:7777. The entrypoint refuses to
# start without SEAN_AUTH_TOKEN (>= 32 chars). Playwright/Chromium is not
# baked in — first JS render fetches it, matching the no-postinstall rule.
FROM node:22.19-bookworm-slim@sha256:4a4884e8a44826194dff92ba316264f392056cbe243dcc9fd3551e71cea02b90

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    SEAN_HOME=/data \
    SEAN_HOST=0.0.0.0 \
    SEAN_PORT=7777 \
    NODE_ENV=production

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages ./packages
COPY plugins ./plugins
COPY install ./install

RUN corepack enable \
  && corepack prepare pnpm@10.15.1 --activate \
  && pnpm install --frozen-lockfile \
  && pnpm --filter @agentsean/dashboard build \
  && pnpm --filter agentsean... build \
  && mkdir -p /data \
  && chmod 700 /data

COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

VOLUME ["/data"]
EXPOSE 7777
ENTRYPOINT ["/entrypoint.sh"]
