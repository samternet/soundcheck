FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
RUN apk add --no-cache python3 make g++ tzdata && npm ci --omit=dev && apk del python3 make g++
COPY --from=build /app/dist ./dist
RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 4000
CMD ["node","dist/index.js"]
