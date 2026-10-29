FROM node:20-alpine

# build tools for better-sqlite3 native bindings; tzdata so SQLite 'localtime' honors TZ
RUN apk add --no-cache python3 make g++ tzdata

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p /data

ENV NODE_ENV=production
ENV DB_PATH=/data/energy.db

EXPOSE 3000

CMD ["node", "app.js"]
