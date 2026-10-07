# Imagem única para deploy (Render, Railway, Fly...): a API Express também serve o front compilado.
# Para desenvolvimento local continue usando o docker-compose.yml.

FROM node:20-alpine AS front
WORKDIR /front
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:20-alpine AS back
WORKDIR /back
COPY backend/package*.json ./
RUN npm ci
COPY backend/tsconfig*.json ./
COPY backend/src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production STATIC_DIR=/app/public PORT=3001
COPY --from=back /back/package.json ./
COPY --from=back /back/node_modules ./node_modules
COPY --from=back /back/dist ./dist
COPY --from=front /front/dist ./public
EXPOSE 3001
USER node
CMD ["node", "dist/index.js"]
