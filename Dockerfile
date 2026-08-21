# Static build of the documentation site, served by nginx.
#
#   docker build -t maybloom-stack-site .
#   docker run --rm -p 8080:80 maybloom-stack-site
#
# CI builds this on every push to main and pushes it to
# ghcr.io/maybloomtech/maybloom-stack, so a deployment can pull a tag rather
# than build from source. Nothing here still assumes a particular host: how
# the image is served, and on whose machine, remains the operator's business.
FROM node:24-alpine AS build

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY site/package.json site/package.json

RUN pnpm install --frozen-lockfile --ignore-scripts

# The site renders docs/ through a content collection, so both trees are
# build inputs.
COPY docs docs
COPY site site

# Optional analytics, supplied at build time and committed nowhere. Leave them
# unset and the site ships with no tracking tag at all.
ARG PUBLIC_ANALYTICS_SCRIPT_URL=""
ARG PUBLIC_ANALYTICS_SITE_ID=""
ENV PUBLIC_ANALYTICS_SCRIPT_URL=$PUBLIC_ANALYTICS_SCRIPT_URL
ENV PUBLIC_ANALYTICS_SITE_ID=$PUBLIC_ANALYTICS_SITE_ID

RUN pnpm --filter @maybloom-tech/stack-site build

FROM nginx:1.27-alpine AS runner

COPY --from=build /app/site/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
