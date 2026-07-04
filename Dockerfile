# ---------- Build stage ----------
FROM node:20-slim AS build
WORKDIR /app

COPY package.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm install

COPY . .
RUN npm run build && npm prune --omit=dev

# ---------- Runtime stage ----------
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/node_modules ./server/node_modules
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/migrations ./server/migrations
COPY --from=build /app/client/dist ./client/dist
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/package.json ./package.json

RUN mkdir -p /app/data /app/uploads

EXPOSE 3000
CMD ["node", "server/dist/main.js"]
