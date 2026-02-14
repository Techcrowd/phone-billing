FROM node:22-slim

RUN apt-get update && apt-get install -y fonts-dejavu-core && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production=false

COPY . .
RUN npm run build

RUN mkdir -p /app/uploads

EXPOSE 4250

CMD ["node", "dist/server.js"]
