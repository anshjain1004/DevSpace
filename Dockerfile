# ---- Build the React client ----
FROM node:24-slim AS build
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- Run the server, serving the built client on the same origin ----
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
COPY server/package*.json ./server/
RUN npm ci --prefix server --omit=dev
COPY server/ ./server/
COPY --from=build /app/client/dist ./client/dist
EXPOSE 4000
CMD ["node", "server/index.js"]
