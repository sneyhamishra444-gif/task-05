FROM node:20-alpine AS base
WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npx tsc -p tsconfig.json --outDir dist

EXPOSE 3000

CMD ["sh", "-c", "node dist/src/db/migrate.js && node dist/src/server.js"]
