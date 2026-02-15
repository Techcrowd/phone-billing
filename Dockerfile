# Stage 1: Build frontend
FROM node:22-slim AS frontend-build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ .
RUN npx ng build --configuration=production

# Stage 2: Build backend
FROM node:22-slim AS backend-build
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm install --production=false
COPY backend/ .
RUN npm run build

# Stage 3: Runtime
FROM node:22-slim
RUN apt-get update && apt-get install -y fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=backend-build /app/package.json /app/package-lock.json* ./
RUN npm install --omit=dev
COPY --from=backend-build /app/dist ./dist
COPY --from=frontend-build /app/dist/frontend/browser ./public
RUN mkdir -p /app/uploads
EXPOSE 4250
CMD ["node", "dist/server.js"]
