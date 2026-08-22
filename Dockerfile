# Build context is the repository root: the server type-checks against the
# frontend's canonical WorldEvent schema (src/types.ts).

FROM node:22-alpine AS build
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci
COPY src/types.ts ./src/types.ts
COPY server ./server
RUN cd server && npm run build

FROM node:22-alpine
WORKDIR /app/server
ENV NODE_ENV=production PORT=8080 COOPS_DATA_DIR=/data
RUN mkdir -p /data && chown -R node:node /data
COPY --from=build /app/server/dist ./dist
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
EXPOSE 8080
USER node
VOLUME ["/data"]
CMD ["node", "dist/server/src/index.js"]
