FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/client ./client
COPY --from=build /app/postcss.config.js ./postcss.config.js
COPY --from=build /app/tailwind.config.ts ./tailwind.config.ts
COPY --from=build /app/vite.config.ts ./vite.config.ts
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
