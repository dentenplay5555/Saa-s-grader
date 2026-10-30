# Build from the repo root:  docker build -f deploy/app/Dockerfile -t dsa-academy .
FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production DB_PATH=/data/data.db PORT=3000
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/dist dist
COPY --from=build /app/package.json /app/schema.sql /app/schema.appendix.sql ./
RUN mkdir /data && chown node:node /data
VOLUME /data
EXPOSE 3000
USER node
CMD ["node", "dist/server/index.js"]
