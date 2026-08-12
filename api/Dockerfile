FROM node:24.13.0-alpine AS build

WORKDIR /app

COPY package.json yarn.lock .yarnrc.yml ./
COPY api/package.json api/package.json
COPY games games
COPY packages packages
RUN corepack enable && yarn install --immutable

COPY api api
RUN yarn workspace @game-hub/api build \
  && yarn workspaces focus @game-hub/api --production

FROM node:24.13.0-alpine

ENV NODE_ENV=production
ENV PORT=8080

WORKDIR /app

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/api/package.json ./api/package.json
COPY --from=build --chown=node:node /app/api/dist ./api/dist

USER node
EXPOSE 8080

CMD ["node", "api/dist/main.js"]
