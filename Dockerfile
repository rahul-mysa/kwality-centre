FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY src/ ./src/
COPY public/ ./public/
COPY tsconfig.json ./
COPY drizzle.config.ts ./

RUN mkdir -p uploads

EXPOSE 3000

CMD ["npm", "start"]
